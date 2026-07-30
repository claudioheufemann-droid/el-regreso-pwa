'use client'

import { useMemo, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronLeft, Search, Plus, Minus, X, FileText, Send, Share2, Check, Copy,
  User, Building2, Mail, Phone, Loader2, ImageIcon, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/lib/auth'
import { catalogoPorZona, esKombucha, fmtPrecioCLP, type CatalogoInfo, type StockPorCodigo, type Zona } from '@/lib/catalogo-productos'
import {
  generarImagenCotizacion, compartirImagenCotizacion, calcularTotalesCotizacion,
  type ItemCotizacionImagen,
} from '@/lib/generar-imagen-cotizacion'
import type { ClienteParaCotizacion } from './page'

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0',
  blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#059669', greenSoft: '#ECFDF5',
  amber: '#D97706', amberSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2',
}

type Envase = 'lata' | 'barril'
interface ItemCarrito extends ItemCotizacionImagen { id: string }

const ZONA_LABEL: Record<Zona, string> = { valdivia: 'Zona Sur', santiago: 'Santiago' }

function claveItem(producto: string, envase: Envase) {
  return `${producto}|${envase}`
}
function nuevoId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}
function disponibleDe(info: CatalogoInfo, envase: Envase, stockPorCodigo: StockPorCodigo): number {
  if (!info.codigo) return 0
  const s = stockPorCodigo[info.codigo]
  if (!s) return 0
  return envase === 'barril' ? s.barril : s.envase
}

