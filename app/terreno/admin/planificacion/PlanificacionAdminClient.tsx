'use client'

/**
 * Control semanal (admin) — referencia visual 02. Vendedores siempre visibles (tarjetas
 * clicables, no escondidos en un filtro), matriz del vendedor seleccionado con
 * cumplimiento por día, y acciones de aprobar/fondos/rendición según el permiso de quien
 * mira (Claudio aprueba, Mariel paga — independientes, ver lib/terreno/planificacion).
 */
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle, Wallet, ClipboardCheck, Download } from 'lucide-react'
import { C, cardStyle, fPeso } from '../../theme'
import type { PlanCompleto } from '@/lib/terreno/planificacion/cargarPlanCompleto'

function sumarDias(fechaISO: string, dias: number): string {
  const [Y, M, D] = fechaISO.split('-').map(Number)
  return new Date(Date.UTC(Y, M - 1, D + dias)).toISOString().slice(0, 10)
}
function fCorta(fechaISO: string): string {
  return new Date(fechaISO + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}
function fCortaConDia(fechaISO: string): string {
  return new Date(fechaISO + 'T12:00:00').toLocaleDateString('es-CL', { weekday: 'short', day: 'numeric', month: 'short' })
}

const ESTADO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  borrador: { label: 'Borrador', color: '#92400E', bg: '#FEF3C7' },
  enviado: { label: 'Enviado', color: '#1D4ED8', bg: '#DBEAFE' },
  en_revision: { label: 'En revisión', color: '#1D4ED8', bg: '#DBEAFE' },
  devuelto: { label: 'Devuelto', color: '#B45309', bg: '#FEF3C7' },
  aprobado: { label: 'Aprobado', color: '#166534', bg: '#DCFCE7' },
  rechazado: { label: 'Rechazado', color: '#B91C1C', bg: '#FEE2E2' },
  cancelado: { label: 'Cancelado', color: C.muted, bg: C.bg },
}

interface VendedorFila { id: string; nombre: string; iniciales: string; plan: { id: string; estado_plan: string; monto_solicitado_total: number | null; monto_aprobado_total: number | null } | null }

interface Props {
  semana: string
  vendedores: VendedorFila[]
  vendedorSeleccionadoId: string | null
  puedeAprobar: boolean
  puedePagar: boolean
}

interface FondoRow { id: string; tipo: string; monto_entregado_clp: number; metodo: string | null; entregado_at: string }
interface RendicionRow { id: string; estado: string; enviada_at: string | null }
interface RendicionItemRow { id: string; tipo: string; monto_clp: number; estado: string; comprobante_url: string | null }
interface VinculoVentaRow { id: string; visita_id: string; venta_id: number; tipo_vinculo: string; score_heuristica: number | null }

