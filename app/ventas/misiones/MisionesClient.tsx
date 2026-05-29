'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Circle, MessageCircle, Target, ChevronRight, RefreshCw } from 'lucide-react'
import type { Mision } from './page'

// ── Paleta de segmentos ───────────────────────────────────────────────────────
const SEG_COLOR: Record<string, string> = {
  A: '#D4AF37', B: '#34D399', C: '#60A5FA', D: '#F59E0B', E: '#F87171',
}

// ── Configuración de niveles de alerta ────────────────────────────────────────
const ALERT_CFG: Record<string, { color: string; bg: string; border: string; label: string; emoji: string }> = {
  critico: { color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.25)', label: 'Urgente',  emoji: '🔴' },
  vencido: { color: '#F87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.2)', label: 'Vencido', emoji: '⚠️' },
  proximo: { color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.18)', label: 'Próximo',  emoji: '⏰' },
}

type Tab = 'todas' | 'critico' | 'vencido' | 'proximo' | 'completadas'

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSemana(semana: string) {
  const d = new Date(semana + 'T12:00:00')
  const fin = new Date(d)
  fin.setDate(fin.getDate() + 6)
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  return `${d.getDate()} ${meses[d.getMonth()]} — ${fin.getDate()} ${meses[fin.getMonth()]}`
}

function whatsappUrl(nombre: string) {
  return `https://wa.me/?text=${encodeURIComponent(`Hola ${nombre}, te saluda El Regreso Beer Co. 🍺`)}`
}

