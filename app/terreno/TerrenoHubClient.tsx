'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Clock, ChevronRight, Users, Tag, Ban, MapPin, Plus } from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import AppHeader from '@/components/ui/AppHeader'

const G = '#D4AF37'
const G_RGB = '212,175,55'

interface Visita {
  id: string
  cliente_nombre: string
  tiene_venta: boolean | null
  motivo_sin_venta: string | null
  total_pedido: number | null
  estado: string
  iniciada_at: string
  completada_at: string | null
}

interface Props {
  vendedor: AppUser
  visitas: Visita[]
  kpis: { totalHoy: number; conVenta: number; sinVenta: number }
  visitaEnProgreso: Visita | null
}

function fmtHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

function fmtPeso(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

/* ── Hero isométrico premium ── */
function IsometricHero() {
  return (
    <svg width="160" height="130" viewBox="0 0 160 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Grid isométrico */}
      {[0,1,2,3,4].map(i => (
        <line key={`h${i}`}
          x1={20 + i * 20} y1={10} x2={20 + i * 20 - 40} y2={90}
          stroke={G} strokeOpacity="0.08" strokeWidth="0.8"
        />
      ))}
      {[0,1,2,3,4].map(i => (
        <line key={`v${i}`}
          x1={20} y1={10 + i * 20} x2={120} y2={10 + i * 20}
          stroke={G} strokeOpacity="0.06" strokeWidth="0.8"
        />
      ))}
      {/* Edificios */}
      <rect x="30" y="55" width="18" height="30" rx="2" fill={G} fillOpacity="0.12" stroke={G} strokeOpacity="0.2" strokeWidth="0.8"/>
      <rect x="30" y="50" width="18" height="8" rx="1" fill={G} fillOpacity="0.2"/>
      <rect x="55" y="40" width="22" height="45" rx="2" fill={G} fillOpacity="0.1" stroke={G} strokeOpacity="0.18" strokeWidth="0.8"/>
      <rect x="55" y="35" width="22" height="8" rx="1" fill={G} fillOpacity="0.22"/>
      <rect x="85" y="60" width="16" height="25" rx="2" fill={G} fillOpacity="0.1" stroke={G} strokeOpacity="0.15" strokeWidth="0.8"/>
      {/* Ruta punteada */}
      <path d="M40 90 Q60 75 80 65 Q100 55 118 45" stroke={G} strokeWidth="1.5" strokeDasharray="4 3" strokeOpacity="0.5" strokeLinecap="round"/>
      {/* Pin de ubicación */}
      <ellipse cx="118" cy="52" rx="8" ry="3" fill={G} fillOpacity="0.15"/>
      <path d="M118 20 C112 20 107 25 107 31 C107 40 118 52 118 52 C118 52 129 40 129 31 C129 25 124 20 118 20Z" fill={G} fillOpacity="0.9"/>
      <circle cx="118" cy="31" r="4" fill="#050505"/>
      {/* Glow pin */}
      <ellipse cx="118" cy="52" rx="14" ry="5" fill={G} fillOpacity="0.08"/>
      {/* Puntos de ruta */}
      <circle cx="40" cy="90" r="3" fill={G} fillOpacity="0.6"/>
      <circle cx="80" cy="65" r="2.5" fill={G} fillOpacity="0.5"/>
      <circle cx="100" cy="55" r="2" fill={G} fillOpacity="0.4"/>
    </svg>
  )
}

/* ── Sparkline mini ── */
function Sparkline({ color, up }: { color: string; up: boolean }) {
  const pts = up
    ? "0,20 10,18 20,15 30,14 40,10 50,8 60,5"
    : "0,5 10,8 20,10 30,14 40,15 50,18 60,20"
  return (
    <svg width="60" height="22" viewBox="0 0 60 22" fill="none" style={{ opacity: 0.5 }}>
      <polyline points={pts} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

/* ── KPI Panel ── */
function KPIPanel({ label, value, color, rgb, icon: Icon, yesterday }: {
  label: string; value: number; color: string; rgb: string
  icon: React.ElementType; yesterday?: number
}) {
  const diff = yesterday !== undefined ? value - yesterday : null
  const up = diff !== null ? diff >= 0 : true
  const pct = yesterday !== undefined && yesterday > 0
    ? Math.round(Math.abs(((value - yesterday) / yesterday) * 100))
    : value > 0 ? 100 : 0

  return (
    <div style={{
      background: `linear-gradient(145deg, rgba(${rgb},0.06) 0%, rgba(10,10,10,0.9) 100%)`,
      border: `1px solid rgba(${rgb},0.18)`,
      borderRadius: 16,
      padding: '12px 10px 10px',
      display: 'flex', flexDirection: 'column', gap: 0,
      boxShadow: `0 4px 24px rgba(${rgb},0.08), inset 0 1px 0 rgba(255,255,255,0.04)`,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Glow fondo */}
      <div style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, borderRadius: '50%', background: `rgba(${rgb},0.1)`, filter: 'blur(20px)' }} />
      {/* Icono */}
      <div style={{ width: 26, height: 26, borderRadius: 8, background: `rgba(${rgb},0.12)`, border: `1px solid rgba(${rgb},0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
        <Icon size={12} color={color} />
      </div>
      {/* Número */}
      <p style={{ fontSize: 28, fontWeight: 900, color, lineHeight: 1, letterSpacing: '-1.5px', marginBottom: 3 }}>{value}</p>
      {/* Label */}
      <p style={{ fontSize: 8, fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>{label}</p>
      {/* Sparkline + badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Sparkline color={color} up={up} />
        <div style={{
          background: up ? 'rgba(90,138,74,0.1)' : 'rgba(181,84,62,0.1)',
          border: `1px solid ${up ? 'rgba(90,138,74,0.2)' : 'rgba(181,84,62,0.2)'}`,
          borderRadius: 6, padding: '2px 5px',
          fontSize: 8, fontWeight: 700,
          color: up ? '#5A8A4A' : '#B5543E',
        }}>
          {up ? '↑' : '↓'} {pct}%
        </div>
      </div>
    </div>
  )
}

/* ── Visita card timeline ── */
function VisitaCard({ v, isLast }: { v: Visita; isLast: boolean }) {
  const enProgreso = v.estado === 'en_progreso'
  const conVenta = v.tiene_venta === true
  const sinVenta = v.tiene_venta === false

  const color = enProgreso ? G : conVenta ? '#5A8A4A' : '#B5543E'
  const rgb = enProgreso ? G_RGB : conVenta ? '90,138,74' : '181,84,62'
  const label = enProgreso ? 'En progreso' : conVenta ? 'Completada' : 'Sin venta'

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'stretch' }}>
      {/* Timeline lateral */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
        <div style={{
          width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
          background: `rgba(${rgb},0.15)`, border: `1.5px solid rgba(${rgb},0.5)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 0 8px rgba(${rgb},0.3)`,
        }}>
          {enProgreso
            ? <Clock size={10} color={color} />
            : conVenta
              ? <CheckCircle size={10} color={color} />
              : <XCircle size={10} color={color} />
          }
        </div>
        {!isLast && <div style={{ flex: 1, width: 1.5, background: `linear-gradient(to bottom, rgba(${rgb},0.3), rgba(255,255,255,0.04))`, marginTop: 4 }} />}
      </div>

      {/* Card */}
      <Link href={`/terreno/nueva-visita?retomar=${v.id}`} style={{ textDecoration: 'none', flex: 1, marginBottom: isLast ? 0 : 10 }}>
        <div style={{
          background: `linear-gradient(135deg, rgba(${rgb},0.05) 0%, rgba(10,10,10,0.95) 100%)`,
          border: `1px solid rgba(${rgb},0.18)`,
          borderRadius: 16, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: `0 2px 16px rgba(${rgb},0.06)`,
        }}>
          {/* Icono */}
          <div style={{ width: 40, height: 40, borderRadius: 12, background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {enProgreso ? <Clock size={17} color={color} /> : conVenta ? <CheckCircle size={17} color={color} /> : <XCircle size={17} color={color} />}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {v.cliente_nombre}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{fmtHora(v.iniciada_at)}</span>
              {conVenta && v.total_pedido ? (
                <span style={{ fontSize: 11, color: G, fontWeight: 600 }}>{fmtPeso(v.total_pedido)}</span>
              ) : null}
              <span style={{
                fontSize: 9, fontWeight: 700, color,
                background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.2)`,
                borderRadius: 6, padding: '2px 7px', letterSpacing: '0.5px',
              }}>{label}</span>
            </div>
          </div>

          <div style={{ width: 28, height: 28, borderRadius: 9, background: `rgba(${rgb},0.1)`, border: `1px solid rgba(${rgb},0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ChevronRight size={14} color={color} />
          </div>
        </div>
      </Link>
    </div>
  )
}

/* ── Main ── */
export default function TerrenoHubClient({ vendedor, visitas, kpis, visitaEnProgreso }: Props) {
  const router = useRouter()
  const nombre = vendedor.nombre?.split(' ')[0] ?? 'Vendedor'
  const fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  const fechaCapitalizada = fecha.charAt(0).toUpperCase() + fecha.slice(1)

  return (
    <div style={{ background: '#050505', minHeight: '100vh', paddingBottom: 100 }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>

        {/* ── HEADER ESTÁNDAR ── */}
        <div style={{ paddingTop: 'max(16px, env(safe-area-inset-top, 16px))' }}>
          <AppHeader eyebrow={fechaCapitalizada} title="Terreno" />
        </div>

        {/* ── VISITA EN PROGRESO ── */}
        {visitaEnProgreso && (
          <div
            onClick={() => router.push(`/terreno/nueva-visita?retomar=${visitaEnProgreso.id}`)}
            style={{
              background: `linear-gradient(135deg, rgba(${G_RGB},0.08) 0%, rgba(10,10,10,0.95) 100%)`,
              border: `1px solid rgba(${G_RGB},0.35)`,
              borderRadius: 22, padding: '18px 20px',
              marginBottom: 20, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 16,
              boxShadow: `0 0 0 1px rgba(${G_RGB},0.1), 0 8px 32px rgba(${G_RGB},0.12)`,
              position: 'relative', overflow: 'hidden',
            }}
          >
            {/* Glow fondo */}
            <div style={{ position: 'absolute', top: -30, left: -30, width: 100, height: 100, borderRadius: '50%', background: `rgba(${G_RGB},0.1)`, filter: 'blur(30px)', pointerEvents: 'none' }} />

            {/* Icono pulsante */}
            <div style={{ position: 'relative', flexShrink: 0 }}>
              <div style={{ width: 48, height: 48, borderRadius: 16, background: `rgba(${G_RGB},0.12)`, border: `1.5px solid rgba(${G_RGB},0.3)`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 20px rgba(${G_RGB},0.2)` }}>
                <Clock size={22} color={G} />
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: G, letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 4 }}>
                Visita en progreso
              </p>
              <p style={{ fontSize: 17, fontWeight: 800, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 4 }}>
                {visitaEnProgreso.cliente_nombre}
              </p>
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                {fmtHora(visitaEnProgreso.iniciada_at)} · En progreso
              </p>
            </div>

            <div style={{ width: 38, height: 38, borderRadius: 12, background: G, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, boxShadow: `0 4px 16px rgba(${G_RGB},0.4)` }}>
              <ChevronRight size={18} color="#050505" strokeWidth={2.5} />
            </div>
          </div>
        )}

        {/* ── KPIs ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 28 }}>
          <KPIPanel label="Visitas hoy" value={kpis.totalHoy} color="#F4EEDF" rgb="244,238,223" icon={Users} yesterday={0} />
          <KPIPanel label="Con venta"   value={kpis.conVenta}  color="#5A8A4A" rgb="90,138,74"  icon={Tag}   yesterday={0} />
          <KPIPanel label="Sin venta"   value={kpis.sinVenta}  color="#B5543E" rgb="181,84,62"   icon={Ban}   yesterday={0} />
        </div>

        {/* ── VISITAS DEL DÍA ── */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: G, boxShadow: `0 0 8px ${G}` }} />
              <p style={{ fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.5)', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                Visitas de hoy
              </p>
            </div>
            <Link href="/terreno/historial" style={{ textDecoration: 'none', fontSize: 12, fontWeight: 600, color: G, display: 'flex', alignItems: 'center', gap: 4 }}>
              Ver todas <ChevronRight size={13} />
            </Link>
          </div>

          {visitas.length > 0 ? (
            <div>
              {visitas.map((v, i) => (
                <VisitaCard key={v.id} v={v} isLast={i === visitas.length - 1} />
              ))}
            </div>
          ) : (
            /* Estado vacío con CTA principal siempre visible above the fold */
            <div style={{
              background: `linear-gradient(135deg, rgba(${G_RGB},0.06) 0%, rgba(10,10,10,0.95) 100%)`,
              border: `1px solid rgba(${G_RGB},0.18)`,
              borderRadius: 22, padding: '28px 20px', textAlign: 'center',
            }}>
              <div style={{ width: 52, height: 52, borderRadius: 18, background: `rgba(${G_RGB},0.1)`, border: `1px solid rgba(${G_RGB},0.2)`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                <MapPin size={24} color={G} />
              </div>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 6, letterSpacing: '-0.3px' }}>Sin visitas hoy</p>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5, marginBottom: 20 }}>
                Registra tu primera visita del día
              </p>
              <Link href="/terreno/nueva-visita" style={{ textDecoration: 'none', display: 'block' }}>
                <div style={{
                  background: `linear-gradient(135deg, #E5C45A, #B8962E)`,
                  borderRadius: 14, padding: '14px 20px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: `0 4px 20px rgba(${G_RGB},0.3)`,
                }}>
                  <Plus size={18} color="#050505" strokeWidth={2.5} />
                  <span style={{ fontSize: 15, fontWeight: 900, color: '#050505', letterSpacing: '-0.2px' }}>
                    Nueva Visita
                  </span>
                </div>
              </Link>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
