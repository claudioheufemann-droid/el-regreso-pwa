'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check, CloudOff, MessageCircle, Image as ImageIcon, MapPin, Loader2 } from 'lucide-react'
import { notificar } from '@/lib/notificar'
import { upsertOrQueue } from '@/lib/offlineQueue'
import { uploadConTimeout } from '@/lib/offlinePhotoQueue'
import { hapticExito } from '@/lib/haptics'
import { createClient } from '@/lib/supabase/client'
import { catalogoParaVendedor, fmtPrecioCLP } from '@/lib/catalogo-productos'
import { dentroDeGeofence } from '@/lib/geo'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AppUser } from '@/lib/auth'
import { C, TAP } from '../theme'
import PasoCliente, { type ClienteExistente, type NuevoClienteDetalle } from './PasoCliente'
import PasoVenta, { type CierrePayload } from './PasoVenta'
import HojaFotosVisita from './HojaFotosVisita'
import { SLOTS_FOTO, CAMPO_DE_SLOT, type SlotFoto } from '@/lib/fotosVisita'
import {
  setCatalogo, WhatsAppCatalogoModal, VentaImageModal,
  type ItemCarrito,
} from './piezas'

/**
 * Venta en terreno — flujo de DOS pasos: cliente → venta.
 *
 * Antes eran cuatro pantallas (cliente → check-in GPS → "Vista 360°" →
 * catálogo/cierre), y hasta el 2026-08-06 hubo una versión de TRES con un
 * check-in intermedio que exigía la foto de la fachada para poder vender.
 * Se revirtió el 2026-08-07 (pedido de Claudio): ahora NINGUNA foto frena
 * la venta — las 4 (frontis, interior, exhibición, competencia) se piden
 * recién al cerrar la visita, y son opcionales incluso ahí. Si el
 * vendedor cierra sin subirlas, puede completarlas después desde el
 * Historial; mientras falte alguna, un cron le recuerda cada hora
 * (app/api/cron/fotos-pendientes).
 *
 * La ubicación sigue siendo automática — no hay botón, se toma sola en
 * cuanto se confirma el cliente (capturarUbicacion) — así que sacar el
 * check-in como pantalla no le quita nada al GPS.
 *
 * Qué más se eliminó y por qué NO se perdió información:
 *  - "Vista 360°": mostraba deuda e historial antes de dejar vender. La
 *    deuda ahora es un aviso plegable arriba de la venta, que es donde
 *    realmente sirve — al decidir si se le vende y cómo cobra.
 */

interface Producto { producto: string; categoria_producto: string | null; envase: string | null }

interface VisitaRetomada {
  id: string
  cliente_nombre: string
  es_cliente_nuevo: boolean
  lat: number | null
  lng: number | null
  direccion_gps: string | null
  estado?: string
  foto_exterior?: string | null
  foto_interior?: string | null
  foto_exhibicion?: string | null
  foto_competencia?: string | null
}

interface DeudorInfo {
  nombre_fantasia: string
  saldo_total: number
  deuda_vencida: number
  ultimo_pago: string | null
  fecha_ultima_compra: string | null
  limite_cta_cte: number | null
}

interface Props {
  vendedor: AppUser
  clientesExistentes: ClienteExistente[]
  catalogoProductos: Producto[]
  visitaRetomada?: VisitaRetomada | null
  deudores?: DeudorInfo[]
  clientePre?: string | null
}

