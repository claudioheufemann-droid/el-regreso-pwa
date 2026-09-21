'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Check, CloudOff, MessageCircle, Image as ImageIcon } from 'lucide-react'
import { notificar } from '@/lib/notificar'
import { upsertOrQueue } from '@/lib/offlineQueue'
import { uploadConTimeout } from '@/lib/offlinePhotoQueue'
import { comprimirFotoLlegada } from '@/lib/terreno/comprimirFoto'
import { hapticExito } from '@/lib/haptics'
import { createClient } from '@/lib/supabase/client'
import { catalogoParaVendedor, fmtPrecioCLP } from '@/lib/catalogo-productos'
import { format } from 'date-fns'
import { es } from 'date-fns/locale'
import type { AppUser } from '@/lib/auth'
import { C, TAP } from '../theme'
import PasoCliente, { type ClienteResumen, type NuevoClienteDetalle } from './PasoCliente'
import PasoVenta, { type CierrePayload } from './PasoVenta'
import MarcarLlegada, { type EvidenciaCapturada } from './MarcarLlegada'
import ConfirmarEvidencia, { type ResultadoLlegada } from './ConfirmarEvidencia'
import FinalizarVisita, { type CierrePayloadLlegada } from './FinalizarVisita'
import HojaFotosVisita from './HojaFotosVisita'
import { SLOTS_FOTO, CAMPO_DE_SLOT, type SlotFoto } from '@/lib/fotosVisita'
import {
  setCatalogo, WhatsAppCatalogoModal, VentaImageModal,
  type ItemCarrito,
} from './piezas'

/**
 * Venta en terreno — flujo de CUATRO etapas: cliente → llegada (foto+GPS,
 * obligatoria) → confirmar evidencia → finalizar (contacto/resultado/
 * próximo paso, sin catálogo). El catálogo (PasoVenta) sólo aparece si el
 * resultado elegido es "Pedido" — para cualquier otro resultado la visita
 * se guarda directo, sin pasar por productos.
 *
 * Reemplaza el flujo anterior (cliente → venta directo, GPS silencioso en
 * segundo plano, fotos opcionales al cerrar) por pedido explícito: la
 * llegada verificada pasa a ser el gate obligatorio antes de cualquier
 * otra cosa. Ver lib/terreno/verificacion.ts para la lógica de servidor
 * que decide si una llegada quedó verificada o en revisión.
 */

type Etapa = 'cliente' | 'llegada' | 'confirmar' | 'cierre' | 'venta'

interface VisitaRetomada {
  id: string
  cliente_nombre: string
  es_cliente_nuevo: boolean
  lat: number | null
  lng: number | null
  direccion_gps: string | null
  estado?: string
  estado_presencia?: string
  cliente_erp_id?: number | null
  cliente_terreno_id?: string | null
  foto_exterior?: string | null
  foto_interior?: string | null
  foto_exhibicion?: string | null
  foto_competencia?: string | null
}

interface Props {
  vendedor: AppUser
  recientes: ClienteResumen[]
  frecuentes: ClienteResumen[]
  pendientes: ClienteResumen[]
  visitaRetomada?: VisitaRetomada | null
  clientePre?: string | null
}