export default function PlanificacionAdminClient({ semana, vendedores, vendedorSeleccionadoId, puedeAprobar, puedePagar }: Props) {
  const router = useRouter()
  const [vendedorId, setVendedorId] = useState(vendedorSeleccionadoId)
  const [completo, setCompleto] = useState<PlanCompleto | null>(null)
  const [cargando, setCargando] = useState(false)
  const [fondos, setFondos] = useState<FondoRow[]>([])
  const [rendicion, setRendicion] = useState<{ rendicion: RendicionRow; items: RendicionItemRow[] } | null>(null)
  const [vinculos, setVinculos] = useState<VinculoVentaRow[]>([])
  const [comentario, setComentario] = useState('')
  const [procesando, setProcesando] = useState<string | null>(null)
  const [montoFondo, setMontoFondo] = useState('')
  const [error, setError] = useState<string | null>(null)

  const vendedorActivo = vendedores.find(v => v.id === vendedorId)
  const planId = vendedorActivo?.plan?.id ?? null

  const recargar = useCallback(async () => {
    if (!planId) { setCompleto(null); setFondos([]); setRendicion(null); setVinculos([]); return }
    setCargando(true)
    try {
      const [rPlan, rFondos, rRendicion, rVinculos] = await Promise.all([
        fetch(`/api/terreno/planificacion/${planId}`).then(r => r.json()),
        fetch(`/api/terreno/planificacion/${planId}/fondos`).then(r => r.json()),
        fetch(`/api/terreno/planificacion/${planId}/rendicion`).then(r => r.json()),
        fetch(`/api/terreno/planificacion/${planId}/vinculos-venta`).then(r => r.json()),
      ])
      setCompleto(rPlan)
      setFondos(Array.isArray(rFondos) ? rFondos : [])
      setRendicion(rRendicion)
      setVinculos(Array.isArray(rVinculos) ? rVinculos : [])
    } finally {
      setCargando(false)
    }
  }, [planId])

  useEffect(() => { Promise.resolve().then(() => recargar()) }, [recargar])

  function irASemana(offset: number) {
    router.push(`/terreno/admin/planificacion?semana=${sumarDias(semana, offset * 7)}`)
  }
  function seleccionarVendedor(id: string) {
    setVendedorId(id)
    router.push(`/terreno/admin/planificacion?semana=${semana}&vendedor=${id}`, { scroll: false })
  }

  async function decidir(decision: 'aprobado' | 'rechazado' | 'devuelto') {
    if (!planId) return
    setProcesando(decision)
    setError(null)
    try {
      const res = await fetch(`/api/terreno/planificacion/${planId}/aprobar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comentario: comentario || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo procesar la decisión')
      setComentario('')
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setProcesando(null)
    }
  }

  async function registrarFondo() {
    if (!planId) return
    const monto = Number(montoFondo)
    if (!monto) return
    setProcesando('fondo')
    setError(null)
    try {
      const res = await fetch(`/api/terreno/planificacion/${planId}/fondos`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monto_entregado_clp: monto, tipo: 'fondo_semanal' }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo registrar el fondo')
      setMontoFondo('')
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setProcesando(null)
    }
  }

  async function revisarRendicion(estado: 'aprobada' | 'observada' | 'liquidada') {
    if (!planId) return
    setProcesando('rendicion')
    setError(null)
    try {
      const res = await fetch(`/api/terreno/planificacion/${planId}/rendicion`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, comentario_revision: comentario || undefined }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo revisar la rendición')
      setComentario('')
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setProcesando(null)
    }
  }

  async function generarSugerenciasVenta() {
    if (!planId) return
    setProcesando('sugerencias')
    setError(null)
    try {
      const res = await fetch(`/api/terreno/planificacion/${planId}/vinculos-venta`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudieron generar sugerencias')
      await recargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setProcesando(null)
    }
  }

  async function decidirVinculo(linkId: string, tipo: 'confirmado' | 'descartado') {
    setProcesando(`vinculo-${linkId}`)
    try {
      await fetch(`/api/terreno/planificacion/vinculos-venta/${linkId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipo_vinculo: tipo }),
      })
      await recargar()
    } finally {
      setProcesando(null)
    }
  }

  const plan = completo?.plan
  const estadoInfo = plan ? ESTADO_LABEL[plan.estado_plan] ?? ESTADO_LABEL.borrador : null
  const puedeDecidir = puedeAprobar && plan && ['enviado', 'en_revision'].includes(plan.estado_plan)
  const totalFondoEntregado = fondos.filter(f => f.tipo !== 'alojamiento').reduce((s, f) => s + f.monto_entregado_clp, 0)

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, letterSpacing: '0.08em' }}>CONTROL SEMANAL</p>
          <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, marginBottom: 16 }}>Planificación semanal</h1>
        </div>
        <a
          href={`/api/terreno/planificacion/export?semana=${semana}`}
          style={{
            ...cardStyle, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px',
            border: `1px solid ${C.line}`, background: '#fff', color: C.text, fontSize: 13, fontWeight: 700,
            textDecoration: 'none', marginTop: 2,
          }}
        >
          <Download size={14} /> Descargar Excel
        </a>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
        <button onClick={() => irASemana(-1)} style={{ ...cardStyle, width: 36, height: 36, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{fCorta(semana)} – {fCorta(sumarDias(semana, 6))}</span>
        <button onClick={() => irASemana(1)} style={{ ...cardStyle, width: 36, height: 36, border: `1px solid ${C.line}`, background: '#fff', cursor: 'pointer' }}><ChevronRight size={16} /></button>
      </div>

      {/* Vendedores siempre visibles */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
        {vendedores.map(v => {
          const info = v.plan ? ESTADO_LABEL[v.plan.estado_plan] ?? ESTADO_LABEL.borrador : null
          const activo = v.id === vendedorId
          return (
            <button key={v.id} onClick={() => seleccionarVendedor(v.id)} style={{
              ...cardStyle, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', minWidth: 160,
              border: activo ? `2px solid ${C.blue}` : `1px solid ${C.line}`,
            }}>
              <p style={{ fontSize: 13, fontWeight: 800, color: C.text }}>{v.nombre}</p>
              {info ? (
                <span style={{ fontSize: 10.5, fontWeight: 800, color: info.color, background: info.bg, borderRadius: 100, padding: '2px 8px', display: 'inline-block', marginTop: 4 }}>{info.label}</span>
              ) : (
                <p style={{ fontSize: 11, color: C.faint, marginTop: 4 }}>Sin plan</p>
              )}
            </button>
          )
        })}
      </div>

      {cargando && <Loader2 className="animate-spin" size={20} color={C.muted} />}

      {!cargando && !planId && (
        <div style={{ ...cardStyle, padding: 24, textAlign: 'center', color: C.faint }}>Este vendedor no tiene plan para esta semana.</div>
      )}

      {!cargando && completo && plan && estadoInfo && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 20 }}>
          <div>
            {/* Resumen */}
            <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 800, color: estadoInfo.color, background: estadoInfo.bg, borderRadius: 100, padding: '4px 10px' }}>{estadoInfo.label}</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 24 }}>
                <Metrica label="Solicitado" valor={fPeso(plan.monto_solicitado_total ?? 0)} />
                <Metrica label="Aprobado" valor={plan.monto_aprobado_total != null ? fPeso(plan.monto_aprobado_total) : '—'} />
                <Metrica label="Fondo entregado" valor={fPeso(totalFondoEntregado)} />
                <Metrica label="Rendición" valor={ESTADO_LABEL[plan.rendicion_estado]?.label ?? plan.rendicion_estado} />
              </div>
            </div>

            {/* Cumplimiento por día */}
            <div style={{ ...cardStyle, padding: 16, marginBottom: 16, overflowX: 'auto' }}>
              <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em', marginBottom: 10 }}>PLAN DIARIO</p>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: C.muted, fontSize: 11 }}>
                    <th style={{ padding: '4px 8px' }}>Día</th>
                    <th style={{ padding: '4px 8px' }}>Paradas</th>
                    <th style={{ padding: '4px 8px' }}>Km</th>
                    <th style={{ padding: '4px 8px', textAlign: 'right' }}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {completo.dias.map(d => {
                    const r = completo.presupuesto?.dias.find(x => x.plan_dia_id === d.id)
                    const nParadas = completo.paradas.filter(p => p.plan_dia_id === d.id).length
                    return (
                      <tr key={d.id} style={{ borderTop: `1px solid ${C.line}` }}>
                        <td style={{ padding: '6px 8px', fontWeight: 700 }}>{fCortaConDia(d.fecha)}</td>
                        <td style={{ padding: '6px 8px' }}>{nParadas}</td>
                        <td style={{ padding: '6px 8px' }}>{r?.kmPagableM != null ? (r.kmPagableM / 1000).toFixed(1) : 'Pendiente'}</td>
                        <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{r?.montoDiaClp != null ? fPeso(r.montoDiaClp) : '—'}</td>
                      </tr>
                    )
                  })}
                  {completo.dias.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 12, color: C.faint, textAlign: 'center' }}>Sin días cargados</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {error && <div style={{ ...cardStyle, background: '#FEF2F2', border: '1px solid #FCA5A5', padding: 12, marginBottom: 16 }}><p style={{ fontSize: 12, color: '#B91C1C' }}>{error}</p></div>}

            {/* Decisión de aprobación */}
            {puedeDecidir && (
              <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em', marginBottom: 10 }}>DECISIÓN</p>
                <textarea value={comentario} onChange={e => setComentario(e.target.value)} placeholder="Comentario (opcional para aprobar, recomendado para devolver/rechazar)"
                  style={{ width: '100%', minHeight: 70, borderRadius: 10, border: `1px solid ${C.line}`, padding: 10, fontSize: 13, boxSizing: 'border-box', marginBottom: 10, resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => decidir('aprobado')} disabled={!!procesando} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: 'none', background: '#166534', color: '#fff', fontWeight: 800, cursor: 'pointer' }}>
                    {procesando === 'aprobado' ? 'Aprobando…' : 'Aprobar'}
                  </button>
                  <button onClick={() => decidir('devuelto')} disabled={!!procesando} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: `1px solid ${C.amber}`, background: '#fff', color: C.amber, fontWeight: 800, cursor: 'pointer' }}>
                    {procesando === 'devuelto' ? 'Devolviendo…' : 'Devolver'}
                  </button>
                  <button onClick={() => decidir('rechazado')} disabled={!!procesando} style={{ flex: 1, minHeight: 44, borderRadius: 10, border: `1px solid ${C.red}`, background: '#fff', color: C.red, fontWeight: 800, cursor: 'pointer' }}>
                    {procesando === 'rechazado' ? 'Rechazando…' : 'Rechazar'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Columna derecha: fondos + rendición */}
          <div>
            {puedePagar && plan.estado_plan === 'aprobado' && (
              <div style={{ ...cardStyle, padding: 16, marginBottom: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Wallet size={14} /> FONDOS
                </p>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <input type="number" value={montoFondo} onChange={e => setMontoFondo(e.target.value)} placeholder="Monto CLP"
                    style={{ flex: 1, minHeight: 40, borderRadius: 8, border: `1px solid ${C.line}`, padding: '0 10px', fontSize: 13 }} />
                  <button onClick={registrarFondo} disabled={!!procesando || !montoFondo} style={{ minHeight: 40, padding: '0 14px', borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontWeight: 700, cursor: 'pointer' }}>
                    Registrar
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {fondos.map(f => (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.muted }}>
                      <span>{f.tipo}</span>
                      <span style={{ fontWeight: 700, color: C.text }}>{fPeso(f.monto_entregado_clp)}</span>
                    </div>
                  ))}
                  {fondos.length === 0 && <p style={{ fontSize: 12, color: C.faint }}>Sin pagos registrados</p>}
                </div>
              </div>
            )}

            {rendicion?.rendicion && (
              <div style={{ ...cardStyle, padding: 16 }}>
                <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <ClipboardCheck size={14} /> RENDICIÓN — {ESTADO_LABEL[rendicion.rendicion.estado]?.label ?? rendicion.rendicion.estado}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                  {rendicion.items.map(it => (
                    <div key={it.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                      <span style={{ color: C.muted }}>{it.tipo}</span>
                      <span style={{ fontWeight: 700, color: C.text }}>{fPeso(it.monto_clp)}</span>
                    </div>
                  ))}
                  {rendicion.items.length === 0 && <p style={{ fontSize: 12, color: C.faint }}>Sin partidas todavía</p>}
                </div>
                {(puedePagar || puedeAprobar) && rendicion.rendicion.estado === 'enviada' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => revisarRendicion('aprobada')} disabled={!!procesando} style={{ flex: 1, minHeight: 38, borderRadius: 8, border: 'none', background: '#166534', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Aprobar</button>
                    <button onClick={() => revisarRendicion('observada')} disabled={!!procesando} style={{ flex: 1, minHeight: 38, borderRadius: 8, border: `1px solid ${C.amber}`, background: '#fff', color: C.amber, fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Observar</button>
                  </div>
                )}
                {(puedePagar) && rendicion.rendicion.estado === 'aprobada' && (
                  <button onClick={() => revisarRendicion('liquidada')} disabled={!!procesando} style={{ width: '100%', minHeight: 38, borderRadius: 8, border: 'none', background: C.blue, color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Marcar liquidada</button>
                )}
              </div>
            )}

            {puedeAprobar && (
              <div style={{ ...cardStyle, padding: 16, marginTop: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em' }}>VENTAS VINCULADAS</p>
                  <button onClick={generarSugerenciasVenta} disabled={!!procesando} style={{ fontSize: 11, fontWeight: 700, color: C.blue, background: 'none', border: 'none', cursor: 'pointer' }}>
                    {procesando === 'sugerencias' ? 'Buscando…' : 'Sugerir'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {vinculos.map(v => (
                    <div key={v.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12 }}>
                      <span style={{ color: C.muted }}>Venta #{v.venta_id} {v.tipo_vinculo === 'sugerido' && '(sugerida)'}</span>
                      {v.tipo_vinculo === 'sugerido' ? (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button onClick={() => decidirVinculo(v.id, 'confirmado')} disabled={!!procesando} style={{ fontSize: 11, fontWeight: 700, color: '#166534', background: 'none', border: 'none', cursor: 'pointer' }}>Confirmar</button>
                          <button onClick={() => decidirVinculo(v.id, 'descartado')} disabled={!!procesando} style={{ fontSize: 11, fontWeight: 700, color: C.red, background: 'none', border: 'none', cursor: 'pointer' }}>Descartar</button>
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, fontWeight: 700, color: v.tipo_vinculo === 'confirmado' ? '#166534' : C.faint }}>{v.tipo_vinculo}</span>
                      )}
                    </div>
                  ))}
                  {vinculos.length === 0 && <p style={{ fontSize: 12, color: C.faint }}>Sin sugerencias todavía — tocar &quot;Sugerir&quot;</p>}
                </div>
              </div>
            )}

            {plan.monto_alojamiento_estimado ? (
              <div style={{ ...cardStyle, padding: 12, marginTop: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={14} color={C.amber} />
                <p style={{ fontSize: 11, color: C.muted }}>Alojamiento previsto: {fPeso(plan.monto_alojamiento_estimado)} (aparte del fondo)</p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

function Metrica({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p style={{ fontSize: 17, fontWeight: 800, color: C.text }}>{valor}</p>
      <p style={{ fontSize: 11, color: C.muted }}>{label}</p>
    </div>
  )
}