// ── Tarjeta de misión ─────────────────────────────────────────────────────────
function MisionCard({
  m,
  isAdmin,
  vendedorActual,
  onToggle,
}: {
  m: Mision
  isAdmin: boolean
  vendedorActual: string | null
  onToggle: (m: Mision) => void
}) {
  const cfg = ALERT_CFG[m.alert_level] ?? ALERT_CFG.proximo
  const segColor = SEG_COLOR[m.segmento] ?? '#888'
  const canToggle = !isAdmin || m.vendedor_actual === vendedorActual

  const overshoot = m.porcentaje_ciclo_vencido > 0
    ? `+${Math.round(m.porcentaje_ciclo_vencido)}%`
    : `${Math.round((m.dias_sin_compra / m.ciclo_promedio_dias) * 100)}%`

  return (
    <div style={{
      background: m.completado ? 'rgba(52,211,153,0.04)' : 'var(--surface)',
      border: m.completado
        ? '1px solid rgba(52,211,153,0.2)'
        : `1px solid ${cfg.border}`,
      borderRadius: 16,
      padding: '12px 14px',
      marginBottom: 8,
      transition: 'all 0.2s',
      opacity: m.completado ? 0.7 : 1,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {/* Segment badge */}
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: `${segColor}18`,
          border: `1.5px solid ${segColor}44`,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: 1,
        }}>
          <span style={{ fontSize: 16, fontWeight: 900, color: segColor, lineHeight: 1 }}>{m.segmento}</span>
          <span style={{ fontSize: 8, fontWeight: 700, color: segColor, opacity: 0.75 }}>{m.score}pts</span>
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
            {m.completado && (
              <span style={{ fontSize: 9, fontWeight: 800, color: '#34D399', background: 'rgba(52,211,153,0.15)', padding: '1px 6px', borderRadius: 6 }}>
                ✓ CONTACTADO
              </span>
            )}
            <p style={{
              fontSize: 13, fontWeight: 700,
              color: m.completado ? '#34D399' : 'var(--cream)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              textDecoration: m.completado ? 'line-through' : 'none',
            }}>
              {m.nombre_fantasia}
            </p>
          </div>

          {!m.completado && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {isAdmin && (
                <span style={{ fontSize: 10, color: '#888' }}>
                  {m.vendedor_actual.split(' ')[0]}
                </span>
              )}
              <span style={{ fontSize: 10, fontWeight: 700, color: cfg.color }}>
                {m.dias_sin_compra}d sin comprar
              </span>
              <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                · ciclo {m.ciclo_promedio_dias}d · {overshoot}
              </span>
              {m.siguiente_compra_estimada && (
                <span style={{ fontSize: 10, color: 'var(--muted)' }}>
                  · próx: {m.siguiente_compra_estimada}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <a
            href={whatsappUrl(m.nombre_fantasia)}
            target="_blank"
            rel="noreferrer"
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
              style={{
                width: 34, height: 34, borderRadius: 10, cursor: 'pointer',
                background: m.completado ? 'rgba(52,211,153,0.12)' : 'rgba(255,255,255,0.04)',
                border: m.completado ? '1px solid rgba(52,211,153,0.3)' : '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: m.completado ? '#34D399' : 'var(--muted)',
                flexShrink: 0,
              }}
            >
              {m.completado
                ? <CheckCircle2 size={18} />
                : <Circle size={18} />
              }
            </button>
          )}
        </div>
      </div>
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
  const [loading, setLoading] = useState<string | null>(null) // nombre_fantasia en proceso

  // ── Toggle completado ───────────────────────────────────────────────────────
  const handleToggle = useCallback(async (m: Mision) => {
    if (loading) return
    const key = m.nombre_fantasia

    // Optimistic update
    setMisiones(prev =>
      prev.map(item =>
        item.nombre_fantasia === m.nombre_fantasia && item.vendedor_actual === m.vendedor_actual
          ? { ...item, completado: !item.completado }
          : item
      )
    )
    setLoading(key)

    try {
      const method = m.completado ? 'DELETE' : 'POST'
      const res = await fetch('/api/misiones', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre_fantasia: m.nombre_fantasia, semana }),
      })
      if (!res.ok) throw new Error('Error')
    } catch {
      // Revert on error
      setMisiones(prev =>
        prev.map(item =>
          item.nombre_fantasia === m.nombre_fantasia && item.vendedor_actual === m.vendedor_actual
            ? { ...item, completado: m.completado }
            : item
        )
      )
    } finally {
      setLoading(null)
    }
  }, [loading, semana])

  // ── Filtros por tab ─────────────────────────────────────────────────────────
  const pendientes = misiones.filter(m => !m.completado)
  const completadas = misiones.filter(m => m.completado)
  const criticos = pendientes.filter(m => m.alert_level === 'critico')
  const vencidos  = pendientes.filter(m => m.alert_level === 'vencido')
  const proximos  = pendientes.filter(m => m.alert_level === 'proximo')

  const tabItems: { id: Tab; label: string; count: number; color: string }[] = [
    { id: 'todas',      label: 'Todas',       count: pendientes.length, color: 'var(--cream)' },
    { id: 'critico',    label: '🔴 Urgentes', count: criticos.length,  color: '#EF4444'      },
    { id: 'vencido',    label: '⚠ Vencidos',  count: vencidos.length,  color: '#F87171'      },
    { id: 'proximo',    label: '⏰ Próximos',  count: proximos.length,  color: '#F59E0B'      },
    { id: 'completadas',label: '✓ Listas',    count: completadas.length,color: '#34D399'     },
  ]

  const shownMisiones: Mision[] = (() => {
    switch (activeTab) {
      case 'critico':     return criticos
      case 'vencido':     return vencidos
      case 'proximo':     return proximos
      case 'completadas': return completadas
      default:            return [...criticos, ...vencidos, ...proximos]
    }
  })()

  // ── Progreso ────────────────────────────────────────────────────────────────
  const total = misiones.length
  const done = completadas.length
  const pct = total > 0 ? Math.round((done / total) * 100) : 0

  const VENDEDOR_COLOR: Record<string, string> = {
    'Javier Badilla':  '#60A5FA',
    'Carlos Urrejola': '#34D399',
  }

  return (
    <div style={{ padding: '16px 16px 100px', maxWidth: 600, margin: '0 auto' }}>

      {/* ── Encabezado ───────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Target size={18} color="var(--gold)" />
            <h1 style={{ fontSize: 18, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.3px' }}>
              Misiones Semanales
            </h1>
          </div>
          <button
            onClick={() => router.refresh()}
            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--muted)', padding: 4 }}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 26 }}>
          Semana {formatSemana(semana)}
        </p>
      </div>

      {/* ── Progreso global ───────────────────────────────────────────────── */}
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
            <p style={{ fontSize: 12, color: '#34D399', fontWeight: 600, marginTop: 2 }}>
              {pct}% completado
            </p>
          </div>

          {/* Contadores por nivel */}
          <div style={{ display: 'flex', gap: 8 }}>
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

        {/* Barra de progreso */}
        <div style={{ height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 8, transition: 'width 0.4s ease',
            width: `${pct}%`,
            background: pct === 100
              ? '#34D399'
              : pct > 60 ? '#F59E0B'
              : '#60A5FA',
          }} />
        </div>

        {/* Desglose por vendedor (solo admin) */}
        {isAdmin && (
          <div style={{ display: 'flex', gap: 12, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            {Object.entries(VENDEDOR_COLOR).map(([v, color]) => {
              const vMis = misiones.filter(m => m.vendedor_actual === v)
              const vDone = vMis.filter(m => m.completado).length
              return (
                <div key={v} style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, color, fontWeight: 700 }}>{v.split(' ')[0]}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{vDone}/{vMis.length}</span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 4,
                      width: vMis.length > 0 ? `${Math.round((vDone / vMis.length) * 100)}%` : '0%',
                      background: color,
                    }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 6, marginBottom: 14,
        overflowX: 'auto', paddingBottom: 4,
      }}>
        {tabItems.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700,
              whiteSpace: 'nowrap', cursor: 'pointer', border: 'none', flexShrink: 0,
              background: activeTab === t.id
                ? `${t.color}18`
                : 'var(--surface)',
              color: activeTab === t.id ? t.color : 'var(--muted)',
              outline: activeTab === t.id ? `1px solid ${t.color}44` : '1px solid var(--border)',
            }}
          >
            {t.label}
            {t.count > 0 && (
              <span style={{
                marginLeft: 5, fontSize: 10, fontWeight: 800,
                color: activeTab === t.id ? t.color : 'var(--muted)',
              }}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── Lista de misiones ─────────────────────────────────────────────── */}
      {shownMisiones.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '48px 20px',
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 20,
        }}>
          {activeTab === 'completadas' ? (
            <>
              <p style={{ fontSize: 32, marginBottom: 8 }}>🎯</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', marginBottom: 4 }}>
                Aún no hay contactos completados
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                Marca clientes como contactados para verlos aquí
              </p>
            </>
          ) : (
            <>
              <p style={{ fontSize: 32, marginBottom: 8 }}>✅</p>
              <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)', marginBottom: 4 }}>
                Todo al día en esta categoría
              </p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>
                No hay clientes pendientes aquí
              </p>
            </>
          )}
        </div>
      ) : (
        <div>
          {/* Agrupar por nivel solo en tab "todas" */}
          {activeTab === 'todas' ? (
            <>
              {criticos.length > 0 && (
                <SectionHeader emoji="🔴" label="Urgentes" count={criticos.length} color="#EF4444" />
              )}
              {criticos.map(m => (
                <MisionCard key={`${m.vendedor_actual}|||${m.nombre_fantasia}`} m={m} isAdmin={isAdmin} vendedorActual={vendedorActual} onToggle={handleToggle} />
              ))}

              {vencidos.length > 0 && (
                <SectionHeader emoji="⚠️" label="Vencidos" count={vencidos.length} color="#F87171" />
              )}
              {vencidos.map(m => (
                <MisionCard key={`${m.vendedor_actual}|||${m.nombre_fantasia}`} m={m} isAdmin={isAdmin} vendedorActual={vendedorActual} onToggle={handleToggle} />
              ))}

              {proximos.length > 0 && (
                <SectionHeader emoji="⏰" label="Próximos" count={proximos.length} color="#F59E0B" />
              )}
              {proximos.map(m => (
                <MisionCard key={`${m.vendedor_actual}|||${m.nombre_fantasia}`} m={m} isAdmin={isAdmin} vendedorActual={vendedorActual} onToggle={handleToggle} />
              ))}
            </>
          ) : (
            shownMisiones.map(m => (
              <MisionCard key={`${m.vendedor_actual}|||${m.nombre_fantasia}`} m={m} isAdmin={isAdmin} vendedorActual={vendedorActual} onToggle={handleToggle} />
            ))
          )}
        </div>
      )}

      {/* ── CTA link a clientes ───────────────────────────────────────────── */}
      {total > 0 && (
        <button
          onClick={() => router.push('/ventas/clientes')}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            width: '100%', padding: '14px', borderRadius: 14, marginTop: 20,
            background: 'rgba(212,175,55,0.07)', border: '1px solid rgba(212,175,55,0.2)',
            color: 'var(--gold)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          Ver cartera completa <ChevronRight size={16} />
        </button>
      )}
    </div>
  )
}

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