export default function NuevaVisitaClient({
  vendedor, recientes, frecuentes, pendientes, visitaRetomada, clientePre = null,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  const catalogo = catalogoParaVendedor(vendedor.email)
  setCatalogo(catalogo)

  const [cliente, setCliente] = useState<{ nombre: string; esNuevo: boolean; direccion?: string | null } | null>(
    visitaRetomada ? { nombre: visitaRetomada.cliente_nombre, esNuevo: visitaRetomada.es_cliente_nuevo } : null
  )
  const [visitaId, setVisitaId] = useState<string | null>(visitaRetomada?.id ?? null)
  const [clienteErpId, setClienteErpId] = useState<number | null>(visitaRetomada?.cliente_erp_id ?? null)
  const [clienteTerrenoId, setClienteTerrenoId] = useState<string | null>(visitaRetomada?.cliente_terreno_id ?? null)
  const [etapa, setEtapa] = useState<Etapa>(() => {
    if (!visitaRetomada) return 'cliente'
    return visitaRetomada.estado === 'en_progreso' ? 'cierre' : 'llegada'
  })
  const [evidencia, setEvidencia] = useState<EvidenciaCapturada | null>(null)
  const [resultadoLlegada, setResultadoLlegada] = useState<(ResultadoLlegada & { fotoUrl?: string; horaTexto: string }) | null>(
    visitaRetomada?.estado === 'en_progreso'
      ? { estadoPresencia: visitaRetomada.estado_presencia ?? 'historica_sin_verificacion', motivoRevision: null, distanciaM: null, precisionM: null, radioM: null, pendienteSync: false, horaTexto: '' }
      : null
  )
  const [cierrePayloadGuardado, setCierrePayloadGuardado] = useState<CierrePayloadLlegada | null>(null)
  const [carrito, setCarrito] = useState<Map<string, ItemCarrito>>(new Map())
  const [guardando, setGuardando] = useState(false)
  const [syncPendiente, setSyncPendiente] = useState(false)
  const [fotos, setFotos] = useState<Partial<Record<SlotFoto, string>>>({
    ...(visitaRetomada?.foto_exterior ? { exterior: visitaRetomada.foto_exterior } : {}),
    ...(visitaRetomada?.foto_interior ? { interior: visitaRetomada.foto_interior } : {}),
    ...(visitaRetomada?.foto_exhibicion ? { exhibicion: visitaRetomada.foto_exhibicion } : {}),
    ...(visitaRetomada?.foto_competencia ? { competencia: visitaRetomada.foto_competencia } : {}),
  })
  const [showCatalogoWA, setShowCatalogoWA] = useState(false)
  const [showImagen, setShowImagen] = useState(false)
  const [pendingFinal, setPendingFinal] = useState<{ payload: CierrePayloadLlegada; items: ItemCarrito[]; pago: PagoInfo | null } | null>(null)

  const fileGaleriaRef = useRef<HTMLInputElement>(null)
  const slotPendienteRef = useRef<SlotFoto>('interior')
  const jornadaIdRef = useRef<string | null>(null)
  const referenciaCoordsRef = useRef<{ lat: number; lng: number } | null>(
    visitaRetomada?.lat != null && visitaRetomada?.lng != null ? { lat: visitaRetomada.lat, lng: visitaRetomada.lng } : null
  )
  const visitaDraft = useRef<Record<string, unknown>>(
    visitaRetomada ? {
      id: visitaRetomada.id, vendedor_id: vendedor.id,
      cliente_nombre: visitaRetomada.cliente_nombre, es_cliente_nuevo: visitaRetomada.es_cliente_nuevo,
      estado: visitaRetomada.estado,
    } : {}
  )

  useEffect(() => {
    fetch('/api/terreno/jornada')
      .then(r => r.json())
      .then(j => { jornadaIdRef.current = j?.id ?? null })
      .catch(() => {})
  }, [])

  function guardarDraft(extra: Record<string, unknown>) {
    visitaDraft.current = { ...visitaDraft.current, ...extra }
    setSyncPendiente(true)
    upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current).then(r => setSyncPendiente(!r.ok))
  }

  /**
   * Cliente elegido → crea el borrador (excluido de estadísticas hasta que
   * se confirme la llegada) y pasa directo a la cámara. Ya no se captura
   * GPS en segundo plano acá: la ubicación se toma junto con la foto en
   * MarcarLlegada/ConfirmarEvidencia, que es donde realmente se verifica.
   */
  function onClienteConfirmado(
    nombre: string, esNuevo: boolean, canal: string, detalle?: NuevoClienteDetalle,
    coords?: { lat: number; lng: number }, erpId?: number | null,
  ) {
    setCliente({ nombre, esNuevo, direccion: detalle?.direccion })
    const id = crypto.randomUUID()
    setVisitaId(id)

    referenciaCoordsRef.current = coords
      ?? ((detalle?.lat != null && detalle?.lng != null) ? { lat: detalle.lat, lng: detalle.lng } : null)

    let clienteTerrenoIdNuevo: string | null = null
    if (esNuevo && detalle) {
      clienteTerrenoIdNuevo = crypto.randomUUID()
      setClienteTerrenoId(clienteTerrenoIdNuevo)
      upsertOrQueue(supabase, 'clientes_terreno', {
        id: clienteTerrenoIdNuevo,
        nombre_fantasia: nombre,
        direccion: detalle.direccion || null,
        lat: detalle.lat, lng: detalle.lng,
        contacto: detalle.contacto || null,
        telefono: detalle.contacto || null,
        rut: detalle.rut || null,
        canal,
        creado_por: vendedor.id,
      })
    } else if (erpId != null) {
      setClienteErpId(erpId)
    }

    visitaDraft.current = {
      id, vendedor_id: vendedor.id, cliente_nombre: nombre, es_cliente_nuevo: esNuevo,
      estado: 'borrador', jornada_id: jornadaIdRef.current,
      ...(clienteTerrenoIdNuevo ? { cliente_terreno_id: clienteTerrenoIdNuevo } : {}),
      ...(erpId != null ? { cliente_erp_id: erpId } : {}),
    }
    setSyncPendiente(true)
    upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current).then(r => setSyncPendiente(!r.ok))
    setEtapa('llegada')
  }

  // Pedido rápido: ?cliente=Nombre (desde misiones, cercanos o detalle de cliente).
  const pedidoRapidoRef = useRef(false)
  useEffect(() => {
    if (pedidoRapidoRef.current || !clientePre || visitaRetomada || cliente) return
    pedidoRapidoRef.current = true
    supabase
      .from('clientes')
      .select('id, categoria, lat, lng')
      .eq('nombre_fantasia', clientePre)
      .maybeSingle()
      .then(({ data: c }) => {
        onClienteConfirmado(
          clientePre, !c, (c?.categoria as string | null) ?? '',
          undefined,
          c?.lat != null && c?.lng != null ? { lat: Number(c.lat), lng: Number(c.lng) } : undefined,
          (c?.id as number | null) ?? undefined,
        )
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientePre])

  function onLlegadaLista(ev: EvidenciaCapturada) {
    setEvidencia(ev)
    setEtapa('confirmar')
  }

  function onEvidenciaConfirmada(r: ResultadoLlegada & { fotoUrl?: string }) {
    setResultadoLlegada({ ...r, horaTexto: new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) })
    if (r.fotoUrl) setFotos(prev => ({ ...prev, exterior: r.fotoUrl }))
    guardarDraft({ id: visitaId, estado: 'en_progreso' })
    setEtapa('cierre')
  }

  interface PagoInfo { metodoPago: CierrePayload['metodoPago']; diasCredito: number | null; fechaPagoEstimada: string | null }

  const fotosFaltantes = SLOTS_FOTO.filter(s => !fotos[s.key]).map(s => s.key)

  function onFinalizarIntentado(payload: CierrePayloadLlegada) {
    if (payload.resultado === 'pedido_confirmado') { setCierrePayloadGuardado(payload); setEtapa('venta'); return }
    onCerrarIntentado(payload, [], null)
  }

  function onVentaCerrada(p: CierrePayload) {
    if (!cierrePayloadGuardado) return
    onCerrarIntentado(cierrePayloadGuardado, p.items, { metodoPago: p.metodoPago, diasCredito: p.diasCredito, fechaPagoEstimada: p.fechaPagoEstimada })
  }

  function onCerrarIntentado(payload: CierrePayloadLlegada, items: ItemCarrito[], pago: PagoInfo | null) {
    if (fotosFaltantes.length > 0) { setPendingFinal({ payload, items, pago }); return }
    ejecutarCierre(payload, items, pago)
  }

  const RESULTADO_LABEL: Record<string, string> = {
    tiene_stock: 'Tiene stock', pedido_confirmado: 'Pedido confirmado', cotizacion_solicitada: 'Cotización solicitada',
    evaluar_propuesta: 'Evaluando propuesta', precio: 'Objeción de precio', deuda: 'Deuda pendiente',
    no_interesado: 'No interesado', gestion_resuelta: 'Gestión resuelta', otro: 'Otro',
  }

  async function ejecutarCierre(payload: CierrePayloadLlegada, items: ItemCarrito[], pago: PagoInfo | null) {
    if (!visitaId) return
    setPendingFinal(null)
    setGuardando(true)
    try {
      const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0)
      const tieneVenta = payload.resultado === 'pedido_confirmado'

      visitaDraft.current = {
        ...visitaDraft.current,
        id: visitaId,
        contacto: payload.contacto,
        resultado_visita: payload.resultado,
        proximo_paso: payload.proximoPaso,
        proximo_paso_fecha: payload.proximoPasoFecha,
        tiene_venta: tieneVenta,
        motivo_sin_venta: tieneVenta ? null : (payload.resultado ? RESULTADO_LABEL[payload.resultado] ?? payload.resultado : 'Sin contacto comercial'),
        observaciones: payload.nota || null,
        total_pedido: total,
        estado: 'completada',
        completada_at: new Date().toISOString(),
        metodo_pago: pago?.metodoPago ?? null,
        dias_credito: pago?.diasCredito ?? null,
        fecha_pago_estimada: pago?.fechaPagoEstimada ?? null,
        fotos_status: SLOTS_FOTO.every(s => fotos[s.key]) ? 'COMPLETO' : 'PENDIENTE',
      }
      const rVisita = await upsertOrQueue(supabase, 'visitas_terreno', visitaDraft.current)

      let itemsPendientes = false
      if (items.length > 0) {
        const res = await Promise.all(items.map(i => upsertOrQueue(supabase, 'visitas_terreno_items', {
          id: crypto.randomUUID(), visita_id: visitaId,
          producto: i.producto, categoria: i.categoria, envase: i.envase,
          cantidad: i.cantidad, precio_unit: i.precio, subtotal: i.cantidad * i.precio,
        })))
        itemsPendientes = res.some(r => r.queued)
      }

      if (payload.proximoPaso !== 'sin_pendiente' && payload.proximoPasoFecha) {
        await upsertOrQueue(supabase, 'seguimientos', {
          id: crypto.randomUUID(), visita_id: visitaId, vendedor_id: vendedor.id,
          cliente_nombre: cliente?.nombre ?? '', tipo_accion: payload.proximoPaso,
          fecha_hora_compromiso: `${payload.proximoPasoFecha}T09:00:00`,
          nota: payload.nota || null, estado: 'pendiente',
        })
      }

      setSyncPendiente(!rVisita.ok || itemsPendientes)

      if (rVisita.sesionPerdida) {
        window.alert('Tu sesión expiró. Esta visita quedó guardada en el teléfono — vuelve a iniciar sesión ahora para terminar de cerrarla.')
        router.push('/login')
        return
      }

      if (tieneVenta) {
        hapticExito()
        const bodyPago = pago?.metodoPago === 'credito' && pago.fechaPagoEstimada
          ? ` · Crédito, cobrar el ${format(new Date(pago.fechaPagoEstimada + 'T12:00:00'), "d 'de' MMMM", { locale: es })}`
          : ''
        notificar({
          event: 'visita_completada',
          title: `✅ Pedido en ${cliente?.nombre ?? 'local'}`,
          body: `${fmtPrecioCLP(total)} · ${items.length} producto${items.length !== 1 ? 's' : ''}${bodyPago}`,
          url: '/terreno/historial',
        })
      } else {
        notificar({
          event: 'visita_sin_venta',
          title: `📍 Visita registrada — ${cliente?.nombre ?? 'local'}`,
          body: payload.resultado ? (RESULTADO_LABEL[payload.resultado] ?? payload.resultado) : 'Sin contacto comercial',
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

  const [subiendoFotoExtra, setSubiendoFotoExtra] = useState<Partial<Record<SlotFoto, boolean>>>({})

  async function subirFotoExtra(file: File, slot: SlotFoto) {
    if (!visitaId) return
    setFotos(prev => ({ ...prev, [slot]: URL.createObjectURL(file) }))
    setSubiendoFotoExtra(prev => ({ ...prev, [slot]: true }))
    const campo = CAMPO_DE_SLOT[slot]
    const vId = visitaId
    let blob: Blob = file
    try { blob = await comprimirFotoLlegada(file) } catch { /* si falla la compresión, se sube el original igual */ }
    const url = await uploadConTimeout(
      supabase,
      { bucket: 'terreno-fotos', path: `${vId}/${slot}.webp`, table: 'visitas_terreno', rowId: vId, campo },
      new File([blob], `${slot}.webp`, { type: blob.type || 'image/webp' }),
    )
    setSubiendoFotoExtra(prev => ({ ...prev, [slot]: false }))
    if (url) upsertOrQueue(supabase, 'visitas_terreno', { id: vId, [campo]: url })
  }

  function onFileElegido(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) subirFotoExtra(f, slotPendienteRef.current)
    e.target.value = ''
  }

  const items = Array.from(carrito.values())

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(170px, calc(env(safe-area-inset-bottom, 0px) + 150px))' }}>
      <input ref={fileGaleriaRef} type="file" accept="image/*" hidden onChange={onFileElegido} />

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '0 16px' }}>
        {etapa === 'venta' && (
          <div style={{
            position: 'sticky', top: 0, zIndex: 40,
            background: C.bg, margin: '0 -16px', padding: '20px 16px 14px',
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <button
              onClick={() => setEtapa('cierre')}
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
          </div>
        )}

        {etapa === 'cliente' && (
          <div style={{ paddingTop: 20 }}>
            <button
              onClick={() => router.push('/terreno')}
              aria-label="Volver"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 38, marginBottom: 16, cursor: 'pointer',
                background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
                padding: '7px 14px 7px 10px', color: C.blue, fontSize: 13, fontWeight: 700,
              }}
            >
              <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
              Volver
            </button>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>PASO 1 DE 3</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: 16 }}>
              ¿A quién visitas?
            </h1>
            <PasoCliente recientes={recientes} frecuentes={frecuentes} pendientes={pendientes} onConfirmar={onClienteConfirmado} />
          </div>
        )}

        {etapa === 'llegada' && cliente && visitaId && (
          <div style={{ paddingTop: 20 }}>
            <MarcarLlegada
              visitaId={visitaId}
              clienteNombre={cliente.nombre}
              direccionCliente={cliente.direccion}
              clienteLat={referenciaCoordsRef.current?.lat}
              clienteLng={referenciaCoordsRef.current?.lng}
              onListo={onLlegadaLista}
              onVolver={cancelar}
            />
          </div>
        )}

        {etapa === 'confirmar' && cliente && visitaId && evidencia && (
          <div style={{ paddingTop: 20 }}>
            <ConfirmarEvidencia
              visitaId={visitaId}
              evidencia={evidencia}
              clienteNombre={cliente.nombre}
              clienteLat={referenciaCoordsRef.current?.lat}
              clienteLng={referenciaCoordsRef.current?.lng}
              clienteErpId={clienteErpId}
              clienteTerrenoId={clienteTerrenoId}
              esAdmin={vendedor.isAdmin}
              onConfirmado={onEvidenciaConfirmada}
              onRepetir={() => { setEvidencia(null); setEtapa('llegada') }}
            />
          </div>
        )}

        {etapa === 'cierre' && cliente && (
          <div style={{ paddingTop: 20 }}>
            {resultadoLlegada?.pendienteSync && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6, background: C.amberSoft, color: C.amber,
                borderRadius: 100, padding: '6px 12px', fontSize: 12, fontWeight: 700, marginBottom: 12, width: 'fit-content',
              }}>
                <CloudOff size={13} />
                Llegada guardada en este teléfono · pendiente de sincronización
              </div>
            )}
            <FinalizarVisita
              clienteNombre={cliente.nombre}
              horaLlegada={resultadoLlegada?.horaTexto || null}
              guardando={guardando}
              onVolver={() => setEtapa('confirmar')}
              onFinalizar={onFinalizarIntentado}
            />
          </div>
        )}

        {etapa === 'venta' && cliente && (
          <PasoVenta
            clienteNombre={cliente.nombre}
            catalogo={catalogo}
            carrito={carrito}
            setCarrito={setCarrito}
            onCerrar={onVentaCerrada}
            guardando={guardando}
            ocultarSinVenta
          />
        )}
      </div>

      {etapa === 'venta' && (
        <>
          {showCatalogoWA && <WhatsAppCatalogoModal onClose={() => setShowCatalogoWA(false)} />}
          {showImagen && (
            <VentaImageModal
              items={items}
              clienteNombre={cliente?.nombre ?? ''}
              vendedorNombre={vendedor.nombre}
              onClose={() => setShowImagen(false)}
            />
          )}
        </>
      )}

      {pendingFinal && (
        <HojaFotosVisita
          fotos={fotos}
          subiendo={subiendoFotoExtra}
          onTomarCamara={slot => { slotPendienteRef.current = slot; fileGaleriaRef.current?.click() }}
          onSubirGaleria={slot => { slotPendienteRef.current = slot; fileGaleriaRef.current?.click() }}
          onContinuar={() => ejecutarCierre(pendingFinal.payload, pendingFinal.items, pendingFinal.pago)}
          onCancelar={() => setPendingFinal(null)}
        />
      )}

      {syncPendiente && etapa !== 'cliente' && (
        <div style={{
          position: 'fixed', top: 'max(12px, env(safe-area-inset-top, 12px))', left: 0, right: 0,
          display: 'flex', justifyContent: 'center', zIndex: 60, pointerEvents: 'none',
        }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, background: C.text, color: '#fff',
            borderRadius: 100, padding: '6px 12px', fontSize: 11.5, fontWeight: 700,
          }}>
            <Check size={12} /> Guardando…
          </div>
        </div>
      )}
    </div>
  )
}
