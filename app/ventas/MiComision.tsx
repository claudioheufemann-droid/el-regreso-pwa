'use client'

import { useEffect, useMemo, useState } from 'react'
import { Wallet, ArrowRight, X, TrendingUp, AlertTriangle, Check } from 'lucide-react'
import {
  TASA_COMISION, BONO_PAGO, ESCALAS_ACTIVACION,
  proyectarAlCierre, fComision,
  type ResumenComision, type ClienteComision, type ProductoComision, type CarteraComision,
  type PorEntregarComision,
} from '@/lib/comisiones'

/**
 * "Lo que gano yo" — remuneración variable del Gerente Comercial según la
 * cláusula NOVENA de su contrato, calculada sobre la venta real del equipo.
 *
 * Sólo se monta si el usuario tiene el permiso (ver app/ventas/page.tsx): es
 * información de sueldo, no un KPI del equipo.
 *
 * Los datos se piden aparte del dashboard, al montar, para no frenar la carga
 * de la pantalla principal con tres consultas más.
 */

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0',
  blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#059669', greenSoft: '#ECFDF5',
  amber: '#D97706', amberSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2',
  purple: '#7C3AED', purpleSoft: '#F5F3FF',
}

const fL = (n: number) => `${n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
const fPct = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`

interface Payload {
  resumen: ResumenComision
  clientes: ClienteComision[]
  productos: ProductoComision[]
  cartera: CarteraComision
  porEntregar: PorEntregarComision
}

