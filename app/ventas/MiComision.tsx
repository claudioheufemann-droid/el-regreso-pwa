'use client'

import { useEffect, useMemo, useState } from 'react'
import { Wallet, ArrowRight, X, TrendingUp, AlertTriangle, Check } from 'lucide-react'
import {
  TASA_COMISION, BONO_PAGO, ESCALAS_ACTIVACION,
  proyectarAlCierre, fComision,
  type ResumenComision, type ClienteComision, type ProductoComision, type CarteraComision,
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
}

export default function MiComision({ desde, hasta, nombrePeriodo }: {
  desde: string; hasta: string; nombrePeriodo: string
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

  if (error) return null           // sin permiso o error: la tarjeta no existe
  if (!data) return <Esqueleto />

  const { resumen } = data
  const proyeccion = proyectarAlCierre(resumen.variableTotal, desde, hasta)

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        style={{
          background: C.hero, borderRadius: 18, padding: 18, width: '100%',
          border: 'none', textAlign: 'left', cursor: 'pointer', font: 'inherit', color: '#fff',
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

        <p style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-1px', lineHeight: 1 }}>
          {fComision(resumen.variableTotal)}
        </p>
        <p style={{ fontSize: 12.5, color: '#CBD5E1', marginTop: 4 }}>
          variable bruto acumulado en el período
        </p>

        {proyeccion !== null && proyeccion > resumen.variableTotal && (
          <p style={{ fontSize: 12, color: '#34D399', fontWeight: 600, marginTop: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
            <TrendingUp size={13} />
            Al ritmo de hoy cerrarías en {fComision(proyeccion)}
          </p>
        )}

        <div style={{ height: 1, background: 'rgba(255,255,255,.1)', margin: '14px 0 12px' }} />

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

        {resumen.ventaEnRiesgo > 0 && (
          <p style={{ fontSize: 11.5, color: '#F59E0B', marginTop: 12, display: 'flex', alignItems: 'flex-start', gap: 6, lineHeight: 1.4 }}>
            <AlertTriangle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {fComision(resumen.comisionPotencial - resumen.comision)} más si cobras los{' '}
              {fComision(resumen.ventaEnRiesgo)} de clientes con deuda vencida
            </span>
          </p>
        )}
      </button>

      {abierto && <HojaDetalle data={data} desde={desde} hasta={hasta} nombrePeriodo={nombrePeriodo} onClose={() => setAbierto(false)} />}
    </>
  )
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

function HojaDetalle({ data, desde, hasta, nombrePeriodo, onClose }: {
  data: Payload; desde: string; hasta: string; nombrePeriodo: string; onClose: () => void
}) {
  const [vista, setVista] = useState<Vista>('resumen')
  const [busca, setBusca] = useState('')
  const { resumen, clientes, productos, cartera } = data

  const clientesVisibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = [...clientes].sort((a, b) => (b.comisiona ? b.ventaNeta : 0) - (a.comisiona ? a.ventaNeta : 0))
    return q ? base.filter(c => c.cliente.toLowerCase().includes(q) || c.vendedor.toLowerCase().includes(q)) : base
  }, [clientes, busca])

  const productosVisibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    const base = [...productos].sort((a, b) => b.ventaComisionable - a.ventaComisionable)
    return q ? base.filter(p => p.producto.toLowerCase().includes(q) || p.categoria.toLowerCase().includes(q)) : base
  }, [productos, busca])

  const porCategoria = useMemo(() => {
    const m = new Map<string, { venta: number; comisionable: number; litros: number }>()
    for (const p of productos) {
      const a = m.get(p.categoria) ?? { venta: 0, comisionable: 0, litros: 0 }
      a.venta += p.ventaNeta; a.comisionable += p.ventaComisionable; a.litros += p.litrosComisionable
      m.set(p.categoria, a)
    }
    return [...m.entries()].sort((a, b) => b[1].comisionable - a[1].comisionable)
  }, [productos])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(15,23,42,.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
    >
      <div style={{ background: C.bg, borderRadius: '20px 20px 0 0', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <div style={{ width: 38, height: 4, borderRadius: 2, background: '#CBD5E1' }} />
        </div>

        <div style={{ padding: '4px 16px 12px', borderBottom: `1px solid ${C.line}`, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Lo que gano yo</p>
              <p style={{ fontSize: 12, color: C.muted }}>{nombrePeriodo} · {desde} a {hasta}</p>
            </div>
            <button onClick={onClose} aria-label="Cerrar"
              style={{ width: 32, height: 32, borderRadius: '50%', border: 'none', background: '#E2E8F0', color: C.text, cursor: 'pointer', flexShrink: 0, fontSize: 15 }}>
              <X size={16} />
            </button>
          </div>

          {/* Sólo el variable: el sueldo base y la gratificación quedan fuera
              a propósito (pedido de Claudio, ya los tiene claros). */}
          <div style={{ background: C.hero, borderRadius: 14, padding: '12px 14px', marginTop: 12 }}>
            <p style={{ fontSize: 11, color: '#94A3B8' }}>Variable bruto del período</p>
            <p style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.8px', lineHeight: 1.1 }}>
              {fComision(resumen.variableTotal)}
            </p>
            <p style={{ fontSize: 11.5, color: '#CBD5E1', marginTop: 3 }}>
              comisión + bonos por venta y cobranza
            </p>
          </div>

          <div style={{ display: 'flex', gap: 4, background: '#E2E8F0', borderRadius: 11, padding: 3, marginTop: 12 }}>
            {([['resumen', 'Resumen'], ['clientes', 'Por cliente'], ['productos', 'Por producto']] as [Vista, string][]).map(([k, l]) => {
              const on = vista === k
              return (
                <button key={k} onClick={() => { setVista(k); setBusca('') }} style={{
                  flex: 1, padding: '8px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
                  background: on ? C.card : 'transparent', color: on ? C.text : C.muted,
                  fontSize: 12.5, fontWeight: on ? 700 : 600, minHeight: 36,
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
                marginTop: 10, width: '100%', padding: '10px 12px', borderRadius: 10,
                border: `1px solid ${C.line}`, background: C.card, fontSize: 13, color: C.text, outline: 'none',
              }}
            />
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 24px' }}>
          {vista === 'resumen' && <Resumen resumen={resumen} cartera={cartera} porCategoria={porCategoria} />}

          {vista === 'clientes' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {clientesVisibles.map(c => (
                <div key={c.cliente} style={{
                  background: C.card, borderRadius: 12, padding: '11px 13px',
                  border: `1px solid ${c.comisiona ? C.line : '#FDE68A'}`,
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{c.cliente}</p>
                      <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                        {c.vendedor} · {fL(c.litros)} · {c.pedidos} {c.pedidos === 1 ? 'pedido' : 'pedidos'}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: c.comisiona ? C.green : C.amber, whiteSpace: 'nowrap' }}>
                        {fComision(c.ventaNeta * TASA_COMISION)}
                      </p>
                      <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>de {fComision(c.ventaNeta)}</p>
                    </div>
                  </div>
                  {!c.comisiona && (
                    <p style={{ fontSize: 11.5, color: C.amber, fontWeight: 600, marginTop: 7, display: 'flex', alignItems: 'center', gap: 5 }}>
                      <AlertTriangle size={12} />
                      No comisiona todavía · debe {fComision(c.deudaVencida)} vencido
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {productosVisibles.map(p => (
                <div key={`${p.producto}|${p.envase}`} style={{ background: C.card, borderRadius: 12, padding: '11px 13px', border: `1px solid ${C.line}` }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{p.producto}</p>
                      <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2 }}>
                        {[p.envase, p.categoria, `${fL(p.litrosComisionable)} comisionables`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: p.ventaComisionable >= 0 ? C.green : C.red, whiteSpace: 'nowrap' }}>
                        {fComision(p.ventaComisionable * TASA_COMISION)}
                      </p>
                      <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>de {fComision(p.ventaComisionable)}</p>
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
  porCategoria: [string, { venta: number; comisionable: number; litros: number }][]
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {/* Comisión */}
      <Bloque titulo="COMISIÓN 1% SOBRE VENTA COBRADA" monto={resumen.comision} color={C.green}>
        <Linea label="Venta neta del equipo" valor={fComision(resumen.ventaNeta)} />
        <Linea label="De clientes al día (comisiona)" valor={fComision(resumen.ventaComisionable)} destacado />
        {resumen.ventaEnRiesgo > 0 && (
          <Linea label="De clientes con deuda vencida" valor={fComision(resumen.ventaEnRiesgo)} color={C.amber} />
        )}
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          Tu contrato comisiona la venta que cumple las políticas de cobranza. Como el
          sistema no guarda el pago de cada venta, se considera cobrada la de los
          clientes que hoy no tienen deuda vencida.
        </p>
      </Bloque>

      {/* Mix */}
      {porCategoria.length > 0 && (
        <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.line}`, padding: 14 }}>
          <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.04em', marginBottom: 10 }}>
            DE DÓNDE SALE TU COMISIÓN
          </p>
          {porCategoria.map(([cat, v]) => {
            const emoji = cat === 'Kombucha' ? '🧃' : cat === 'Cerveza' ? '🍺' : '📦'
            const color = cat === 'Kombucha' ? C.green : cat === 'Cerveza' ? C.amber : C.purple
            const total = porCategoria.reduce((s, [, x]) => s + Math.max(0, x.comisionable), 0)
            const pct = total > 0 ? (Math.max(0, v.comisionable) / total) * 100 : 0
            return (
              <div key={cat} style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{emoji}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{cat}</span>
                    <span style={{ fontSize: 11.5, fontWeight: 700, color }}>{Math.round(pct)}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 13.5, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>
                    {fComision(v.comisionable * TASA_COMISION)}
                  </p>
                  <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{fL(v.litros)}</p>
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
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
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
        <Linea label="Interacciones registradas" valor={String(cartera.interacciones)} />
        {resumen.proximaActivacion && (
          <Linea
            label={`Si llegas a ${resumen.proximaActivacion.minimoPct}%, ganas`}
            valor={fComision(resumen.proximaActivacion.bono)}
            destacado
            color={C.green}
          />
        )}
        <p style={{ fontSize: 11.5, color: C.muted, marginTop: 8, lineHeight: 1.5, paddingTop: 8, borderTop: `1px solid ${C.line}` }}>
          Activo = {ESCALAS_ACTIVACION[0].minimoPct}% o más de la cartera con al menos 2
          interacciones y 1 pedido en el período. Ojo: las interacciones salen de las
          visitas registradas en Terreno, que es un módulo nuevo — mientras el equipo no
          registre todas sus visitas, este porcentaje va a salir más bajo que la realidad.
        </p>
      </Bloque>

      <p style={{ fontSize: 11, color: C.faint, textAlign: 'center', lineHeight: 1.6, padding: '4px 8px 0' }}>
        Montos brutos, antes de imposiciones.
      </p>
    </div>
  )
}

function Bloque({ titulo, monto, color, children }: {
  titulo: string; monto: number; color: string; children: React.ReactNode
}) {
  return (
    <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.line}`, padding: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.04em' }}>{titulo}</p>
        <p style={{ fontSize: 17, fontWeight: 800, color, whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 5 }}>
          {monto > 0 && <Check size={15} />}
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
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 5 }}>
      <span style={{ fontSize: 12.5, color: C.muted }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: destacado ? 800 : 600, color: color ?? C.text, whiteSpace: 'nowrap' }}>{valor}</span>
    </div>
  )
}
