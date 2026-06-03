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
    img: '/gestion-comercial.jpg.png',
    imgFallback: 'linear-gradient(135deg, #1a0e00 0%, #2d1a00 50%, #1a0e00 100%)',
  },
  {
    key: 'administracion',
    label: 'Administración',
    description: 'Finanzas · Legal · Recursos Humanos',
    color: '#5B8AA8',
    rgb: '91,138,168',
    code: 'AD',
    href: '/gestion/administracion',
    img: '/gestion-admin.jpg.png',
    imgFallback: 'linear-gradient(135deg, #00111a 0%, #001d2b 50%, #00111a 100%)',
  },
  {
    key: 'produccion',
    label: 'Área de Producción',
    description: 'Producción · Calidad · Bodega',
    color: '#2ECC71',
    rgb: '46,204,113',
    code: 'PR',
    href: '/gestion/produccion',
    img: '/gestion-produccion.jpg.png',
    imgFallback: 'linear-gradient(135deg, #001a0a 0%, #002b11 50%, #001a0a 100%)',
  },
]

interface Props {
  userName: string
  taskCounts: Record<string, number>
  userMacroArea: string | null
}

/* ── Hero chart ── */
function GestionHero() {
  return (
    <svg width="140" height="110" viewBox="0 0 140 110" fill="none">
      {/* Barras */}
      <rect x="10" y="55" width="18" height="42" rx="4" fill="#E67E22" fillOpacity="0.7"/>
      <rect x="34" y="38" width="18" height="59" rx="4" fill="#5B8AA8" fillOpacity="0.7"/>
      <rect x="58" y="28" width="18" height="69" rx="4" fill="#2ECC71" fillOpacity="0.7"/>
      <rect x="82" y="44" width="18" height="53" rx="4" fill="#D4AF37" fillOpacity="0.7"/>
      <rect x="106" y="18" width="18" height="79" rx="4" fill="#D4AF37" fillOpacity="0.9"/>
      {/* Línea tendencia */}
      <path d="M19 55 Q43 38 67 28 Q91 44 115 18" stroke="#D4AF37" strokeWidth="2" fill="none" strokeLinecap="round"/>
      {/* Puntos */}
      <circle cx="19" cy="55" r="3" fill="#D4AF37"/>
      <circle cx="67" cy="28" r="3" fill="#D4AF37"/>
      <circle cx="115" cy="18" r="5" fill="#D4AF37"/>
      <circle cx="115" cy="18" r="9" fill="#D4AF37" fillOpacity="0.15"/>
      {/* Línea base */}
      <line x1="6" y1="97" x2="134" y2="97" stroke="rgba(255,255,255,0.06)" strokeWidth="1"/>
    </svg>
  )
}

/* ── Sparkline ── */
function Spark({ color }: { color: string }) {
  return (
    <svg width="80" height="28" viewBox="0 0 80 28" fill="none">
      <path d="M0 22 C10 20 15 14 25 12 C35 10 40 16 52 8 C62 2 70 6 80 4"
        stroke={color} strokeWidth="1.5" strokeLinecap="round" fill="none" opacity="0.6"/>
      <circle cx="80" cy="4" r="3" fill={color} opacity="0.8"/>
      <circle cx="80" cy="4" r="6" fill={color} opacity="0.12"/>
    </svg>
  )
}

