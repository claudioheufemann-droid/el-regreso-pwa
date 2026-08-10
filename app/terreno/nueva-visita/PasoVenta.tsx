'use client'

import { useState, useMemo, useEffect } from 'react'
import { Search, ShoppingCart, Check, X, Banknote, Landmark, CreditCard, ArrowUp } from 'lucide-react'
import { fmtPrecioCLP, esKombucha, type CatalogoInfo } from '@/lib/catalogo-productos'
import { C, TAP, btnPrimario, cardStyle } from '../theme'
import { ProductoThumb, CantidadInput, AvisoDeuda, type ItemCarrito } from './piezas'

export type MetodoPago = 'efectivo' | 'transferencia' | 'credito'
const DIAS_CREDITO_PRESETS = [7, 15, 30, 45, 60]

const MOTIVOS_SIN_VENTA = [
  'Tiene stock suficiente',
  'Local cerrado',
  'No estaba el encargado',
  'Problema de pago / deuda',
  'Precio',
  'Otro',
]

export type TipoSeguimiento = 'llamar' | 'whatsapp' | 'email' | 'visita'
const TIPOS_SEGUIMIENTO: { k: TipoSeguimiento; l: string }[] = [
  { k: 'llamar',   l: '📞 Llamar' },
  { k: 'whatsapp', l: '💬 WhatsApp' },
  { k: 'email',    l: '✉️ Correo' },
  { k: 'visita',   l: '🚗 Volver' },
]

export interface CierrePayload {
  items: ItemCarrito[]
  tienVenta: boolean
  motivo: string
  observaciones: string
  metodoPago: MetodoPago | null
  diasCredito: number | null
  fechaPagoEstimada: string | null
  /** null = no se agendó nada. Va a la Agenda del vendedor. */
  seguimiento: { tipo: TipoSeguimiento; fecha: string } | null
}

/**
 * Paso 2 — la venta completa en una sola pantalla.
 *
 * Reemplaza a los tres pasos que había antes (check-in GPS, "Vista 360°" y
 * catálogo). El GPS ahora se toma solo en segundo plano y la deuda del
 * cliente aparece como aviso acá arriba, que es donde sirve: en el momento
 * de decidir si se le vende y cómo cobra.
 */
