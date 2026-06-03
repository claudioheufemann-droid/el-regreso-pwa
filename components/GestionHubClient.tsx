'use client'

import { useRouter } from 'next/navigation'
import { CheckSquare } from 'lucide-react'

const AREAS = [
  {
    key: 'comercial',
    label: 'Área Comercial',
    description: 'Ventas · Terreno · Metas · Mermas',
    color: '#E67E22',
    rgb: '230,126,34',
    code: 'AC',
    href: '/gestion/comercial',
  },
  {
    key: 'administracion',
    label: 'Administración',
    description: 'Finanzas · Legal · Recursos Humanos',
    color: '#5B8AA8',
    rgb: '91,138,168',
    code: 'AD',
    href: '/gestion/administracion',
  },
  {
    key: 'produccion',
    label: 'Área de Producción',
    description: 'Producción · Calidad · Bodega',
    color: '#2ECC71',
    rgb: '46,204,113',
    code: 'PR',
    href: '/gestion/produccion',
  },
]

interface Props {
  userName: string
  taskCounts: Record<string, number>
  userMacroArea: string | null
}

/* ── Hero isométrico — módulos/productividad ── */
function GestionHero() {
  return (
    <svg width="150" height="130" viewBox="0 0 150 130" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Grid base */}
      {[0,1,2,3].map(i => (
        <line key={`h${i}`} x1={10 + i*30} y1={20} x2={10 + i*30} y2={100}
          stroke="#D4AF37" strokeOpacity="0.06" strokeWidth="0.8"/>
      ))}
      {[0,1,2,3].map(i => (
        <line key={`v${i}`} x1={10} y1={20 + i*25} x2={130} y2={20 + i*25}
          stroke="#D4AF37" strokeOpacity="0.06" strokeWidth="0.8"/>
      ))}
      {/* Panel central — ventana app */}
      <rect x="28" y="18" width="80" height="72" rx="8"
        fill="#D4AF37" fillOpacity="0.06" stroke="#D4AF37" strokeOpacity="0.2" strokeWidth="1"/>
      {/* Barra superior */}
      <rect x="28" y="18" width="80" height="14" rx="8"
        fill="#D4AF37" fillOpacity="0.15"/>
      <rect x="28" y="25" width="80" height="7" rx="0"
        fill="#D4AF37" fillOpacity="0.15"/>
      {/* Dot indicadores */}
      <circle cx="38" cy="25" r="3" fill="#E67E22" fillOpacity="0.8"/>
      <circle cx="48" cy="25" r="3" fill="#5B8AA8" fillOpacity="0.8"/>
      <circle cx="58" cy="25" r="3" fill="#2ECC71" fillOpacity="0.8"/>
      {/* Barras KPI dentro */}
      <rect x="36" y="42" width="10" height="36" rx="3" fill="#E67E22" fillOpacity="0.35"/>
      <rect x="52" y="52" width="10" height="26" rx="3" fill="#5B8AA8" fillOpacity="0.35"/>
      <rect x="68" y="46" width="10" height="32" rx="3" fill="#2ECC71" fillOpacity="0.35"/>
      <rect x="84" y="56" width="10" height="22" rx="3" fill="#D4AF37" fillOpacity="0.35"/>
      {/* Línea tendencia */}
      <path d="M36 60 Q52 48 68 52 Q84 56 100 44"
        stroke="#D4AF37" strokeWidth="1.5" strokeDasharray="3 2"
        strokeOpacity="0.6" fill="none" strokeLinecap="round"/>
      {/* Puntos en línea */}
      <circle cx="36" cy="60" r="2.5" fill="#D4AF37" fillOpacity="0.8"/>
      <circle cx="68" cy="52" r="2.5" fill="#D4AF37" fillOpacity="0.8"/>
      <circle cx="100" cy="44" r="3" fill="#D4AF37" fillOpacity="1"/>
      {/* Glow punto final */}
      <circle cx="100" cy="44" r="7" fill="#D4AF37" fillOpacity="0.1"/>
      {/* Partículas */}
      <circle cx="18" cy="35" r="1.5" fill="#D4AF37" fillOpacity="0.3"/>
      <circle cx="130" cy="70" r="1.5" fill="#D4AF37" fillOpacity="0.25"/>
      <circle cx="22" cy="80" r="1" fill="#D4AF37" fillOpacity="0.2"/>
      <circle cx="135" cy="40" r="1" fill="#D4AF37" fillOpacity="0.2"/>
    </svg>
  )
}

/* ── Sparkline por área ── */
function AreaSparkline({ color }: { color: string }) {
  return (
    <svg width="70" height="24" viewBox="0 0 70 24" fill="none" style={{ opacity: 0.4 }}>
      <path d="M0,18 C10,16 15,12 25,10 C35,8 40,14 50,8 C58,4 64,6 70,4"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none"/>
      <circle cx="70" cy="4" r="2.5" fill={color}/>
    </svg>
  )
}