export default function MiComision({ desde, hasta, nombrePeriodo, isDesktop = false }: {
  desde: string; hasta: string; nombrePeriodo: string
  /** Desktop: número principal más grande y hoja de detalle como modal
   *  centrado — la tarjeta ya no compite por un ancho de 760px. */
  isDesktop?: boolean
}) {
  const [data, setData] = useState<Payload | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  // El componente se remonta al cambiar de período (ver la `key` en
  // VentasHoyClient), así que el estado ya parte limpio: no hace falta
  // resetearlo acá dentro.
  useEffect(() => {
    let vivo = true
    fetch(`/api/ventas/comision?desde=${desde}&hasta=${hasta}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then(d => { if (vivo) setData(d) })
      .catch(e => { if (vivo) setError(String(e)) })
    return () => { vivo = false }
  }, [desde, hasta])

  // Mini "de dónde sale tu comisión" — antes de los returns tempranos
  // (regla de hooks). Mismo cálculo que porCategoria en HojaDetalle pero
  // sólo top 2, para el frente de la tarjeta: en desktop le da a "Lo que
  // gano yo" el mismo tipo de contenido (un mini mix) que ya tenía el hero
  // de Ventas de al lado con su Mix de Productos, así las dos tarjetas
  // quedan con un alto y una densidad de información parecidos en vez de
  // que ésta termine visiblemente más corta.
  const porCategoriaMini = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of data?.productos ?? []) {
      m.set(p.categoria, (m.get(p.categoria) ?? 0) + p.ventaNeta)
    }
    // TODAS las categorías, no sólo las 2 mayores: las notas de crédito y
    // descuentos del ERP caen en "Otros" con monto negativo (≈ −$1,9M en
    // Sep-2026) y al esconderlas Cerveza + Kombucha sumaban más que la
    // comisión real. Así las filas siempre cuadran con el 1% de arriba.
    return [...m.entries()].filter(([, v]) => Math.round(v * TASA_COMISION) !== 0).sort((a, b) => b[1] - a[1])
  }, [data])

  if (error) return null           // sin permiso o error: la tarjeta no existe
  if (!data) return <Esqueleto />

  const { resumen, porEntregar } = data
  const proyeccion = proyectarAlCierre(resumen.variableTotal, desde, hasta)
  // Cuánto más ganarías si TODO el pipeline actual (pedidos ya tomados, aún
  // sin despachar) se entregara — sólo la comisión, no recalcula bonos de
  // escala/cartera porque a los volúmenes de hoy no cambian de peldaño.
  const comisionPipeline = porEntregar.ventaNeta * TASA_COMISION
  const totalConPipeline = resumen.variableTotal + comisionPipeline

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        style={{
          background: C.hero, borderRadius: 18, padding: isDesktop ? 24 : 18, width: '100%',
          border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: '#fff',
          ...(isDesktop ? { height: '100%', display: 'flex', flexDirection: 'column' } : {}),
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <span style={{ width: 36, height: 36, borderRadius: 11, background: 'rgba(245,158,11,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Wallet size={18} color="#F59E0B" />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em' }}>LO QUE GANO YO</p>
            <p style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
              Comisión y bonos · {nombrePeriodo}
            </p>
          </div>
          <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ArrowRight size={16} color="#F59E0B" />
          </span>
        </div>

        <p style={{ fontSize: isDesktop ? 40 : 30, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
          {fComision(resumen.variableTotal)}
        </p>
        <p style={{ fontSize: 12.5, color: '#CBD5E1', marginTop: 4 }}>
          llevas ganado en el período
        </p>

        {/* Dos proyecciones DISTINTAS a propósito, cada una etiquetada para
            que no parezcan números que se contradicen:
            · Pipeline: lo que ya está tomado y sólo falta despachar.
            · Ritmo: estimación lineal según cuánto llevas vendido por día,
              proyectada a los días que quedan del período — puede ser mayor
              o menor que el pipeline, porque asume que seguirás vendiendo. */}
        {comisionPipeline > 0 && (
          <p style={{ fontSize: 12, color: '#F59E0B', fontWeight: 600, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <TrendingUp size={13} />
            +{fComision(comisionPipeline)} si se entrega el pipeline → {fComision(totalConPipeline)} en total
          </p>
        )}
        {proyeccion !== null && proyeccion > resumen.variableTotal && (
          <p style={{ fontSize: 12, color: '#34D399', fontWeight: 600, marginTop: 4, display: 'flex', alignItems: 'center', gap: 5 }}>
            <TrendingUp size={13} />
            Al ritmo de hoy, cerrarías el período en {fComision(proyeccion)}
          </p>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: isDesktop ? '18px 0 16px' : '14px 0 12px' }} />

        {/* Entregado vs por entregar — pedido explícito de Claudio: la
            comisión SIEMPRE se calcula sobre lo entregado, lo por entregar es
            sólo "lo que podría tener" cuando se despache, no cuenta todavía.
            En desktop las 4 cifras (entregado, por entregar, comisión, bonos)
            van en UNA sola fila de 4 columnas — antes eran dos filas de 2,
            cada una angosta en el medio de una tarjeta enorme, dejando la
            mitad derecha en blanco. En mobile se mantienen las dos filas de
            siempre. */}
        {isDesktop ? (
          // 2x2, no 4 en una fila: con montos en pesos chilenos (hasta 11
          // caracteres) 4 columnas de 1fr quedaban tan angostas que el
          // nowrap desbordaba una cifra encima de la siguiente columna.
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '18px 24px' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12.5, color: '#94A3B8' }}>Entregado</p>
              <p style={{ fontSize: 25, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fComision(resumen.ventaNeta)}
              </p>
              <p style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>base de tu comisión</p>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12.5, color: '#94A3B8' }}>Por entregar</p>
              <p style={{ fontSize: 25, fontWeight: 800, color: '#F59E0B', letterSpacing: '-0.5px', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fComision(porEntregar.ventaNeta)}
              </p>
              <p style={{ fontSize: 11.5, color: '#94A3B8', marginTop: 2 }}>aún no cuenta</p>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12.5, color: '#94A3B8' }}>Comisión 1%</p>
              <p style={{ fontSize: 25, fontWeight: 800, color: '#34D399', letterSpacing: '-0.5px', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fComision(resumen.comision)}
              </p>
            </div>
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12.5, color: '#94A3B8' }}>Bonos</p>
              <p style={{ fontSize: 25, fontWeight: 800, color: resumen.variableTotal > resumen.comision ? '#F59E0B' : '#64748B', letterSpacing: '-0.5px', marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {fComision(resumen.bonoEscala + resumen.bonoPago + resumen.bonoActivacion)}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                <p style={{ fontSize: 11, color: '#94A3B8' }}>Entregado</p>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.4px', marginTop: 3, whiteSpace: 'nowrap' }}>
                  {fComision(resumen.ventaNeta)}
                </p>
                <p style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>base de tu comisión</p>
              </div>
              <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                <p style={{ fontSize: 11, color: '#94A3B8' }}>Por entregar</p>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#F59E0B', letterSpacing: '-0.4px', marginTop: 3, whiteSpace: 'nowrap' }}>
                  {fComision(porEntregar.ventaNeta)}
                </p>
                <p style={{ fontSize: 10.5, color: '#94A3B8', marginTop: 1 }}>
                  aún no cuenta · {fComision(comisionPipeline)} de comisión si se entrega
                </p>
              </div>
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '12px 0' }} />

            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                <p style={{ fontSize: 11, color: '#94A3B8' }}>Comisión 1%</p>
                <p style={{ fontSize: 17, fontWeight: 800, color: '#34D399', letterSpacing: '-0.4px', marginTop: 3, whiteSpace: 'nowrap' }}>
                  {fComision(resumen.comision)}
                </p>
              </div>
              <div style={{ flex: '1 1 120px', minWidth: 0 }}>
                <p style={{ fontSize: 11, color: '#94A3B8' }}>Bonos</p>
                <p style={{ fontSize: 17, fontWeight: 800, color: resumen.variableTotal > resumen.comision ? '#F59E0B' : '#64748B', letterSpacing: '-0.4px', marginTop: 3, whiteSpace: 'nowrap' }}>
                  {fComision(resumen.bonoEscala + resumen.bonoPago + resumen.bonoActivacion)}
                </p>
              </div>
            </div>
          </>
        )}

        {resumen.ventaEnRiesgo > 0 && (
          <p style={{ fontSize: 11.5, color: '#F59E0B', marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {fComision(resumen.ventaEnRiesgo)} de lo entregado es de clientes con deuda vencida
              — ya está comisionando, pero vale la pena cobrarlo
            </span>
          </p>
        )}

        {/* marginTop:'auto' — empuja este bloque al piso de la tarjeta,
            ocupando el espacio que sobra ahora que la tarjeta se estira al
            alto del hero de Ventas (ver grid en VentasHoyClient). */}
        {isDesktop && porCategoriaMini.length > 0 && (
          <div style={{ marginTop: 'auto', paddingTop: 18 }}>
            <div style={{ height: 1, background: 'rgba(255,255,255,.1)', marginBottom: 14 }} />
            <p style={{ fontSize: 10.5, fontWeight: 800, color: '#94A3B8', letterSpacing: '0.06em', marginBottom: 10 }}>
              DE DÓNDE SALE TU COMISIÓN
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {(() => {
                const total = porCategoriaMini.reduce((s, [, v]) => s + Math.max(0, v), 0)
                return porCategoriaMini.map(([cat, venta]) => {
                  const pct = total > 0 ? (Math.max(0, venta) / total) * 100 : 0
                  const color = venta < 0 ? '#F87171' : cat === 'Kombucha' ? '#34D399' : cat === 'Cerveza' ? '#F59E0B' : '#A78BFA'
                  return (
                    <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontSize: 12.5, fontWeight: 700, width: 104, flexShrink: 0, whiteSpace: 'nowrap' }}>{nombreCategoria(cat, venta)}</span>
                      <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'rgba(255,255,255,.1)', overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color, width: 76, textAlign: 'right', flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {fComision(venta * TASA_COMISION)}
                      </span>
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        )}
      </button>

      {abierto && <HojaDetalle data={data} desde={desde} hasta={hasta} nombrePeriodo={nombrePeriodo} onClose={() => setAbierto(false)} isDesktop={isDesktop} />}
    </>
  )
}

/** Las filas negativas de "Otros" son notas de crédito/descuentos del ERP
 *  (litros 0, monto negativo) — se nombran como tales para que se entienda
 *  por qué restan. */
function nombreCategoria(cat: string, venta: number): string {
  return venta < 0 && cat === 'Otros' ? 'Notas de crédito' : cat
}

function Esqueleto() {
  return (
    <div style={{ background: C.hero, borderRadius: 18, padding: 18, opacity: 0.5 }}>
      <div style={{ height: 12, width: 130, borderRadius: 4, background: 'rgba(255,255,255,.12)', marginBottom: 14 }} />
      <div style={{ height: 30, width: 180, borderRadius: 6, background: 'rgba(255,255,255,.12)' }} />
    </div>
  )
}

// ─── Detalle ────────────────────────────────────────────────────────────────

type Vista = 'resumen' | 'clientes' | 'productos'

function HojaDetalle({ data, desde, hasta, nombrePeriodo, onClose, isDesktop: isDesktopProp = false }: {
  data: Payload; desde: string; hasta: string; nombrePeriodo: string; onClose: () => void
  isDesktop?: boolean
}) {
  // /ventas/comisiones no pasa isDesktop: sin esto, en pantalla ancha la hoja
  // se estiraba a todo el ancho y el texto quedaba perdido en los bordes.
  const [anchoGrande, setAnchoGrande] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const sync = () => setAnchoGrande(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  const isDesktop = isDesktopProp || anchoGrande
  const [vista, setVista] = useState<Vista>('resumen')
  const [busca, setBusca] = useState('')
  const { resumen, clientes, productos, cartera, porEntregar } = data
  const comisionPipeline = porEntregar.ventaNeta * TASA_COMISION
  const totalConPipeline = resumen.variableTotal + comisionPipeline

  const clientesVisibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = [...clientes].sort((a, b) => (b.comisiona ? b.ventaNeta : 0) - (a.comisiona ? a.ventaNeta : 0))
    return q ? base.filter(c => c.cliente.toLowerCase().includes(q) || c.vendedor.toLowerCase().includes(q)) : base
  }, [clientes, busca])

  const productosVisibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = [...productos].sort((a, b) => b.ventaNeta - a.ventaNeta)
    return q ? base.filter(p => p.producto.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q)) : base
  }, [productos, busca])

  const porCategoria = useMemo(() => {
    const m = new Map<string, { venta: number; litros: number }>()
    for (const p of productos) {
      const a = m.get(p.categoria) ?? { venta: 0, litros: 0 }
      a.venta += p.ventaNeta; a.litros += p.litros
      m.set(p.categoria, a)
    }
    return [...m.entries()].sort((a, b) => b[1].venta - a[1].venta)
  }, [productos])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,.45)', display: 'flex',
        flexDirection: 'column', justifyContent: isDesktop ? 'center' : 'flex-end',
        alignItems: isDesktop ? 'center' : 'stretch',
      }}
    >
      <div style={{
        background: C.bg, display: 'flex', flexDirection: 'column',
        ...(isDesktop
          ? { borderRadius: 22, maxHeight: '88vh', width: '720px', maxWidth: '94vw', boxShadow: '0 24px 60px rgba(15,23,42,.35)' }
          : { borderRadius: '20px 20px 0 0', maxHeight: '92vh' }),
      }}>
        {!isDesktop && (
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: '#CBD5E1' }} />
        </div>
        )}

        <div style={{ padding: isDesktop ? '20px 24px 16px' : '6px 16px 14px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.3px' }}>Lo que gano yo</p>
              <p style={{ fontSize: 14, color: C.muted, marginTop: 2 }}>{nombrePeriodo} · {desde} a {hasta}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar"
              style={{ width: 40, height: 40, borderRadius: '50%', border: 'none', background: '#E2E8F0', color: C.text, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <X size={20} />
            </button>
          </div>

          {/* Sólo el variable: el sueldo base y la gratificación quedan fuera
              a propósito (pedido de Claudio, ya los tiene claros). */}
          <div style={{ background: C.hero, borderRadius: 16, padding: '16px 18px', marginTop: 14 }}>
            <p style={{ fontSize: 13.5, color: '#94A3B8' }}>Variable bruto del período</p>
            <p style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-1px', lineHeight: 1.1, marginTop: 2 }}>
              {fComision(resumen.variableTotal)}
            </p>
            <p style={{ fontSize: 14, color: '#CBD5E1', marginTop: 4 }}>
              comisión + bonos por venta y cobranza
            </p>
            <p style={{ fontSize: 14.5, color: '#F59E0B', fontWeight: 600, marginTop: 12 }}>
              +{fComision(comisionPipeline)} si se entrega el pipeline → {fComision(totalConPipeline)} en total
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 18px', marginTop: 12, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.1)' }}>
              <span style={{ fontSize: 14, color: '#CBD5E1' }}>
                Entregado <b style={{ color: '#fff' }}>{fComision(resumen.ventaNeta)}</b>
              </span>
              <span style={{ fontSize: 14, color: '#CBD5E1' }}>
                Por entregar <b style={{ color: '#F59E0B' }}>{fComision(porEntregar.ventaNeta)}</b>
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 4, background: '#E2E8F0', borderRadius: 12, padding: 4, marginTop: 14 }}>
            {([['resumen', 'Resumen'], ['clientes', 'Por cliente'], ['productos', 'Por producto']] as [Vista, string][]).map(([k, l]) => {
              const on = vista === k
              return (
                <button key={k} onClick={() => { setVista(k); setBusca('') }} style={{
                  flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: on ? C.card : 'transparent', color: on ? C.text : C.muted,
                  fontSize: 15, fontWeight: on ? 700 : 600, minHeight: 44,
                  boxShadow: on ? '0 1px 3px rgba(15,23,42,.12)' : 'none',
                }}>{l}</button>
              )
            })}
          </div>

          {vista !== 'resumen' && (
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder={vista === 'clientes' ? 'Buscar cliente o vendedor…' : 'Buscar producto…'}
              style={{
                marginTop: 12, width: '100%', padding: '12px 14px', borderRadius: 12,
                border: `1px solid ${C.line}`, background: C.card, fontSize: 16, color: C.text, outline: 'none',
              }}
            />
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: isDesktop ? '16px 24px 28px' : '14px 16px 28px' }}>
          {vista === 'resumen' && <Resumen resumen={resumen} cartera={cartera} porCategoria={porCategoria} />}

          {vista === 'clientes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {clientesVisibles.map(c => (
                <div key={c.cliente} style={{
                  background: C.card, borderRadius: 14, padding: '14px 16px',
                  border: `1px solid ${c.comisiona ? C.line : '#FDE68A'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 16.5, fontWeight: 700, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{c.cliente}</p>
                      <p style={{ fontSize: 14, color: C.muted, marginTop: 3 }}>
                        {c.vendedor} · {fL(c.litros)} · {c.pedidos} {c.pedidos === 1 ? 'pedido' : 'pedidos'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 18, fontWeight: 800, color: c.comisiona ? C.green : C.amber, whiteSpace: 'nowrap' }}>
                        {fComision(c.ventaNeta * TASA_COMISION)}
                      </p>
                      <p style={{ fontSize: 13.5, color: C.muted, whiteSpace: 'nowrap', marginTop: 2 }}>de {fComision(c.ventaNeta)}</p>
                    </div>
                  </div>
                  {!c.comisiona && (
                    <p style={{ fontSize: 14, color: C.amber, fontWeight: 600, marginTop: 9, display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={15} />
                      Debe {fComision(c.deudaVencida)} vencido — igual comisiona, cóbraselo
                    </p>
                  )}
                </div>
              ))}
              {clientesVisibles.length === 0 && (
                <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 28 }}>Sin coincidencias.</p>
              )}
            </div>
          )}

          {vista === 'productos' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {productosVisibles.map(p => (
                <div key={`${p.producto}|${p.envase}`} style={{ background: C.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${C.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 16.5, fontWeight: 700, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{p.producto}</p>
                      <p style={{ fontSize: 14, color: C.muted, marginTop: 3 }}>
                        {[p.envase, p.categoria, `${p.clientes} ${p.clientes === 1 ? 'cliente' : 'clientes'}`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 18, fontWeight: 800, color: p.ventaNeta >= 0 ? C.green : C.red, whiteSpace: 'nowrap' }}>
                        {fComision(p.ventaNeta * TASA_COMISION)}
                      </p>
                      <p style={{ fontSize: 13.5, color: C.muted, whiteSpace: 'nowrap', marginTop: 2 }}>de {fComision(p.ventaNeta)} · {fL(p.litros)}</p>
                    </div>
                  </div>
                </div>
              ))}
              {productosVisibles.length === 0 && (
                <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 28 }}>Sin coincidencias.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Resumen({ resumen, cartera, porCategoria }: {
  resumen: ResumenComision
  cartera: CarteraComision
  porCategoria: [string, { venta: number; litros: number }][]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Comisión */}
      <Bloque titulo="COMISIÓN 1% SOBRE VENTA ENTREGADA" monto={resumen.comision} color={C.green}>
        <Linea label="Venta neta entregada del equipo" valor={fComision(resumen.ventaNeta)} destacado />
        {resumen.ventaEnRiesgo > 0 && (
          <Linea label="De la cual, con deuda vencida" valor={fComision(resumen.ventaEnRiesgo)} color={C.amber} />
        )}
        <p style={nota}>
          El 1% se calcula sobre TODA la venta neta entregada a los clientes (cláusula
          novena). La deuda vencida no descuenta de tu comisión — queda marcada arriba
          sólo como alerta para que la gestiones con esos clientes.
        </p>
      </Bloque>

      {/* Mix */}
      {porCategoria.length > 0 && (
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 18 }}>
          <p style={{ fontSize: 13.5, fontWeight: 800, color: C.muted, letterSpacing: '0.04em', marginBottom: 14 }}>
            DE DÓNDE SALE TU COMISIÓN
          </p>
          {porCategoria.map(([cat, v]) => {
            const emoji = cat === 'Kombucha' ? '🧃' : cat === 'Cerveza' ? '🍺' : '📦'
            const color = v.venta < 0 ? C.red : cat === 'Kombucha' ? C.green : cat === 'Cerveza' ? C.amber : C.purple
            const total = porCategoria.reduce((s, [, x]) => s + Math.max(0, x.venta), 0)
            const pct = total > 0 ? (Math.max(0, v.venta) / total) * 100 : 0
            return (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <span style={{ fontSize: 20, flexShrink: 0 }}>{emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: C.text }}>{nombreCategoria(cat, v.venta)}</span>
                    {v.venta >= 0 && <span style={{ fontSize: 14, fontWeight: 700, color }}>{Math.round(pct)}%</span>}
                  </div>
                  <div style={{ height: 7, borderRadius: 4, background: C.line, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 4 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 17, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>
                    {fComision(v.venta * TASA_COMISION)}
                  </p>
                  <p style={{ fontSize: 13.5, color: C.muted, whiteSpace: 'nowrap', marginTop: 1 }}>{fL(v.litros)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Escala */}
      <Bloque titulo="BONO POR ESCALA DE VENTA" monto={resumen.bonoEscala} color={resumen.bonoEscala > 0 ? C.green : C.faint}>
        {resumen.escalaAlcanzada
          ? <Linea label="Alcanzada" valor={resumen.escalaAlcanzada} destacado />
          : <Linea label="Aún sin alcanzar la Escala 1" valor="$50.000.000" />}
        {resumen.faltaParaProximaEscala !== null && (
          <Linea
            label={`Falta para ${resumen.proximaEscala}`}
            valor={fComision(resumen.faltaParaProximaEscala)}
            color={C.amber}
          />
        )}
        {resumen.proximaEscalaBono !== null && (
          <Linea
            label={`Si llegas a ${resumen.proximaEscala}, ganas`}
            valor={fComision(resumen.proximaEscalaBono)}
            destacado
            color={C.green}
          />
        )}
        <p style={nota}>
          Los bonos de escala no se suman entre sí: el de un peldaño reemplaza al
          anterior. Además el contrato los condiciona a margen mínimo por canal y al
          plan de crecimiento acordado con gerencia — eso lo valida gerencia, no la app.
        </p>
      </Bloque>

      {/* Bono pago */}
      <Bloque titulo="BONO COMPORTAMIENTO DE PAGO" monto={resumen.bonoPago} color={resumen.bonoPago > 0 ? C.green : C.faint}>
        <Linea label="Clientes al día" valor={`${cartera.clientesAlDia} de ${cartera.clientesConVenta}`} />
        <Linea
          label="Cumplimiento"
          valor={fPct(resumen.pctAlDia)}
          destacado
          color={resumen.pctAlDia > BONO_PAGO.minimoAlDiaPct ? C.green : C.amber}
        />
        <Linea label="Se paga sobre" valor={`${BONO_PAGO.minimoAlDiaPct}%`} />
        {resumen.bonoPago === 0 && (
          <Linea label="Si cumples, ganas" valor={fComision(BONO_PAGO.monto)} destacado color={C.green} />
        )}
      </Bloque>

      {/* Bono activación */}
      <Bloque titulo="BONO ACTIVACIÓN DE CARTERA (CRM)" monto={resumen.bonoActivacion} color={resumen.bonoActivacion > 0 ? C.green : C.faint}>
        <Linea label="Clientes activos" valor={`${cartera.clientesActivos} de ${cartera.clientesCartera}`} />
        <Linea label="Activación" valor={fPct(resumen.pctActivacion)} destacado color={resumen.bonoActivacion > 0 ? C.green : C.amber} />
        <Linea label="Visitas registradas en Terreno" valor={String(cartera.interacciones)} />
        {resumen.proximaActivacion && (() => {
          // Cuántos clientes activos más hacen falta para el próximo peldaño —
          // más accionable que sólo el %: es la cantidad de clientes que hay
          // que visitar 2 veces (y que compren) en lo que queda del período.
          const faltan = Math.max(0, Math.ceil(cartera.clientesCartera * resumen.proximaActivacion.minimoPct / 100) - cartera.clientesActivos)
          return (
            <>
              <Linea label={`Te faltan para el ${resumen.proximaActivacion.minimoPct}%`} valor={`${faltan} ${faltan === 1 ? 'cliente' : 'clientes'}`} />
              <Linea
                label={`Si llegas a ${resumen.proximaActivacion.minimoPct}%, ganas`}
                valor={fComision(resumen.proximaActivacion.bono)}
                destacado
                color={C.green}
              />
            </>
          )
        })()}
        <p style={nota}>
          Cartera = clientes del área que compraron en los últimos 90 días (sin OnLine).
          Un cliente está activo si tiene 2 o más visitas registradas en Terreno y 1 pedido
          en el período. Bono: {ESCALAS_ACTIVACION[1].minimoPct}% → {fComision(ESCALAS_ACTIVACION[1].bono)},{' '}
          {ESCALAS_ACTIVACION[0].minimoPct}% → {fComision(ESCALAS_ACTIVACION[0].bono)}.
          Las visitas que no se registren en Terreno no cuentan.
        </p>
      </Bloque>

      <p style={{ fontSize: 13, color: C.faint, textAlign: 'center', lineHeight: 1.6, padding: '4px 8px 0' }}>
        Montos brutos, antes de imposiciones.
      </p>
    </div>
  )
}

/** Texto explicativo al pie de cada bloque. */
const nota: React.CSSProperties = {
  fontSize: 14, color: C.muted, marginTop: 10, lineHeight: 1.55, paddingTop: 10, borderTop: `1px solid ${C.line}`,
}

function Bloque({ titulo, monto, color, children }: {
  titulo: string; monto: number; color: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: C.muted, letterSpacing: '0.04em' }}>{titulo}</p>
        <p style={{ fontSize: 22, fontWeight: 800, color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
          {monto > 0 && <Check size={19} />}
          {fComision(monto)}
        </p>
      </div>
      {children}
    </div>
  )
}

function Linea({ label, valor, destacado = false, color }: {
  label: string; valor: string; destacado?: boolean; color?: string
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
      <span style={{ fontSize: 15.5, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 15.5, fontWeight: destacado ? 800 : 600, color: color ?? C.text, whiteSpace: 'nowrap' }}>{valor}</span>
    </div>
  )
}