export default function NuevaCotizacionClient({ user, clientes, stockPorCodigo }: {
  user: AppUser; clientes: ClienteParaCotizacion[]; stockPorCodigo: StockPorCodigo
}) {
  const router = useRouter()
  const supabase = createClient()

  const [zona, setZona] = useState<Zona>('valdivia')
  const catalogo = useMemo(() => catalogoPorZona(zona), [zona])

  // Solo se ofrece lo que hoy tiene stock real — si un producto/formato no
  // aparece en bodega, no se muestra como opción para cotizar.
  const { cervezas, kombuchas } = useMemo(() => {
    const cervezas: [string, CatalogoInfo][] = []
    const kombuchas: [string, CatalogoInfo][] = []
    for (const entry of Object.entries(catalogo)) {
      const [, info] = entry
      const dispLata = info.precio_lata > 0 ? disponibleDe(info, 'lata', stockPorCodigo) : 0
      const dispBarril = info.precio_barril > 0 ? disponibleDe(info, 'barril', stockPorCodigo) : 0
      if (dispLata <= 0 && dispBarril <= 0) continue
      ;(esKombucha(info) ? kombuchas : cervezas).push(entry)
    }
    return { cervezas, kombuchas }
  }, [catalogo, stockPorCodigo])

  // ── Cliente ──────────────────────────────────────────────────────────
  const [modoCliente, setModoCliente] = useState<'existente' | 'nuevo'>('existente')
  const [busqueda, setBusqueda] = useState('')
  const [clienteSel, setClienteSel] = useState<ClienteParaCotizacion | null>(null)
  const [nombreManual, setNombreManual] = useState('')
  const [empresaManual, setEmpresaManual] = useState('')
  const [emailManual, setEmailManual] = useState('')
  const [telefonoManual, setTelefonoManual] = useState('')

  const sugerencias = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q || clienteSel) return []
    return clientes.filter(c => c.nombre_fantasia.toLowerCase().includes(q)).slice(0, 8)
  }, [busqueda, clientes, clienteSel])

  const clienteFinal = useMemo(() => {
    if (modoCliente === 'existente' && clienteSel) {
      return {
        id: clienteSel.id, nombre: clienteSel.nombre_fantasia,
        empresa: clienteSel.razon_social && clienteSel.razon_social !== clienteSel.nombre_fantasia ? clienteSel.razon_social : null,
        email: clienteSel.email, telefono: clienteSel.telefono,
      }
    }
    return {
      id: null, nombre: nombreManual.trim(), empresa: empresaManual.trim() || null,
      email: emailManual.trim() || null, telefono: telefonoManual.trim() || null,
    }
  }, [modoCliente, clienteSel, nombreManual, empresaManual, emailManual, telefonoManual])

  // ── Carrito de productos ─────────────────────────────────────────────
  // Array (no Map) para poder tener varias líneas del mismo producto/envase
  // con descuentos distintos — ej. 2 unidades sin descuento + 1 con 20%.
  const [items, setItems] = useState<ItemCarrito[]>([])
  const { subtotal, descuentoTotal, total } = useMemo(() => calcularTotalesCotizacion(items), [items])

  function agregarProducto(producto: string, envase: Envase, precioUnitario: number) {
    setItems(prev => {
      // Si ya hay una línea sin descuento para el mismo producto/envase, se
      // suma ahí. Si esa línea ya tiene descuento (fue editada), se crea una
      // línea nueva para no cambiarle el descuento a algo que el vendedor ya ajustó.
      const idx = prev.findIndex(it => it.producto === producto && it.envase === envase && it.descuentoPct === 0)
      if (idx >= 0) {
        const next = [...prev]
        next[idx] = { ...next[idx], cantidad: next[idx].cantidad + 1 }
        return next
      }
      return [...prev, { id: nuevoId(), producto, envase, precioUnitario, cantidad: 1, descuentoPct: 0 }]
    })
  }
  function actualizarItem(id: string, cambios: Partial<ItemCarrito>) {
    setItems(prev => prev.map(it => it.id === id ? { ...it, ...cambios } : it))
  }
  function quitarItem(id: string) {
    setItems(prev => prev.filter(it => it.id !== id))
  }
  // Separa 1 unidad de la línea en una línea nueva independiente, para poder
  // darle un descuento distinto sin afectar al resto de las unidades.
  function dividirLinea(id: string) {
    setItems(prev => {
      const it = prev.find(i => i.id === id)
      if (!it || it.cantidad <= 1) return prev
      return prev.flatMap(i => i.id === id
        ? [{ ...i, cantidad: i.cantidad - 1 }, { ...i, id: nuevoId(), cantidad: 1 }]
        : [i])
    })
  }

  // ── Aviso si se pidió más de lo que hay en stock ─────────────────────
  const avisosStock = useMemo(() => {
    const acumulado = new Map<string, number>()
    for (const it of items) {
      const key = claveItem(it.producto, it.envase)
      acumulado.set(key, (acumulado.get(key) ?? 0) + it.cantidad)
    }
    const avisos: string[] = []
    for (const [key, pedido] of acumulado) {
      const [producto, envase] = key.split('|') as [string, Envase]
      const info = catalogo[producto]
      if (!info) continue
      const disp = disponibleDe(info, envase, stockPorCodigo)
      if (pedido > disp) {
        avisos.push(`${producto} · ${envase === 'barril' ? 'Barril' : 'Lata'}: pediste ${pedido}, ${disp === 0 ? 'no queda stock' : `solo hay ${disp}`}`)
      }
    }
    return avisos
  }, [items, catalogo, stockPorCodigo])

  // ── Notas ────────────────────────────────────────────────────────────
  const [notas, setNotas] = useState('')

  // ── Generar / guardar / enviar ───────────────────────────────────────
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ id: string; numero: number; imagenUrl: string; blob: Blob } | null>(null)
  const [enviandoEmail, setEnviandoEmail] = useState(false)
  const [emailEnviado, setEmailEnviado] = useState(false)

  const listoParaGenerar = clienteFinal.nombre.length > 0 && items.length > 0

  async function generarCotizacion() {
    if (!listoParaGenerar || generando) return
    setGenerando(true)
    setError(null)
    try {
      const itemsParaGuardar: ItemCotizacionImagen[] = items.map(({ id: _id, ...rest }) => rest)
      const { data: fila, error: errInsert } = await supabase
        .from('cotizaciones')
        .insert({
          creado_por: user.id,
          creado_por_nombre: user.nombre,
          creado_por_email: user.email,
          zona,
          cliente_id: clienteFinal.id,
          cliente_nombre: clienteFinal.nombre,
          cliente_empresa: clienteFinal.empresa,
          cliente_email: clienteFinal.email,
          cliente_telefono: clienteFinal.telefono,
          items: itemsParaGuardar,
          subtotal, descuento_total: descuentoTotal, total,
          notas: notas.trim() || null,
          estado: 'borrador',
        })
        .select('id, numero')
        .single()
      if (errInsert || !fila) throw new Error(errInsert?.message ?? 'No se pudo guardar la cotización')

      const fecha = new Date().toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })
      const blob = await generarImagenCotizacion({
        numero: fila.numero, fecha,
        clienteNombre: clienteFinal.nombre, clienteEmpresa: clienteFinal.empresa,
        vendedorNombre: user.nombre, zona, items: itemsParaGuardar, notas: notas.trim() || null,
      })

      const path = `${fila.id}.png`
      const { error: errUpload } = await supabase.storage.from('cotizaciones').upload(path, blob, { upsert: true, contentType: 'image/png' })
      if (errUpload) throw new Error(errUpload.message)
      const { data: pub } = supabase.storage.from('cotizaciones').getPublicUrl(path)

      await supabase.from('cotizaciones').update({ imagen_url: pub.publicUrl }).eq('id', fila.id)

      setResultado({ id: fila.id, numero: fila.numero, imagenUrl: pub.publicUrl, blob })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar la cotización')
    } finally {
      setGenerando(false)
    }
  }

  async function compartir() {
    if (!resultado) return
    await compartirImagenCotizacion(resultado.blob, resultado.numero)
    await supabase.from('cotizaciones').update({ estado: 'enviada', enviado_whatsapp_at: new Date().toISOString() }).eq('id', resultado.id)
  }

  async function enviarPorCorreo() {
    if (!resultado || !clienteFinal.email) return
    setEnviandoEmail(true)
    try {
      const res = await fetch('/api/cotizaciones/enviar-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cotizacionId: resultado.id }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'No se pudo enviar el correo')
      setEmailEnviado(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al enviar el correo')
    } finally {
      setEnviandoEmail(false)
    }
  }

  function nuevaCotizacion() {
    setItems([])
    setClienteSel(null); setBusqueda(''); setNombreManual(''); setEmpresaManual(''); setEmailManual(''); setTelefonoManual('')
    setNotas(''); setResultado(null); setEmailEnviado(false); setError(null)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/ventas/cotizaciones')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: C.card, border: `1px solid ${C.line}`, borderRadius: 100, padding: '7px 14px 7px 10px', color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', marginBottom: 14 }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} /> Cotizaciones
        </button>

        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', marginBottom: 2 }}>Nueva cotización</h1>
        <p style={{ fontSize: 12, color: C.faint, marginBottom: 20 }}>Cotizado por {user.nombre}</p>

        {!resultado && (
          <>
            {/* Zona */}
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Zona de precios</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 20, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4 }}>
              {(['valdivia', 'santiago'] as const).map(z => (
                <button key={z} onClick={() => setZona(z)} style={{
                  flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: zona === z ? C.blue : 'transparent', color: zona === z ? '#fff' : C.muted,
                  fontSize: 13, fontWeight: 700,
                }}>{ZONA_LABEL[z]}</button>
              ))}
            </div>

            {/* Cliente */}
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Cliente</p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              {(['existente', 'nuevo'] as const).map(m => (
                <button key={m} onClick={() => setModoCliente(m)} style={{
                  padding: '6px 14px', borderRadius: 100, cursor: 'pointer',
                  border: `1px solid ${modoCliente === m ? C.blue : C.line}`,
                  background: modoCliente === m ? C.blueSoft : C.card,
                  color: modoCliente === m ? C.blue : C.muted, fontSize: 12.5, fontWeight: 700,
                }}>{m === 'existente' ? 'Cliente existente' : 'Cliente nuevo / prospecto'}</button>
              ))}
            </div>

            {modoCliente === 'existente' ? (
              <div style={{ position: 'relative', marginBottom: 20 }}>
                {clienteSel ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: C.blueSoft, border: `1px solid ${C.blue}`, borderRadius: 12, padding: '12px 14px' }}>
                    <User size={16} color={C.blue} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{clienteSel.nombre_fantasia}</p>
                      {(clienteSel.email || clienteSel.telefono) && (
                        <p style={{ fontSize: 11, color: C.muted }}>{[clienteSel.email, clienteSel.telefono].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                    <button onClick={() => { setClienteSel(null); setBusqueda('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>
                      <X size={16} color={C.muted} />
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={{ position: 'relative' }}>
                      <Search size={15} color={C.faint} style={{ position: 'absolute', left: 12, top: 13 }} />
                      <input
                        value={busqueda} onChange={e => setBusqueda(e.target.value)}
                        placeholder="Buscar cliente por nombre…"
                        style={{ width: '100%', padding: '12px 12px 12px 36px', borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 14, outline: 'none' }}
                      />
                    </div>
                    {sugerencias.length > 0 && (
                      <div style={{ marginTop: 6, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden' }}>
                        {sugerencias.map(c => (
                          <button key={c.id} onClick={() => { setClienteSel(c); setBusqueda('') }} style={{
                            display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px', background: 'transparent',
                            border: 'none', borderBottom: `1px solid ${C.line}`, cursor: 'pointer', fontSize: 13.5, color: C.text,
                          }}>{c.nombre_fantasia}</button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                <CampoIcono icon={User} placeholder="Nombre del cliente / contacto *" value={nombreManual} onChange={setNombreManual} />
                <CampoIcono icon={Building2} placeholder="Empresa / razón social (opcional)" value={empresaManual} onChange={setEmpresaManual} />
                <CampoIcono icon={Mail} placeholder="Email (para enviar por correo)" value={emailManual} onChange={setEmailManual} type="email" />
                <CampoIcono icon={Phone} placeholder="Teléfono (opcional)" value={telefonoManual} onChange={setTelefonoManual} type="tel" />
              </div>
            )}

            {/* Productos */}
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Agregar productos</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginBottom: 20 }}>
              <GrupoCategoria titulo="CERVEZAS" emoji="🍺" tint="#B45309" tintSoft="#FFFBEB" productos={cervezas} stockPorCodigo={stockPorCodigo} onAgregar={agregarProducto} />
              <GrupoCategoria titulo="KOMBUCHAS" emoji="🫧" tint="#7C3AED" tintSoft="#F5F3FF" productos={kombuchas} stockPorCodigo={stockPorCodigo} onAgregar={agregarProducto} />
              {cervezas.length === 0 && kombuchas.length === 0 && (
                <p style={{ fontSize: 12.5, color: C.faint, textAlign: 'center', padding: '20px 0' }}>Sin stock disponible para cotizar en este momento.</p>
              )}
            </div>

            {/* Carrito */}
            {items.length > 0 && (
              <>
                <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Detalle de la cotización · {items.length}
                </p>
                <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden', marginBottom: 14 }}>
                  {items.map((it, i) => {
                    const bruto = it.precioUnitario * it.cantidad
                    const lineaTotal = bruto * (1 - it.descuentoPct / 100)
                    return (
                      <div key={it.id} style={{ padding: '12px 14px', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                          <div style={{ minWidth: 0 }}>
                            <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{it.producto}</p>
                            <p style={{ fontSize: 11, color: C.faint }}>{it.envase === 'barril' ? 'Barril 30L' : 'Lata'} · {fmtPrecioCLP(it.precioUnitario)}</p>
                          </div>
                          <button onClick={() => quitarItem(it.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0 }}>
                            <X size={15} color={C.faint} />
                          </button>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button onClick={() => actualizarItem(it.id, { cantidad: Math.max(1, it.cantidad - 1) })} style={stepperBtnStyle}><Minus size={13} /></button>
                            <span style={{ fontSize: 13, fontWeight: 800, color: C.text, minWidth: 22, textAlign: 'center' }}>{it.cantidad}</span>
                            <button onClick={() => actualizarItem(it.id, { cantidad: it.cantidad + 1 })} style={stepperBtnStyle}><Plus size={13} /></button>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input
                              type="number" min={0} max={100} value={it.descuentoPct === 0 ? '' : it.descuentoPct}
                              placeholder="0"
                              onChange={e => actualizarItem(it.id, { descuentoPct: Math.min(100, Math.max(0, Number(e.target.value) || 0)) })}
                              style={{ width: 46, padding: '5px 4px', textAlign: 'center', borderRadius: 7, border: `1px solid ${C.line}`, fontSize: 12.5, fontWeight: 700, color: C.green, outline: 'none' }}
                            />
                            <span style={{ fontSize: 11.5, color: C.muted, fontWeight: 700 }}>% dcto.</span>
                          </div>
                          <span style={{ marginLeft: 'auto', fontSize: 14, fontWeight: 800, color: C.text }}>{fmtPrecioCLP(lineaTotal)}</span>
                        </div>
                        {it.cantidad > 1 && (
                          <button onClick={() => dividirLinea(it.id)} style={{
                            display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, padding: '5px 0',
                            background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontSize: 11.5, fontWeight: 700,
                          }}>
                            <Copy size={13} /> ¿Solo parte de estas {it.cantidad} unidades con descuento? Separar 1 en línea aparte
                          </button>
                        )}
                      </div>
                    )
                  })}
                </div>

                {avisosStock.length > 0 && (
                  <div style={{ background: C.amberSoft, border: `1px solid ${C.amber}`, borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>
                    {avisosStock.map((a, i) => (
                      <p key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6, fontSize: 12, color: C.amber, fontWeight: 600, marginTop: i === 0 ? 0 : 4 }}>
                        <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} /> {a}
                      </p>
                    ))}
                  </div>
                )}

                <textarea
                  value={notas} onChange={e => setNotas(e.target.value)}
                  placeholder="Notas para el cliente (opcional): forma de pago, tiempos de entrega, etc."
                  rows={3}
                  style={{ width: '100%', padding: 12, borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 13, outline: 'none', resize: 'vertical', marginBottom: 14, fontFamily: 'inherit' }}
                />

                <div style={{ background: C.hero, borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                  <FilaTotal label="Subtotal" value={fmtPrecioCLP(subtotal)} muted />
                  {descuentoTotal > 0 && <FilaTotal label="Descuento" value={`-${fmtPrecioCLP(descuentoTotal)}`} color="#7CA86A" />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 6, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>TOTAL</span>
                    <span style={{ fontSize: 22, fontWeight: 900, color: '#D4AF37' }}>{fmtPrecioCLP(total)}</span>
                  </div>
                </div>
              </>
            )}

            {error && <p style={{ fontSize: 12.5, color: C.red, background: C.redSoft, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>{error}</p>}

            <button
              onClick={generarCotizacion} disabled={!listoParaGenerar || generando}
              style={{
                width: '100%', padding: '15px', borderRadius: 14, border: 'none',
                background: listoParaGenerar && !generando ? C.hero : C.line,
                color: listoParaGenerar && !generando ? '#fff' : C.faint,
                fontSize: 15, fontWeight: 800, cursor: listoParaGenerar && !generando ? 'pointer' : 'not-allowed',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              {generando ? <Loader2 size={17} className="animate-spin" /> : <ImageIcon size={17} />}
              {generando ? 'Generando cotización…' : 'Generar cotización'}
            </button>
          </>
        )}

        {resultado && (
          <div>
            <div style={{ background: C.greenSoft, border: `1px solid ${C.green}`, borderRadius: 12, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <Check size={18} color={C.green} />
              <p style={{ fontSize: 13.5, fontWeight: 700, color: C.green }}>Cotización N° {String(resultado.numero).padStart(4, '0')} guardada</p>
            </div>

            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={resultado.imagenUrl} alt={`Cotización ${resultado.numero}`} style={{ width: '100%', borderRadius: 14, border: `1px solid ${C.line}`, marginBottom: 16 }} />

            {error && <p style={{ fontSize: 12.5, color: C.red, background: C.redSoft, borderRadius: 10, padding: '10px 12px', marginBottom: 14 }}>{error}</p>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
              <button onClick={compartir} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 14,
                border: 'none', background: '#25D366', color: '#fff', fontSize: 14.5, fontWeight: 800, cursor: 'pointer',
              }}>
                <Share2 size={17} /> Compartir (WhatsApp / Guardar)
              </button>

              <button
                onClick={enviarPorCorreo} disabled={!clienteFinal.email || enviandoEmail || emailEnviado}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 14,
                  border: `1px solid ${C.blue}`, background: emailEnviado ? C.greenSoft : C.blueSoft,
                  color: emailEnviado ? C.green : C.blue, fontSize: 14.5, fontWeight: 800,
                  cursor: !clienteFinal.email || enviandoEmail || emailEnviado ? 'not-allowed' : 'pointer',
                  opacity: !clienteFinal.email ? 0.5 : 1,
                }}
              >
                {enviandoEmail ? <Loader2 size={17} className="animate-spin" /> : emailEnviado ? <Check size={17} /> : <Send size={17} />}
                {emailEnviado ? 'Correo enviado' : !clienteFinal.email ? 'Sin email del cliente' : enviandoEmail ? 'Enviando…' : 'Enviar por correo'}
              </button>
            </div>

            <button onClick={nuevaCotizacion} style={{
              width: '100%', padding: '13px', borderRadius: 14, border: `1px solid ${C.line}`, background: C.card,
              color: C.muted, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <FileText size={15} /> Nueva cotización
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function GrupoCategoria({ titulo, emoji, tint, tintSoft, productos, stockPorCodigo, onAgregar }: {
  titulo: string; emoji: string; tint: string; tintSoft: string
  productos: [string, CatalogoInfo][]; stockPorCodigo: StockPorCodigo
  onAgregar: (producto: string, envase: Envase, precio: number) => void
}) {
  if (productos.length === 0) return null
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 14px', background: tintSoft }}>
        <span style={{ fontSize: 14 }}>{emoji}</span>
        <p style={{ fontSize: 11.5, fontWeight: 800, color: tint, letterSpacing: '0.05em' }}>{titulo} · {productos.length}</p>
      </div>
      <div>
        {productos.map(([producto, info], i) => {
          const dispLata = info.precio_lata > 0 ? disponibleDe(info, 'lata', stockPorCodigo) : 0
          const dispBarril = info.precio_barril > 0 ? disponibleDe(info, 'barril', stockPorCodigo) : 0
          return (
            <div key={producto} style={{ padding: '10px 14px', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
              <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{producto}</p>
              <p style={{ fontSize: 11, color: C.faint, marginBottom: 8 }}>{info.estilo}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {dispLata > 0 && (
                  <button onClick={() => onAgregar(producto, 'lata', info.precio_lata)} style={chipStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Lata · {fmtPrecioCLP(info.precio_lata)}</span>
                      <Plus size={13} color={C.blue} style={{ flexShrink: 0 }} />
                    </span>
                    <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}>{dispLata.toLocaleString('es-CL')} un. disponibles</span>
                  </button>
                )}
                {dispBarril > 0 && (
                  <button onClick={() => onAgregar(producto, 'barril', info.precio_barril)} style={chipStyle}>
                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Barril 30L · {fmtPrecioCLP(info.precio_barril)}</span>
                      <Plus size={13} color={C.blue} style={{ flexShrink: 0 }} />
                    </span>
                    <span style={{ fontSize: 10.5, color: C.faint, fontWeight: 600 }}>{dispBarril} barril{dispBarril === 1 ? '' : 'es'} disponibles</span>
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function CampoIcono({ icon: Icon, ...props }: { icon: typeof User; placeholder: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <div style={{ position: 'relative' }}>
      <Icon size={15} color={C.faint} style={{ position: 'absolute', left: 12, top: 13 }} />
      <input
        type={props.type ?? 'text'} value={props.value} onChange={e => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        style={{ width: '100%', padding: '12px 12px 12px 36px', borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 14, outline: 'none' }}
      />
    </div>
  )
}

function FilaTotal({ label, value, muted, color }: { label: string; value: string; muted?: boolean; color?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, marginBottom: 4 }}>
      <span style={{ color: muted ? 'rgba(255,255,255,0.55)' : color ?? '#fff', fontWeight: 600 }}>{label}</span>
      <span style={{ color: muted ? 'rgba(255,255,255,0.8)' : color ?? '#fff', fontWeight: 700 }}>{value}</span>
    </div>
  )
}

const stepperBtnStyle: CSSProperties = {
  width: 26, height: 26, borderRadius: 7, border: `1px solid ${C.line}`, background: C.bg,
  display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.text,
}

const chipStyle: CSSProperties = {
  flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2,
  padding: '8px 10px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.bg, cursor: 'pointer',
}