export default function GestionHubClient({ userName, taskCounts, userMacroArea }: Props) {
  const router = useRouter()
  const fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  const fechaCapitalizada = fecha.charAt(0).toUpperCase() + fecha.slice(1)
  const visibleAreas = AREAS.filter(a => userMacroArea === null || a.key === userMacroArea)

  return (
    <div style={{ background: '#050505', minHeight: '100vh', paddingBottom: 100 }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>

        {/* ── HEADER ── */}
        <div style={{ position: 'relative', paddingTop: 'max(env(safe-area-inset-top), 20px)', paddingBottom: 8, marginBottom: 24 }}>
          {/* Hero */}
          <div style={{ position: 'absolute', top: 0, right: 0, opacity: 0.9 }}>
            <GestionHero />
          </div>

          {/* Texto */}
          <div style={{ position: 'relative', zIndex: 2 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.5px', marginBottom: 6 }}>
              {fechaCapitalizada}
            </p>
            <h1 style={{ fontSize: 36, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-1.5px', lineHeight: 1, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
              Gestión
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#D4AF37', display: 'inline-block', boxShadow: '0 0 10px #D4AF37', marginBottom: 4 }} />
            </h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', fontWeight: 500, maxWidth: 200 }}>
              Administra y optimiza cada área de tu negocio.
            </p>
          </div>
        </div>

        {/* ── ÁREA ACTIVA badge (no-admins) ── */}
        {userMacroArea && (() => {
          const mac = AREAS.find(a => a.key === userMacroArea)
          if (!mac) return null
          return (
            <div style={{
              background: `rgba(${mac.rgb},0.06)`, border: `1px solid rgba(${mac.rgb},0.2)`,
              borderRadius: 16, padding: '12px 16px', marginBottom: 20,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <div style={{ width: 36, height: 36, borderRadius: 11, background: `rgba(${mac.rgb},0.12)`, border: `1px solid rgba(${mac.rgb},0.25)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 900, color: mac.color, flexShrink: 0 }}>
                {mac.code}
              </div>
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, color: mac.color, letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 2 }}>Tu área asignada</p>
                <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF' }}>{mac.label}</p>
              </div>
            </div>
          )
        })()}

        {/* ── CARDS DE ÁREAS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleAreas.map((area, idx) => {
            const count = taskCounts[area.key] ?? 0
            return (
              <div
                key={area.key}
                onClick={() => router.push(area.href)}
                style={{
                  background: `linear-gradient(135deg, rgba(${area.rgb},0.07) 0%, rgba(8,8,8,0.95) 100%)`,
                  border: `1px solid rgba(${area.rgb},0.22)`,
                  borderRadius: 22,
                  padding: '22px 20px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 18,
                  position: 'relative',
                  overflow: 'hidden',
                  boxShadow: `0 4px 32px rgba(${area.rgb},0.08)`,
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
                onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(0.985)' }}
                onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)' }}
              >
                {/* Glow fondo */}
                <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: `rgba(${area.rgb},0.1)`, filter: 'blur(25px)', pointerEvents: 'none' }} />

                {/* Sparkline decorativa fondo */}
                <div style={{ position: 'absolute', bottom: 14, right: 60, pointerEvents: 'none' }}>
                  <AreaSparkline color={area.color} />
                </div>

                {/* Badge código */}
                <div style={{
                  width: 64, height: 64, borderRadius: 18, flexShrink: 0,
                  background: `rgba(${area.rgb},0.1)`,
                  border: `1.5px solid rgba(${area.rgb},0.28)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 18, fontWeight: 900, color: area.color, letterSpacing: 1,
                  boxShadow: `0 4px 20px rgba(${area.rgb},0.18)`,
                  position: 'relative', zIndex: 1,
                }}>
                  {area.code}
                </div>

                {/* Texto */}
                <div style={{ flex: 1, minWidth: 0, position: 'relative', zIndex: 1 }}>
                  <p style={{ fontSize: 17, fontWeight: 900, color: '#F4EEDF', marginBottom: 5, letterSpacing: -0.4 }}>
                    {area.label}
                  </p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginBottom: count > 0 ? 10 : 0, lineHeight: 1.5 }}>
                    {area.description}
                  </p>
                  {count > 0 && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 5,
                      background: `rgba(${area.rgb},0.1)`, border: `1px solid rgba(${area.rgb},0.22)`,
                      borderRadius: 20, padding: '4px 10px',
                    }}>
                      <CheckSquare size={10} color={area.color} />
                      <span style={{ fontSize: 10, fontWeight: 700, color: area.color }}>
                        {count} {count === 1 ? 'tarea activa' : 'tareas activas'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Flecha circular */}
                <div style={{
                  width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
                  background: `rgba(${area.rgb},0.12)`,
                  border: `1.5px solid rgba(${area.rgb},0.3)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: area.color, fontSize: 18, fontWeight: 900,
                  boxShadow: `0 2px 12px rgba(${area.rgb},0.2)`,
                  position: 'relative', zIndex: 1,
                }}>›</div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