export default function PasoVenta({
  clienteNombre, catalogo, carrito, setCarrito, onCerrar, guardando,
}: {
  clienteNombre: string
  catalogo: Record<string, CatalogoInfo>
  carrito: Map<string, ItemCarrito>
  setCarrito: (f: (prev: Map<string, ItemCarrito>) => Map<string, ItemCarrito>) => void
  onCerrar: (p: CierrePayload) => void
  guardando: boolean
}) {
  const [busca, setBusca] = useState('')
  const [esBarril, setEsBarril] = useState(false)
  const [hoja, setHoja] = useState<null | 'venta' | 'sin-venta'>(null)

  // Catálogo largo (cervezas + kombuchas) sin forma de volver arriba una vez
  // que se scrollea buscando un producto — pedido de Claudio. El botón
  // aparece recién pasado un scroll razonable, para no estorbar arriba.
  const [mostrarSubir, setMostrarSubir] = useState(false)
  useEffect(() => {
    function onScroll() { setMostrarSubir(window.scrollY > 320) }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const envaseName = esBarril ? 'Barril 30L' : 'Lata'
  const key = (producto: string) => `${producto}|${envaseName}`

  const productos = useMemo(() => {
    const q = busca.trim().toLowerCase()
    return Object.entries(catalogo)
      .filter(([nombre, info]) => {
        const precio = esBarril ? info.precio_barril : info.precio_lata
        if (precio <= 0) return false
        if (q && !nombre.toLowerCase().includes(q) && !info.estilo.toLowerCase().includes(q)) return false
        return true
      })
      .map(([nombre, info]) => ({ nombre, info, kombucha: esKombucha(info) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }, [catalogo, esBarril, busca])

  const cervezas = productos.filter(p => !p.kombucha)
  const kombuchas = productos.filter(p => p.kombucha)

  function setCantidad(nombre: string, info: CatalogoInfo, n: number) {
    setCarrito(prev => {
      const next = new Map(prev)
      const k = key(nombre)
      if (n <= 0) { next.delete(k); return next }
      next.set(k, {
        producto: nombre,
        categoria: esKombucha(info) ? 'Kombucha' : 'Cerveza',
        envase: envaseName,
        cantidad: n,
        precio: esBarril ? info.precio_barril : info.precio_lata,
      })
      return next
    })
  }

  const items = Array.from(carrito.values())
  const totalUnidades = items.reduce((s, i) => s + i.cantidad, 0)
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0)

  return (
    <div>
      <AvisoDeuda clienteNombre={clienteNombre} />

      {/* Lata / Barril */}
      <div style={{ display: 'flex', gap: 4, background: '#E2E8F0', borderRadius: 12, padding: 3, marginBottom: 10 }}>
        {[{ v: false, l: 'Latas' }, { v: true, l: 'Barriles' }].map(o => {
          const on = esBarril === o.v
          return (
            <button
              key={o.l}
              onClick={() => setEsBarril(o.v)}
              style={{
                flex: 1, minHeight: TAP, borderRadius: 10, border: 'none', cursor: 'pointer',
                background: on ? C.card : 'transparent', color: on ? C.text : C.muted,
                fontSize: 14, fontWeight: on ? 800 : 600,
                boxShadow: on ? '0 1px 3px rgba(15,23,42,.12)' : 'none',
              }}
            >
              {o.l}
            </button>
          )
        })}
      </div>

      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={16} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar producto…"
          style={{
            width: '100%', minHeight: 46, paddingLeft: 38, paddingRight: 12,
            borderRadius: 12, border: `1px solid ${C.line}`, background: C.card,
            fontSize: 15, color: C.text, outline: 'none',
          }}
        />
      </div>

      <ListaProductos titulo="Cervezas" productos={cervezas} carrito={carrito} keyDe={key} esBarril={esBarril} onCantidad={setCantidad} />
      <ListaProductos titulo="Kombuchas" productos={kombuchas} carrito={carrito} keyDe={key} esBarril={esBarril} onCantidad={setCantidad} />

      {productos.length === 0 && (
        <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, padding: '24px 0' }}>
          Sin productos que coincidan.
        </p>
      )}

      <button
        onClick={() => setHoja('sin-venta')}
        style={{
          width: '100%', minHeight: TAP, borderRadius: 12, marginTop: 18, cursor: 'pointer',
          border: `1px solid ${C.line}`, background: C.card, color: C.muted,
          fontSize: 14, fontWeight: 700,
        }}
      >
        Registrar visita sin venta
      </button>

      {/* Barra fija con el total */}
      {totalUnidades > 0 && (
        <div style={{
          position: 'fixed', left: 0, right: 0,
          bottom: 'max(96px, calc(env(safe-area-inset-bottom, 0px) + 84px))',
          padding: '0 16px', zIndex: 50, pointerEvents: 'none',
        }}>
          <div style={{ maxWidth: 720, margin: '0 auto', pointerEvents: 'auto' }}>
            <button
              onClick={() => setHoja('venta')}
              style={{
                width: '100%', minHeight: 58, borderRadius: 16, border: 'none', cursor: 'pointer',
                background: C.hero, color: '#fff', padding: '0 16px',
                display: 'flex', alignItems: 'center', gap: 12,
                boxShadow: '0 8px 24px rgba(15,23,42,.28)',
              }}
            >
              <ShoppingCart size={19} color="#F59E0B" style={{ flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <p style={{ fontSize: 11, color: '#94A3B8' }}>
                  {totalUnidades} {totalUnidades === 1 ? 'unidad' : 'unidades'} · {items.length} {items.length === 1 ? 'producto' : 'productos'}
                </p>
                <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.4px' }}>{fmtPrecioCLP(total)}</p>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#F59E0B', flexShrink: 0 }}>Cerrar →</span>
            </button>
          </div>
        </div>
      )}

      {mostrarSubir && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Volver arriba"
          style={{
            position: 'fixed', right: 16, zIndex: 51, cursor: 'pointer',
            bottom: totalUnidades > 0
              ? 'max(164px, calc(env(safe-area-inset-bottom, 0px) + 152px))'
              : 'max(28px, calc(env(safe-area-inset-bottom, 0px) + 16px))',
            width: 46, height: 46, borderRadius: '50%', border: `1px solid ${C.line}`,
            background: C.card, boxShadow: '0 4px 14px rgba(15,23,42,.18)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ArrowUp size={20} color={C.text} />
        </button>
      )}

      {hoja && (
        <HojaCierre
          modo={hoja}
          items={items}
          total={total}
          guardando={guardando}
          onCancelar={() => setHoja(null)}
          onConfirmar={onCerrar}
        />
      )}
    </div>
  )
}

function ListaProductos({ titulo, productos, carrito, keyDe, esBarril, onCantidad }: {
  titulo: string
  productos: { nombre: string; info: CatalogoInfo; kombucha: boolean }[]
  carrito: Map<string, ItemCarrito>
  keyDe: (n: string) => string
  esBarril: boolean
  onCantidad: (nombre: string, info: CatalogoInfo, n: number) => void
}) {
  if (productos.length === 0) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 7 }}>
        {titulo}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {productos.map(({ nombre, info, kombucha }) => {
          const cantidad = carrito.get(keyDe(nombre))?.cantidad ?? 0
          const precio = esBarril ? info.precio_barril : info.precio_lata
          const activo = cantidad > 0
          return (
            <div
              key={nombre}
              style={{
                ...cardStyle,
                border: `1px solid ${activo ? C.blue : C.line}`,
                background: activo ? C.blueSoft : C.card,
                padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 11,
              }}
            >
              <ProductoThumb nombre={nombre} categoria={kombucha ? 'Kombucha' : 'Cerveza'} esBarril={esBarril} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>{nombre}</p>
                <p style={{ fontSize: 12.5, fontWeight: 700, color: activo ? C.blue : C.muted, marginTop: 2 }}>
                  {fmtPrecioCLP(precio)}
                  {activo && <span style={{ color: C.text }}> · {fmtPrecioCLP(precio * cantidad)}</span>}
                </p>
              </div>
              <CantidadInput value={cantidad} onchange={n => onCantidad(nombre, info, n)} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Bottom sheet de cierre: pago + notas, o motivo si es visita sin venta. */
function HojaCierre({ modo, items, total, guardando, onCancelar, onConfirmar }: {
  modo: 'venta' | 'sin-venta'
  items: ItemCarrito[]
  total: number
  guardando: boolean
  onCancelar: () => void
  onConfirmar: (p: CierrePayload) => void
}) {
  const esVenta = modo === 'venta'
  const [metodoPago, setMetodoPago] = useState<MetodoPago | null>(null)
  const [diasCredito, setDiasCredito] = useState<number>(30)
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')
  // Seguimiento: plegado por defecto a propósito. Antes era un paso
  // obligatorio del cierre; ahora no cuesta ni un toque si no se usa, pero
  // sigue alimentando la Agenda del vendedor cuando sí hace falta.
  const [segTipo, setSegTipo] = useState<TipoSeguimiento | null>(null)
  const [segFecha, setSegFecha] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })

  const fechaPago = useMemo(() => {
    if (metodoPago !== 'credito') return null
    const d = new Date()
    d.setDate(d.getDate() + diasCredito)
    return d.toISOString().split('T')[0]
  }, [metodoPago, diasCredito])

  const puedeGuardar = esVenta ? metodoPago !== null : motivo !== ''

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancelar() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 400, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div style={{ background: C.bg, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 720, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: '#CBD5E1' }} />
        </div>

        <div style={{ padding: '4px 16px 12px', borderBottom: `1px solid ${C.line}`, display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 17, fontWeight: 800, color: C.text }}>
              {esVenta ? 'Cerrar venta' : 'Visita sin venta'}
            </p>
            {esVenta && (
              <p style={{ fontSize: 13, color: C.muted }}>
                {items.length} {items.length === 1 ? 'producto' : 'productos'} · <b style={{ color: C.text }}>{fmtPrecioCLP(total)}</b>
              </p>
            )}
          </div>
          <button onClick={onCancelar} aria-label="Cerrar"
            style={{ width: 34, height: 34, borderRadius: '50%', border: 'none', background: '#E2E8F0', color: C.text, cursor: 'pointer', flexShrink: 0 }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px 20px' }}>
          {esVenta ? (
            <>
              <p style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 8 }}>¿CÓMO PAGA?</p>
              <div style={{ display: 'flex', gap: 7, marginBottom: 14 }}>
                {([
                  { k: 'efectivo' as const, l: 'Efectivo', Icon: Banknote },
                  { k: 'transferencia' as const, l: 'Transfer.', Icon: Landmark },
                  { k: 'credito' as const, l: 'Crédito', Icon: CreditCard },
                ]).map(({ k, l, Icon }) => {
                  const on = metodoPago === k
                  return (
                    <button
                      key={k}
                      onClick={() => setMetodoPago(k)}
                      style={{
                        flex: 1, minHeight: 62, borderRadius: 13, cursor: 'pointer',
                        border: `1.5px solid ${on ? C.blue : C.line}`,
                        background: on ? C.blueSoft : C.card, color: on ? C.blue : C.muted,
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                        fontSize: 12, fontWeight: on ? 800 : 600,
                      }}
                    >
                      <Icon size={18} />
                      {l}
                    </button>
                  )
                })}
              </div>

              {metodoPago === 'credito' && (
                <div style={{ ...cardStyle, padding: 12, marginBottom: 14 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 8 }}>Plazo de pago</p>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {DIAS_CREDITO_PRESETS.map(d => {
                      const on = diasCredito === d
                      return (
                        <button
                          key={d}
                          onClick={() => setDiasCredito(d)}
                          style={{
                            flex: '1 1 60px', minHeight: TAP, borderRadius: 10, cursor: 'pointer',
                            border: `1.5px solid ${on ? C.amber : C.line}`,
                            background: on ? C.amberSoft : C.card, color: on ? C.amber : C.muted,
                            fontSize: 13, fontWeight: on ? 800 : 600,
                          }}
                        >
                          {d}d
                        </button>
                      )
                    })}
                  </div>
                  {fechaPago && (
                    <p style={{ fontSize: 12, color: C.amber, fontWeight: 700, marginTop: 9 }}>
                      Cobrar el {new Date(fechaPago + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })}
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            <>
              <p style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 8 }}>¿POR QUÉ NO COMPRÓ?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
                {MOTIVOS_SIN_VENTA.map(m => {
                  const on = motivo === m
                  return (
                    <button
                      key={m}
                      onClick={() => setMotivo(m)}
                      style={{
                        minHeight: TAP + 4, borderRadius: 12, cursor: 'pointer', padding: '0 14px',
                        border: `1.5px solid ${on ? C.blue : C.line}`,
                        background: on ? C.blueSoft : C.card, color: on ? C.blue : C.text,
                        fontSize: 14, fontWeight: on ? 800 : 600, textAlign: 'left',
                        display: 'flex', alignItems: 'center', gap: 9,
                      }}
                    >
                      {on ? <Check size={16} color={C.blue} /> : <span style={{ width: 16, flexShrink: 0 }} />}
                      {m}
                    </button>
                  )
                })}
              </div>
            </>
          )}

          {/* Seguimiento opcional */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 8 }}>
              ¿AGENDAR SEGUIMIENTO? <span style={{ fontWeight: 600, textTransform: 'none' }}>(opcional)</span>
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {TIPOS_SEGUIMIENTO.map(({ k, l }) => {
                const on = segTipo === k
                return (
                  <button
                    key={k}
                    onClick={() => setSegTipo(on ? null : k)}
                    style={{
                      flex: '1 1 84px', minHeight: TAP, borderRadius: 11, cursor: 'pointer',
                      border: `1.5px solid ${on ? C.purple : C.line}`,
                      background: on ? C.purpleSoft : C.card, color: on ? C.purple : C.muted,
                      fontSize: 12.5, fontWeight: on ? 800 : 600,
                    }}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
            {segTipo && (
              <label style={{ display: 'block', marginTop: 9 }}>
                <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 5 }}>
                  ¿Cuándo?
                </span>
                <input
                  type="date"
                  value={segFecha}
                  onChange={e => setSegFecha(e.target.value)}
                  style={{
                    width: '100%', minHeight: TAP, padding: '0 12px', borderRadius: 11,
                    border: `1px solid ${C.line}`, background: C.card, fontSize: 15, color: C.text, outline: 'none',
                  }}
                />
              </label>
            )}
          </div>

          <label style={{ display: 'block' }}>
            <span style={{ display: 'block', fontSize: 12, fontWeight: 800, color: C.muted, marginBottom: 7 }}>
              NOTAS {esVenta ? '(opcional)' : ''}
            </span>
            <textarea
              value={obs}
              onChange={e => setObs(e.target.value)}
              placeholder="Algo que valga la pena recordar de esta visita…"
              rows={3}
              style={{
                width: '100%', padding: 12, borderRadius: 12, resize: 'vertical',
                border: `1px solid ${C.line}`, background: C.card, fontSize: 15, color: C.text, outline: 'none',
              }}
            />
          </label>
        </div>

        <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.line}`, background: C.card, flexShrink: 0, paddingBottom: 'max(16px, env(safe-area-inset-bottom, 16px))' }}>
          <button
            onClick={() => onConfirmar({
              items: esVenta ? items : [],
              tienVenta: esVenta,
              motivo: esVenta ? '' : motivo,
              observaciones: obs,
              metodoPago: esVenta ? metodoPago : null,
              diasCredito: esVenta && metodoPago === 'credito' ? diasCredito : null,
              fechaPagoEstimada: esVenta ? fechaPago : null,
              seguimiento: segTipo ? { tipo: segTipo, fecha: segFecha } : null,
            })}
            disabled={!puedeGuardar || guardando}
            style={{
              ...btnPrimario,
              background: puedeGuardar && !guardando ? (esVenta ? C.green : C.hero) : C.line,
              color: puedeGuardar && !guardando ? '#fff' : C.faint,
              cursor: puedeGuardar && !guardando ? 'pointer' : 'not-allowed',
            }}
          >
            {guardando ? 'Guardando…' : esVenta ? <><Check size={18} /> Registrar venta</> : 'Registrar visita'}
          </button>
          {!puedeGuardar && (
            <p style={{ fontSize: 11.5, color: C.muted, textAlign: 'center', marginTop: 7 }}>
              {esVenta ? 'Elige cómo paga para continuar' : 'Elige un motivo para continuar'}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