export default function GestionHubClient({ userName, taskCounts, userMacroArea }: Props) {
  const router = useRouter()
  const fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })
  const fechaCap = fecha.charAt(0).toUpperCase() + fecha.slice(1)
  const visibleAreas = AREAS.filter(a => userMacroArea === null || a.key === userMacroArea)

  return (
    <div style={{ background: '#050505', minHeight: '100vh', paddingBottom: 100 }}>
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 16px' }}>

        {/* ── HEADER ── */}
        <div style={{ position: 'relative', paddingTop: 'max(env(safe-area-inset-top), 16px)', paddingBottom: 0, marginBottom: 18 }}>
          <div style={{ position: 'absolute', top: 0, right: 0 }}>
            <GestionHero />
          </div>
          <div style={{ position: 'relative', zIndex: 2 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.4px', marginBottom: 6 }}>
              {fechaCap}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h1 style={{ fontSize: 30, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-1px', lineHeight: 1 }}>
                Gestión
              </h1>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#D4AF37', display: 'inline-block', boxShadow: '0 0 10px #D4AF37', marginTop: 2 }} />
            </div>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', maxWidth: 210 }}>
              Administra y optimiza cada área.
            </p>
          </div>
        </div>

        {/* ── ÁREA ACTIVA badge (no-admins) ── */}
        {userMacroArea && (() => {
          const mac = AREAS.find(a => a.key === userMacroArea)
          if (!mac) return null
          return (
            <div style={{ background: `rgba(${mac.rgb},0.06)`, border: `1px solid rgba(${mac.rgb},0.2)`, borderRadius: 16, padding: '12px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
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

        {/* ── CARDS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleAreas.map(area => {
            const count = taskCounts[area.key] ?? 0
            return (
              <div
                key={area.key}
                onClick={() => router.push(area.href)}
                style={{
                  borderRadius: 24,
                  border: `1px solid rgba(${area.rgb},0.25)`,
                  overflow: 'hidden',
                  cursor: 'pointer',
                  position: 'relative',
                  boxShadow: `0 8px 40px rgba(${area.rgb},0.08)`,
                  transition: 'transform 0.15s',
                }}
                onTouchStart={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(0.982)' }}
                onTouchEnd={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)' }}
              >
                {/* Imagen de fondo */}
                <div style={{ position: 'relative', height: 90 }}>
                  {/* Fallback gradient (debajo) */}
                  <div style={{ position: 'absolute', inset: 0, background: area.imgFallback, zIndex: 0 }} />
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`${area.img}?v=2`}
                    alt={area.label}
                    style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', zIndex: 1 }}
                  />
                  {/* Overlay degradado abajo */}
                  <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to bottom, rgba(5,5,5,0.1) 0%, rgba(5,5,5,0.85) 100%)', zIndex: 2 }} />
                  {/* Badge código — esquina inferior izquierda sobre imagen */}
                  <div style={{
                    position: 'absolute', bottom: 10, left: 12, zIndex: 3,
                    width: 36, height: 36, borderRadius: 10,
                    background: `rgba(${area.rgb},0.9)`,
                    border: `1.5px solid rgba(255,255,255,0.15)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 900, color: '#050505',
                    backdropFilter: 'blur(8px)',
                    boxShadow: `0 4px 16px rgba(${area.rgb},0.5)`,
                  }}>
                    {area.code}
                  </div>
                </div>

                {/* Contenido inferior */}
                <div style={{
                  background: `linear-gradient(135deg, rgba(${area.rgb},0.06) 0%, #0a0a0a 100%)`,
                  padding: '12px 14px 14px',
                  position: 'relative',
                }}>
                  {/* Sparkline fondo */}
                  <div style={{ position: 'absolute', bottom: 16, right: 64, pointerEvents: 'none' }}>
                    <Spark color={area.color} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 16, fontWeight: 900, color: '#F4EEDF', letterSpacing: -0.3, marginBottom: 3, lineHeight: 1.1 }}>
                        {area.label}
                      </p>
                      <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginBottom: count > 0 ? 8 : 0, lineHeight: 1.4 }}>
                        {area.description}
                      </p>
                      {count > 0 && (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: `rgba(${area.rgb},0.1)`, border: `1px solid rgba(${area.rgb},0.22)`, borderRadius: 20, padding: '5px 11px' }}>
                          <CheckSquare size={10} color={area.color} />
                          <span style={{ fontSize: 10, fontWeight: 700, color: area.color }}>
                            {count} {count === 1 ? 'tarea activa' : 'tareas activas'}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Flecha */}
                    <div style={{
                      width: 34, height: 34, borderRadius: '50%', flexShrink: 0,
                      background: `rgba(${area.rgb},0.15)`,
                      border: `1.5px solid rgba(${area.rgb},0.35)`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 20, color: area.color, fontWeight: 900,
                      boxShadow: `0 4px 16px rgba(${area.rgb},0.25)`,
                      marginTop: 2,
                    }}>›</div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

      </div>
    </div>
  )
}
