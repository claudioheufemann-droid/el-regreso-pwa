'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, Circle, MessageCircle, Target, ChevronRight,
  RefreshCw, Zap, User,
} from 'lucide-react'
import type { Mision } from './page'

// ── Paleta ────────────────────────────────────────────────────────────────────
const SEG_COLOR: Record<string, string> = {
  A: '#D4AF37', B: '#34D399', C: '#60A5FA', D: '#F59E0B', E: '#F87171',
}
const ALERT_CFG: Record<string, { color: string; border: string; label: string }> = {
  critico: { color: '#EF4444', border: 'rgba(239,68,68,0.25)',    label: 'Urgente'  },
  vencido: { color: '#F87171', border: 'rgba(248,113,113,0.2)',   label: 'Vencido'  },
  proximo: { color: '#F59E0B', border: 'rgba(245,158,11,0.18)',   label: 'Próximo'  },
}
const VEND_COLOR: Record<string, string> = {
  'Javier Badilla':  '#60A5FA',
  'Carlos Urrejola': '#34D399',
}

type Tab = 'todas' | 'critico' | 'vencido' | 'proximo' | 'completadas'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSemana(semana: string) {
  const d = new Date(semana + 'T12:00:00')
  const fin = new Date(d); fin.setDate(fin.getDate() + 6)
  const m = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d.getDate()} ${m[d.getMonth()]} — ${fin.getDate()} ${m[fin.getMonth()]}`
}

function whatsappUrl(nombre: string) {
  return `https://wa.me/?text=${encodeURIComponent(`Hola ${nombre}, te saluda El Regreso Beer Co. 🍺`)}`
}