export default function NuevaVisitaClient({
  vendedor, clientesExistentes, visitaRetomada, clientePre = null,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Lista de precios: Santiago tiene la suya (ver EMAIL_LISTA_PRECIOS_SANTIAGO).
  const catalogo = catalogoParaVendedor(vendedor.email)
  setCatalogo(catalogo)

  const [cliente, setCliente] = useState<{ nombre: string; esNuevo: boolean } | null>(
    visitaRetomada ? { nombre: visitaRetomada.cliente_nombre, esNuevo: visitaRetomada.es_cliente_nuevo } : null
  )
  const [visitaId, setVisitaId] = useState<string | null>(visitaRetomada?.id ?? null)
  const [carrito, setCarrito] = useState<Map<string, ItemCarrito>>(new Map())
  const [guardando, setGuardando] = useState(false)
  const [syncPendiente, setSyncPendiente] = useState(false)
  // Fotos por slot fijo — ninguna bloquea el paso a vender; se piden recién al cerrar.
  const [fotos, setFotos] = useState<Partial<Record<SlotFoto, string>>>({
    ...(visitaRetomada?.foto_exterior ? { exterior: visitaRetomada.foto_exterior } : {}),
    ...(visitaRetomada?.foto_interior ? { interior: visitaRetomada.foto_interior } : {}),
    ...(visitaRetomada?.foto_exhibicion ? { exhibicion: visitaRetomada.foto_exhibicion } : {}),
    ...(visitaRetomada?.foto_competencia ? { competencia: visitaRetomada.foto_competencia } : {}),
  })
  const [subiendoFoto, setSubiendoFoto] = useState<Partial<Record<SlotFoto, boolean>>>({})
  const [gpsEstado, setGpsEstado] = useState<'buscando' | 'ok' | 'error'>(visitaRetomada?.lat ? 'ok' : 'buscando')
  const [showCatalogoWA, setShowCatalogoWA] = useState(false)
  const [showImagen, setShowImagen] = useState(false)
  const [pendingCierre, setPendingCierre] = useState<CierrePayload | null>(null)

  const fileCameraRef = useRef<HTMLInputElement>(null)
  const fileGaleriaRef = useRef<HTMLInputElement>(null)
  const slotPendienteRef = useRef<SlotFoto>('exterior')
  const jornadaIdRef = useRef<string | null>(null)
  const clienteCoordsRef = useRef<{ lat: number; lng: number } | null>(null)
  const visitaDraft = useRef<Record<string, unknown>>(
    visitaRetomada ? {
      id: visitaRetomada.id, vendedor_id: vendedor.id,
      cliente_nombre: visitaRetomada.cliente_nombre, es_cliente_nuevo: visitaRetomada.es_cliente_nuevo,
      estado: visitaRetomada.estado,
      ...(visitaRetomada.lat ? { lat: visitaRetomada.lat, lng: visitaRetomada.lng, direccion_gps: visitaRetomada.direccion_gps } : {}),
    } : {}
  )

  useEffect(() => {
    fetch('/api/terreno/jornada')
      .then(r => r.json())
      .then(j => { jornadaIdRef.current = j?.id ?? null })
      .catch(() => {})
  }, [])

  /** Guarda el draft completo: cada escritura lleva TODOS los campos conocidos,
   *  así un reintento offline en cualquier orden nunca pisa un campo con null. */
  function guardarDraft(extra: Record<string, unknown>) {
    visitaDraft.current = { ...visitaDraft.current, ...extra }
    setSyncPendiente(true)
    upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current).then(r => setSyncPendiente(!r.ok))
  }

  /**
   * Ubicación en segundo plano — reemplaza al paso de check-in. Si el GPS
   * falla o el usuario no da permiso, la visita sigue igual: perder la
   * ubicación no puede impedir tomar un pedido.
   */
  function capturarUbicacion(id: string) {
    setGpsEstado('buscando')
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setGpsEstado('error'); return }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const { latitude: lat, longitude: lng } = pos.coords
        let addr = ''
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`)
          if (r.ok) addr = (await r.json())?.display_name ?? ''
        } catch { /* sin dirección: se guardan igual las coordenadas */ }

        let geofence: Record<string, unknown> = {}
        if (clienteCoordsRef.current) {
          const { dentro, distanciaM } = dentroDeGeofence(lat, lng, clienteCoordsRef.current.lat, clienteCoordsRef.current.lng)
          geofence = { distancia_cliente_m: Math.round(distanciaM), dentro_geofence: dentro }
        }
        guardarDraft({ id, lat, lng, direccion_gps: addr, ...geofence })
        setGpsEstado('ok')
      },
      () => setGpsEstado('error'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 },
    )
  }

  function onClienteConfirmado(nombre: string, esNuevo: boolean, canal: string, detalle?: NuevoClienteDetalle) {
    setCliente({ nombre, esNuevo })
    const id = crypto.randomUUID()
    setVisitaId(id)

    const c = clientesExistentes.find(x => x.nombre_fantasia?.toLowerCase().trim() === nombre.toLowerCase().trim())
    clienteCoordsRef.current = (c?.lat != null && c?.lng != null)
      ? { lat: c.lat, lng: c.lng }
      : (detalle?.lat != null && detalle?.lng != null) ? { lat: detalle.lat, lng: detalle.lng } : null

    let clienteTerrenoId: string | null = null
    if (esNuevo && detalle) {
      clienteTerrenoId = crypto.randomUUID()
      upsertOrQueue(supabase, 'clientes_terreno', {
        id: clienteTerrenoId,
        nombre_fantasia: nombre,
        direccion: detalle.direccion || null,
        lat: detalle.lat, lng: detalle.lng,
        contacto: detalle.contacto || null,
        telefono: detalle.contacto || null,
        rut: detalle.rut || null,
        canal,
        creado_por: vendedor.id,
      })
    }

    visitaDraft.current = {
      id, vendedor_id: vendedor.id, cliente_nombre: nombre, es_cliente_nuevo: esNuevo,
      estado: 'en_progreso', jornada_id: jornadaIdRef.current,
      ...(clienteTerrenoId ? { cliente_terreno_id: clienteTerrenoId } : {}),
    }
    setSyncPendiente(true)
    upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current).then(r => setSyncPendiente(!r.ok))
    capturarUbicacion(id)
  }

  // Pedido rápido: ?cliente=Nombre (desde misiones o detalle de cliente).
  const pedidoRapidoRef = useRef(false)
  useEffect(() => {
    if (pedidoRapidoRef.current || !clientePre || visitaRetomada || cliente) return
    pedidoRapidoRef.current = true
    const c = clientesExistentes.find(x => x.nombre_fantasia?.toLowerCase().trim() === clientePre.toLowerCase().trim())
    onClienteConfirmado(clientePre, !c, c?.categoria_negocio ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientePre])

  function subirFoto(file: File, slot: SlotFoto) {
    if (!visitaId) return
    setSubiendoFoto(prev => ({ ...prev, [slot]: true }))
    setFotos(prev => ({ ...prev, [slot]: URL.createObjectURL(file) }))
    const campo = CAMPO_DE_SLOT[slot]
    const vId = visitaId
    uploadConTimeout(
      supabase,
      { bucket: 'terreno-fotos', path: `${vId}/${slot}.jpg`, table: 'visitas_terreno', rowId: vId, campo },
      file,
    ).then(url => {
      setSubiendoFoto(prev => ({ ...prev, [slot]: false }))
      if (!url) return
      visitaDraft.current = { ...visitaDraft.current, [campo]: url }
      upsertOrQueue(supabase, 'visitas_terreno', { id: vId, [campo]: url })
    })
  }

  function abrirCamaraPara(slot: SlotFoto) {
    slotPendienteRef.current = slot
    fileCameraRef.current?.click()
  }

  function abrirGaleriaPara(slot: SlotFoto) {
    slotPendienteRef.current = slot
    fileGaleriaRef.current?.click()
  }

  // Las 4 fotos son opcionales — ninguna bloquea el cierre, pero si falta
  // alguna se le ofrece tomarla antes de cerrar (ver HojaFotosVisita).
  const fotosFaltantes = SLOTS_FOTO.filter(s => !fotos[s.key]).map(s => s.key)

  function onCerrarIntentado(p: CierrePayload) {
    if (fotosFaltantes.length > 0) { setPendingCierre(p); return }
    ejecutarCierre(p)
  }

  async function ejecutarCierre(p: CierrePayload) {
    if (!visitaId) return
    setPendingCierre(null)
    setGuardando(true)
    try {
      const total = p.items.reduce((s, i) => s + i.cantidad * i.precio, 0)

      visitaDraft.current = {
        ...visitaDraft.current,
        id: visitaId,
        tiene_venta: p.tienVenta,
        motivo_sin_venta: p.tienVenta ? null : p.motivo,
        observaciones: p.observaciones || null,
        total_pedido: total,
        estado: 'completada',
        completada_at: new Date().toISOString(),
        metodo_pago: p.metodoPago,
        dias_credito: p.diasCredito,
        fecha_pago_estimada: p.fechaPagoEstimada,
        fotos_status: SLOTS_FOTO.every(s => fotos[s.key]) ? 'COMPLETO' : 'PENDIENTE',
      }
      const rVisita = await upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current)

      let itemsPendientes = false
      if (p.items.length > 0) {
        const res = await Promise.all(p.items.map(i => upsertOrQueue(supabase, 'visitas_terreno_items', {
          id: crypto.randomUUID(), visita_id: visitaId,
          producto: i.producto, categoria: i.categoria, envase: i.envase,
          cantidad: i.cantidad, precio_unit: i.precio, subtotal: i.cantidad * i.precio,
        })))
        itemsPendientes = res.some(r => r.queued)
      }

      // CRM: alimenta la Agenda del vendedor. Sólo existe si lo agendó a
      // mano — ya no es un paso obligatorio del cierre.
      if (p.seguimiento) {
        await upsertOrQueue(supabase, 'seguimientos', {
          id: crypto.randomUUID(), visita_id: visitaId, vendedor_id: vendedor.id,
          cliente_nombre: cliente?.nombre ?? '', tipo_accion: p.seguimiento.tipo,
          fecha_hora_compromiso: `${p.seguimiento.fecha}T09:00:00`,
          nota: p.observaciones || null, estado: 'pendiente',
        })
      }

      setSyncPendiente(!rVisita.ok || itemsPendientes)

      if (p.tienVenta) {
        hapticExito()
        const bodyPago = p.metodoPago === 'credito' && p.fechaPagoEstimada
          ? ` · Crédito, cobrar el ${format(new Date(p.fechaPagoEstimada + 'T12:00:00'), "d 'de' MMMM", { locale: es })}`
          : ''
        notificar({
          event: 'visita_completada',
          title: `✅ Venta en ${cliente?.nombre ?? 'local'}`,
          body: `${fmtPrecioCLP(total)} · ${p.items.length} producto${p.items.length !== 1 ? 's' : ''}${bodyPago}`,
          url: '/terreno/historial',
        })
      } else if (p.motivo) {
        notificar({
          event: 'visita_sin_venta',
          title: `📍 Visita sin venta — ${cliente?.nombre ?? 'local'}`,
          body: p.motivo,
          url: '/terreno/historial',
        })
      }

      router.push('/terreno?cierre=1')
    } finally {
      setGuardando(false)
    }
  }

  async function cancelar() {
    if (!cliente) { router.push('/terreno'); return }
    if (!window.confirm('¿Cancelar esta visita?')) return
    if (visitaId) {
      visitaDraft.current = { ...visitaDraft.current, id: visitaId, estado: 'cancelada', completada_at: new Date().toISOString() }
      await upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current)
    }
    router.push('/terreno')
  }

  const items = Array.from(carrito.values())
  const etapa = !cliente ? 'cliente' : 'venta'

  function onFileElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) subirFoto(f, slotPendienteRef.current)
    e.target.value = ''
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(170px, calc(env(safe-area-inset-bottom, 0px) + 150px))' }}>
      {/* Dos inputs — uno fuerza la cámara trasera, el otro abre el selector
          normal del teléfono (galería). No hay atributo HTML que signifique
          "solo galería", así que esto es lo más cerca que se puede llegar
          a las dos opciones explícitas que pidió Claudio. */}
      <input ref={fileCameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFileElegido} />
      <input ref={fileGaleriaRef} type="file" accept="image/*" hidden onChange={onFileElegido} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px' }}>
        {/* Encabezado — sticky: en el paso de venta el catálogo es largo y
            sin esto "Volver" desaparecía apenas se hacía scroll buscando
            un producto. */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: C.bg, margin: '0 -16px', padding: '20px 16px 14px',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <button
            onClick={() => cliente ? cancelar() : router.push('/terreno')}
            aria-label="Volver"
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 38, cursor: 'pointer',
              background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
              padding: '7px 14px 7px 10px', color: C.blue, fontSize: 13, fontWeight: 700,
            }}
          >
            <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
            Volver
          </button>

          <div style={{ flex: 1 }} />

          {etapa === 'venta' && (
            <>
              <button
                onClick={() => setShowCatalogoWA(true)}
                aria-label="Enviar catálogo por WhatsApp"
                style={{
                  width: TAP, height: TAP, borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${C.line}`, background: C.card,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                <MessageCircle size={18} color="#25D366" />
              </button>
              {items.length > 0 && (
                <button
                  onClick={() => setShowImagen(true)}
                  aria-label="Imagen del pedido"
                  style={{
                    width: TAP, height: TAP, borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${C.line}`, background: C.card,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  <ImageIcon size={18} color={C.muted} />
                </button>
              )}
            </>
          )}
        </div>

        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>
            {etapa === 'cliente' ? 'PASO 1 DE 2' : 'PASO 2 DE 2 · VENTA'}
          </p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.2 }}>
            {cliente ? cliente.nombre : '¿A quién le vendes?'}
          </h1>
          {cliente && (
            <p style={{ fontSize: 12.5, color: C.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {cliente.esNuevo && (
                <span style={{ background: C.blueSoft, color: C.blue, fontWeight: 700, borderRadius: 6, padding: '1px 6px', fontSize: 11 }}>
                  Cliente nuevo
                </span>
              )}
              {syncPendiente
                ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.amber, fontWeight: 600 }}><CloudOff size={12} /> Guardando…</span>
                : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.green, fontWeight: 600 }}><Check size={12} /> Guardado</span>}
              {gpsEstado === 'buscando' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.muted, fontWeight: 600 }}><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Ubicando…</span>
              )}
              {gpsEstado === 'ok' && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.green, fontWeight: 600 }}><MapPin size={12} /> Ubicación registrada</span>
              )}
            </p>
          )}
        </div>

        {etapa === 'cliente' && (
          <PasoCliente clientes={clientesExistentes} onConfirmar={onClienteConfirmado} />
        )}
        {etapa === 'venta' && (
          <PasoVenta
            clienteNombre={cliente!.nombre}
            catalogo={catalogo}
            carrito={carrito}
            setCarrito={setCarrito}
            onCerrar={onCerrarIntentado}
            guardando={guardando}
          />
        )}
      </div>

      {showCatalogoWA && <WhatsAppCatalogoModal onClose={() => setShowCatalogoWA(false)} />}
      {showImagen && (
        <VentaImageModal
          items={items}
          clienteNombre={cliente?.nombre ?? ''}
          vendedorNombre={vendedor.nombre}
          onClose={() => setShowImagen(false)}
        />
      )}
      {pendingCierre && (
        <HojaFotosVisita
          fotos={fotos}
          subiendo={subiendoFoto}
          onTomarCamara={abrirCamaraPara}
          onSubirGaleria={abrirGaleriaPara}
          onContinuar={() => ejecutarCierre(pendingCierre)}
          onCancelar={() => setPendingCierre(null)}
        />
      )}
    </div>
  )
}