// ── Tarjeta de misión ─────────────────────────────────────────────────────────
function MisionCard({
  m, isAdmin, vendedorActual, onToggle, toggling,
}: {
  m: Mision
  isAdmin: boolean
  vendedorActual: string | null
  onToggle: (m: Mision) => void
  toggling: boolean
}) {
  const cfg = ALERT_CFG[m.alert_level] ?? ALERT_CFG.proximo
  const segColor = SEG_COLOR[m.segmento] ?? '#888'
  const vendColor = VEND_COLOR[m.vendedor] ?? '#888'
  const done = m.estado === 'completada'

  // Vendedores solo pueden completar sus propias misiones
  const canToggle = isAdmin ? true : m.vendedor === vendedorActual

  // Contexto de compra para el vendedor
  const ciclo = m.ciclo_promedio_dias ?? 0
  const diasRetraso = Math.max(0, m.dias_sin_compra - ciclo)
  const diasFalta   = Math.max(0, ciclo - m.dias_sin_compra)
  const motivoContacto =
    m.alert_level === 'critico'
      ? `${diasRetraso}d de retraso sobre su ciclo de ${ciclo}d`
      : m.alert_level === 'vencido'
      ? `Superó su ciclo de ${ciclo}d (lleva ${m.dias_sin_compra}d)`
      : `Compra cada ${ciclo}d · faltan ~${diasFalta}d`

  return (
    <div style={{
      background: done ? 'rgba(52,211,153,0.04)' : 'var(--surface)',
      border: done ? '1px solid rgba(52,211,153,0.18)' : `1px solid ${cfg.border}`,
      borderRadius: 16, padding: '12px 14px', marginBottom: 8,
      transition: 'all 0.2s', opacity: done ? 0.65 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>

        {/* Segment badge */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: `${segColor}18`, border: `1.5px solid ${segColor}44`,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1,
        }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: segColor, lineHeight: 1 }}>{m.segmento}</span>
          <span style={{ fontSize: 8, fontWeight: 700, color: segColor, opacity: 0.75 }}>{m.score}pts</span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 2, flexWrap: 'wrap' }}>
            {done && (
              <span style={{ fontSize: 9, fontWeight: 800, color: '#34D399', background: 'rgba(52,211,153,0.15)', padding: '1px 6px', borderRadius: 6 }}>
                ✓ CONTACTADO
              </span>
            )}
            <p style={{
              fontSize: 13, fontWeight: 700,
              color: done ? '#34D399' : 'var(--cream)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: done ? 'line-through' : 'none',
            }}>
              {m.nombre_fantasia}
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            {/* Vendedor asignado */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 3,
              background: `${vendColor}12`, border: `1px solid ${vendColor}30`,
              borderRadius: 6, padding: '1px 6px',
            }}>
              <User size={9} color={vendColor} />
              <span style={{ fontSize: 9, fontWeight: 700, color: vendColor }}>
                {m.vendedor.split(' ')[0]}
              </span>
            </div>

            {!done && (
              <span style={{
                fontSize: 10, fontWeight: 600,
                color: m.alert_level === 'critico' ? '#EF4444'
                     : m.alert_level === 'vencido' ? '#F87171'
                     : '#F59E0B',
              }}>
                {motivoContacto}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <a
            href={whatsappUrl(m.nombre_fantasia)}
            target="_blank" rel="noreferrer"
            style={{
              width: 34, height: 34, borderRadius: 10,
              background: 'rgba(37,211,102,0.1)', border: '1px solid rgba(37,211,102,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#25D366', textDecoration: 'none', flexShrink: 0,
            }}
          >
            <MessageCircle size={16} />
          </a>

          {canToggle && (
            <button
              onClick={() => onToggle(m)}
              disabled={toggling}
              style={{
                width: 34, height: 34, borderRadius: 10, cursor: toggling ? 'wait' : 'pointer',
                background: done ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                border: done ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: done ? '#34D399' : 'var(--muted)', flexShrink: 0,
                opacity: toggling ? 0.5 : 1,
              }}
            >
              {done ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Sección con título ────────────────────────────────────────────────────────
function SectionHeader({ emoji, label, count, color }: { emoji: string; label: string; count: number; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, marginTop: 16 }}>
      <span style={{ fontSize: 14 }}>{emoji}</span>
      <span style={{ fontSize: 11, fontWeight: 800, color, letterSpacing: '0.07em' }}>
        {label.toUpperCase()} — {count}
      </span>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MisionesClient({
  misiones: misionesProp,
  semana,
  isAdmin,
  vendedorActual,
}: {
  misiones: Mision[]
  semana: string
  isAdmin: boolean
  vendedorActual: string | null
}) {
  const router = useRouter()
  const [misiones, setMisiones] = useState<Mision[]>(misionesProp)
  const [activeTab, setActiveTab] = useState<Tab>('todas')
  const [toggling, setToggling] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  // ── Generar misiones (admin) ────────────────────────────────────────────────
  const handleGenerar = async () => {
    setGenerating(true)
    try {
      await fetch('/api/misiones?action=generar', { method: 'POST' })
      router.refresh()
    } finally {
      setGenerating(false)
    }
  }

  // ── Toggle completado ───────────────────────────────────────────────────────
  const handleToggle = useCallback(async (m: Mision) => {
    if (toggling) return
    setToggling(m.id)
    const done = m.estado === 'completada'

    // Optimistic
    setMisiones(prev => prev.map(item =>
      item.id === m.id
        ? { ...item, estado: done ? 'pendiente' : 'completada', completado_at: done ? null : new Date().toISOString() }
        : item
    ))

    try {
      const action = done ? 'deshacer' : 'completar'
      const res = await fetch(`/api/misiones?action=${action}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mision_id: m.id }),
      })
      if (!res.ok) throw new Error()
    } catch {
      // Revert
      setMisiones(prev => prev.map(item => item.id === m.id ? m : item))
    } finally {
      setToggling(null)
    }
  }, [toggling])

  // ── Filtros ─────────────────────────────────────────────────────────────────
  const pendientes   = misiones.filter(m => m.estado === 'pendiente')
  const completadas  = misiones.filter(m => m.estado === 'completada')
  const criticos     = pendientes.filter(m => m.alert_level === 'critico')
  const vencidos     = pendientes.filter(m => m.alert_level === 'vencido')
  const proximos     = pendientes.filter(m => m.alert_level === 'proximo')

  const tabItems: { id: Tab; label: string; count: number; color: string }[] = [
    { id: 'todas',       label: 'Todas',       count: pendientes.length,  color: 'var(--cream)' },
    { id: 'critico',     label: '🔴 Urgentes', count: criticos.length,   color: '#EF4444'      },
    { id: 'vencido',     label: '⚠ Vencidos',  count: vencidos.length,   color: '#F87171'      },
    { id: 'proximo',     label: '⏰ Próximos',  count: proximos.length,   color: '#F59E0B'      },
    { id: 'completadas', label: '✓ Listas',    count: completadas.length, color: '#34D399'      },
  ]

  const shownMisiones = (() => {
    switch (activeTab) {
      case 'critico':     return criticos
      case 'vencido':     return vencidos
      case 'proximo':     return proximos
      case 'completadas': return completadas
      default:            return [...criticos, ...vencidos, ...proximos]
    }
  })()

  const total = misiones.length
  const done  = completadas.length
  const pct   = total > 0 ? Math.round((done / total) * 100) : 0
  const sinMisiones = total === 0

  // ── Desglose por vendedor (admin) ───────────────────────────────────────────
  const desglose = Object.entries(VEND_COLOR).map(([v, color]) => {
    const vMis  = misiones.filter(m => m.vendedor === v)
    const vDone = vMis.filter(m => m.estado === 'completada').length
    return { v, color, total: vMis.length, done: vDone }
  })

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 600, margin: '0 auto' }}>

      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <Target size={18} color="var(--gold)" />
            <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.3px' }}>
              Misiones Semanales
            </h1>
          </div>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 26 }}>
            {formatSemana(semana)}
            {!isAdmin && vendedorActual && (
              <span style={{ marginLeft: 8, color: VEND_COLOR[vendedorActual] ?? 'var(--gold)', fontWeight: 700 }}>
                · {vendedorActual.split(' ')[0]}
              </span>
            )}
          </p>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {isAdmin && (
            <button
              onClick={handleGenerar}
              disabled={generating}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '7px 12px', borderRadius: 10, cursor: generating ? 'wait' : 'pointer',
                background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)',
                color: 'var(--gold)', fontSize: 11, fontWeight: 700, opacity: generating ? 0.6 : 1,
              }}
            >
              <Zap size={13} />
              {generating ? 'Generando…' : sinMisiones ? 'Generar misiones' : 'Actualizar'}
            </button>
          )}
          <button
            onClick={() => router.refresh()}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {/* ── Sin misiones ───────────────────────────────────────────────── */}
      {sinMisiones && (
        <div style={{
          textAlign: 'center', padding: '48px 24px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
        }}>
          <p style={{ fontSize: 36, marginBottom: 12 }}>🎯</p>
          <p style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 6 }}>
            {isAdmin ? 'No hay misiones para esta semana' : 'Sin misiones asignadas'}
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
            {isAdmin
              ? 'Genera las misiones para asignar contactos a cada vendedor.'
              : 'El admin generará las misiones semanales pronto.'}
          </p>
          {isAdmin && (
            <button
              onClick={handleGenerar}
              disabled={generating}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '12px 20px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(212,175,55,0.15)', border: '1px solid rgba(212,175,55,0.4)',
                color: 'var(--gold)', fontSize: 13, fontWeight: 700,
              }}
            >
              <Zap size={16} />
              {generating ? 'Generando…' : 'Generar misiones esta semana'}
            </button>
          )}
        </div>
      )}

      {/* ── Progreso (solo si hay misiones) ───────────────────────────── */}
      {!sinMisiones && (
        <>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 20, padding: '16px 18px', marginBottom: 16,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 10 }}>
              <div>
                <p style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, letterSpacing: '0.07em', marginBottom: 2 }}>
                  PROGRESO DE LA SEMANA
                </p>
                <p style={{ fontSize: 28, fontWeight: 900, color: 'var(--cream)', lineHeight: 1 }}>
                  {done}
                  <span style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 400 }}> / {total}</span>
                </p>
                <p style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: pct === 100 ? '#34D399' : 'var(--muted)' }}>
                  {pct === 100 ? '🎉 ¡Semana completada!' : `${pct}% completado`}
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {[
                  { label: '🔴', count: criticos.length, color: '#EF4444', title: 'Urgentes' },
                  { label: '⚠️',  count: vencidos.length,  color: '#F87171', title: 'Vencidos' },
                  { label: '⏰', count: proximos.length,  color: '#F59E0B', title: 'Próximos' },
                ].map(s => (
                  <div key={s.label} style={{ textAlign: 'center' }}>
                    <p style={{ fontSize: 18, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.count}</p>
                    <p style={{ fontSize: 9, color: 'var(--muted)' }}>{s.title}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Barra global */}
            <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden', marginBottom: isAdmin ? 12 : 0 }}>
              <div style={{
                height: '100%', borderRadius: 8, transition: 'width 0.4s ease',
                width: `${pct}%`,
                background: pct === 100 ? '#34D399' : pct > 60 ? '#F59E0B' : '#60A5FA',
              }} />
            </div>

            {/* Desglose por vendedor (admin) */}
            {isAdmin && (
              <div style={{ display: 'flex', gap: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {desglose.map(({ v, color, total: vTotal, done: vDone }) => (
                  <div key={v} style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <User size={10} color={color} />
                      <span style={{ fontSize: 10, color, fontWeight: 700 }}>{v.split(' ')[0]}</span>
                      <span style={{ fontSize: 10, color: 'var(--muted)', marginLeft: 'auto' }}>
                        {vDone}/{vTotal}
                      </span>
                    </div>
                    <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{
                        height: '100%', borderRadius: 4,
                        width: vTotal > 0 ? `${Math.round((vDone / vTotal) * 100)}%` : '0%',
                        background: color,
                      }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Tabs ───────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
            {tabItems.map(t => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                style={{
                  padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                  whiteSpace: 'nowrap', cursor: 'pointer', border: 'none', flexShrink: 0,
                  background: activeTab === t.id ? `${t.color}18` : 'var(--surface)',
                  color: activeTab === t.id ? t.color : 'var(--muted)',
                  outline: activeTab === t.id ? `1px solid ${t.color}44` : '1px solid var(--border)',
                }}
              >
                {t.label}
                {t.count > 0 && (
                  <span style={{ marginLeft: 5, fontSize: 10, fontWeight: 800 }}>{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* ── Lista ──────────────────────────────────────────────────── */}
          {shownMisiones.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '36px 20px',
              background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
            }}>
              <p style={{ fontSize: 28, marginBottom: 8 }}>
                {activeTab === 'completadas' ? '🎯' : '✅'}
              </p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', marginBottom: 4 }}>
                {activeTab === 'completadas' ? 'Aún no hay contactos completados' : 'Todo al día aquí'}
              </p>
            </div>
          ) : (
            <div>
              {activeTab === 'todas' ? (
                <>
                  {criticos.length > 0 && <SectionHeader emoji="🔴" label="Urgentes"  count={criticos.length} color="#EF4444" />}
                  {criticos.map(m => <MisionCard key={m.id} m={m} isAdmin={isAdmin} vendedorActual={vendedorActual} onToggle={handleToggle} toggling={toggling === m.id} />)}

                  {vencidos.length > 0 && <SectionHeader emoji="⚠️" label="Vencidos"  count={vencidos.length} color="#F87171" />}
                  {vencidos.map(m => <MisionCard key={m.id} m={m} isAdmin={isAdmin} vendedorActual={vendedorActual} onToggle={handleToggle} toggling={toggling === m.id} />)}

                  {proximos.length > 0 && <SectionHeader emoji="⏰" label="Próximos" count={proximos.length} color="#F59E0B" />}
                  {proximos.map(m => <MisionCard key={m.id} m={m} isAdmin={isAdmin} vendedorActual={vendedorActual} onToggle={handleToggle} toggling={toggling === m.id} />)}
                </>
              ) : (
                shownMisiones.map(m => (
                  <MisionCard key={m.id} m={m} isAdmin={isAdmin} vendedorActual={vendedorActual} onToggle={handleToggle} toggling={toggling === m.id} />
                ))
              )}
            </div>
          )}

          <button
            onClick={() => router.push('/ventas/clientes')}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              width: '100%', padding: '14px', borderRadius: 14, marginTop: 20, cursor: 'pointer',
              background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.2)',
              color: 'var(--gold)', fontSize: 13, fontWeight: 700,
            }}
          >
            Ver cartera completa <ChevronRight size={16} />
          </button>
        </>
      )}
    </div>
  )
}
