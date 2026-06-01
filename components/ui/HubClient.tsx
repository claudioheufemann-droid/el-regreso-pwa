'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

/* ── SVG Art Cinematográfico por módulo ── */

function VentasArt() {
  return (
    <svg viewBox="0 0 200 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
      {/* Barras ascendentes */}
      <rect x="20" y="80" width="18" height="30" rx="4" fill="#D4AF37" fillOpacity="0.3"/>
      <rect x="46" y="60" width="18" height="50" rx="4" fill="#D4AF37" fillOpacity="0.4"/>
      <rect x="72" y="40" width="18" height="70" rx="4" fill="#D4AF37" fillOpacity="0.55"/>
      <rect x="98" y="20" width="18" height="90" rx="4" fill="#D4AF37" fillOpacity="0.7"/>
      <rect x="124" y="10" width="18" height="100" rx="4" fill="#D4AF37" fillOpacity="0.85"/>
      {/* Línea de tendencia */}
      <polyline points="29,80 55,60 81,42 107,24 133,12" stroke="#D4AF37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.6"/>
      {/* Puntos en la línea */}
      <circle cx="29" cy="80" r="3" fill="#D4AF37" opacity="0.8"/>
      <circle cx="55" cy="60" r="3" fill="#D4AF37" opacity="0.8"/>
      <circle cx="81" cy="42" r="3" fill="#D4AF37" opacity="0.8"/>
      <circle cx="107" cy="24" r="4" fill="#D4AF37"/>
      <circle cx="133" cy="12" r="5" fill="#D4AF37"/>
      {/* Glow en el último punto */}
      <circle cx="133" cy="12" r="10" fill="#D4AF37" opacity="0.15"/>
      <circle cx="133" cy="12" r="16" fill="#D4AF37" opacity="0.07"/>
      {/* Grid sutil */}
      <line x1="10" y1="110" x2="160" y2="110" stroke="#D4AF37" strokeOpacity="0.08" strokeWidth="1"/>
      <line x1="10" y1="80" x2="160" y2="80" stroke="#D4AF37" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="4 4"/>
      <line x1="10" y1="50" x2="160" y2="50" stroke="#D4AF37" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="4 4"/>
      <line x1="10" y1="20" x2="160" y2="20" stroke="#D4AF37" strokeOpacity="0.08" strokeWidth="1" strokeDasharray="4 4"/>
    </svg>
  )
}

function GestionArt() {
  return (
    <svg viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
      {/* Tablero kanban premium */}
      {/* Columna 1 */}
      <rect x="10" y="10" width="52" height="110" rx="10" fill="#3B82F6" fillOpacity="0.06" stroke="#3B82F6" strokeOpacity="0.12" strokeWidth="1"/>
      <rect x="18" y="22" width="36" height="20" rx="6" fill="#3B82F6" fillOpacity="0.18" stroke="#3B82F6" strokeOpacity="0.25" strokeWidth="0.5"/>
      <rect x="18" y="46" width="36" height="20" rx="6" fill="#3B82F6" fillOpacity="0.12"/>
      <rect x="18" y="70" width="36" height="20" rx="6" fill="#3B82F6" fillOpacity="0.08"/>
      {/* Columna 2 */}
      <rect x="70" y="10" width="52" height="110" rx="10" fill="#3B82F6" fillOpacity="0.08" stroke="#3B82F6" strokeOpacity="0.15" strokeWidth="1"/>
      <rect x="78" y="22" width="36" height="20" rx="6" fill="#3B82F6" fillOpacity="0.22" stroke="#3B82F6" strokeOpacity="0.3" strokeWidth="0.5"/>
      <rect x="78" y="46" width="36" height="20" rx="6" fill="#3B82F6" fillOpacity="0.16"/>
      {/* Columna 3 activa */}
      <rect x="130" y="10" width="58" height="110" rx="10" fill="#3B82F6" fillOpacity="0.12" stroke="#3B82F6" strokeOpacity="0.3" strokeWidth="1"/>
      <rect x="138" y="22" width="42" height="22" rx="6" fill="#3B82F6" fillOpacity="0.28" stroke="#3B82F6" strokeOpacity="0.4" strokeWidth="0.5"/>
      <rect x="138" y="48" width="42" height="22" rx="6" fill="#3B82F6" fillOpacity="0.2"/>
      <rect x="138" y="74" width="42" height="22" rx="6" fill="#3B82F6" fillOpacity="0.14"/>
      {/* Check marks */}
      <circle cx="155" cy="33" r="5" fill="#3B82F6" fillOpacity="0.4"/>
      <polyline points="152,33 154,35 159,30" stroke="#3B82F6" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
      {/* Glow card activa */}
      <rect x="130" y="10" width="58" height="110" rx="10" fill="none" stroke="#3B82F6" strokeOpacity="0.5" strokeWidth="1.5"/>
      <ellipse cx="159" cy="60" rx="35" ry="55" fill="#3B82F6" fillOpacity="0.04"/>
    </svg>
  )
}

function TerrenoArt() {
  return (
    <svg viewBox="0 0 200 130" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
      {/* Contornos topográficos */}
      <ellipse cx="100" cy="90" rx="90" ry="40" stroke="#10B981" strokeOpacity="0.08" strokeWidth="1" fill="none"/>
      <ellipse cx="100" cy="85" rx="70" ry="30" stroke="#10B981" strokeOpacity="0.1" strokeWidth="1" fill="none"/>
      <ellipse cx="100" cy="80" rx="52" ry="22" stroke="#10B981" strokeOpacity="0.13" strokeWidth="1" fill="none"/>
      <ellipse cx="100" cy="76" rx="36" ry="16" stroke="#10B981" strokeOpacity="0.18" strokeWidth="1" fill="none"/>
      <ellipse cx="100" cy="73" rx="22" ry="10" stroke="#10B981" strokeOpacity="0.25" strokeWidth="1.5" fill="none"/>
      {/* Ruta GPS */}
      <path d="M30,100 Q55,60 80,50 Q110,40 130,30 Q150,20 165,15" stroke="#10B981" strokeWidth="2" strokeDasharray="6 4" strokeLinecap="round" opacity="0.5"/>
      {/* Puntos de ruta */}
      <circle cx="30" cy="100" r="4" fill="#10B981" opacity="0.5"/>
      <circle cx="80" cy="50" r="4" fill="#10B981" opacity="0.65"/>
      <circle cx="130" cy="30" r="4" fill="#10B981" opacity="0.8"/>
      {/* Pin de ubicación principal */}
      <ellipse cx="165" cy="15" rx="8" ry="8" fill="#10B981" fillOpacity="0.15"/>
      <ellipse cx="165" cy="15" rx="14" ry="14" fill="#10B981" fillOpacity="0.07"/>
      <circle cx="165" cy="13" r="6" fill="#10B981" opacity="0.9"/>
      <path d="M165,13 Q168,9 165,6 Q162,9 165,13" fill="#10B981"/>
      <circle cx="165" cy="11" r="2" fill="white" opacity="0.7"/>
      {/* Glow en pin */}
      <circle cx="165" cy="13" r="10" fill="#10B981" opacity="0.12"/>
    </svg>
  )
}

function FlotaArt() {
  return (
    <svg viewBox="0 0 220 130" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
      {/* Carretera perspectiva */}
      <path d="M10,120 L100,70 L200,50" stroke="#F97316" strokeOpacity="0.08" strokeWidth="30" strokeLinecap="round"/>
      <path d="M10,120 L100,70 L200,50" stroke="#F97316" strokeOpacity="0.04" strokeWidth="50" strokeLinecap="round"/>
      {/* Líneas de carretera */}
      <path d="M30,118 L110,72 L190,54" stroke="#F97316" strokeOpacity="0.15" strokeWidth="1" strokeDasharray="8 6"/>
      {/* Silueta del camión */}
      {/* Cabina */}
      <rect x="110" y="52" width="40" height="36" rx="6" fill="#F97316" fillOpacity="0.35" stroke="#F97316" strokeOpacity="0.5" strokeWidth="1"/>
      {/* Parabrisas */}
      <rect x="114" y="56" width="18" height="14" rx="3" fill="#F97316" fillOpacity="0.5"/>
      {/* Luz delantera */}
      <circle cx="150" cy="68" r="3" fill="#F97316" opacity="0.9"/>
      <ellipse cx="165" cy="68" rx="12" ry="4" fill="#F97316" opacity="0.15"/>
      {/* Cuerpo del camión */}
      <rect x="62" y="56" width="52" height="32" rx="4" fill="#F97316" fillOpacity="0.2" stroke="#F97316" strokeOpacity="0.3" strokeWidth="1"/>
      {/* Ruedas */}
      <circle cx="82" cy="88" r="8" fill="#F97316" fillOpacity="0.3" stroke="#F97316" strokeOpacity="0.5" strokeWidth="1.5"/>
      <circle cx="82" cy="88" r="4" fill="#F97316" fillOpacity="0.4"/>
      <circle cx="130" cy="88" r="8" fill="#F97316" fillOpacity="0.3" stroke="#F97316" strokeOpacity="0.5" strokeWidth="1.5"/>
      <circle cx="130" cy="88" r="4" fill="#F97316" fillOpacity="0.4"/>
      <circle cx="144" cy="88" r="8" fill="#F97316" fillOpacity="0.3" stroke="#F97316" strokeOpacity="0.5" strokeWidth="1.5"/>
      <circle cx="144" cy="88" r="4" fill="#F97316" fillOpacity="0.4"/>
      {/* Motion streaks */}
      <line x1="10" y1="72" x2="58" y2="72" stroke="#F97316" strokeOpacity="0.2" strokeWidth="2" strokeLinecap="round"/>
      <line x1="10" y1="78" x2="55" y2="78" stroke="#F97316" strokeOpacity="0.12" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="10" y1="84" x2="52" y2="84" stroke="#F97316" strokeOpacity="0.08" strokeWidth="1" strokeLinecap="round"/>
      {/* Glow cabina */}
      <rect x="110" y="52" width="40" height="36" rx="6" fill="none" stroke="#F97316" strokeOpacity="0.7" strokeWidth="1.5"/>
      <ellipse cx="130" cy="70" rx="25" ry="20" fill="#F97316" fillOpacity="0.06"/>
    </svg>
  )
}

/* ── Card premium ── */
interface ModuleCardProps {
  href: string
  color: string
  rgb: string
  title: string
  subtitle: string
  icon: string
  art: React.ReactNode
  locked?: boolean
}

function ModuleCard({ href, color, rgb, title, subtitle, icon, art, locked }: ModuleCardProps) {
  const [pressed, setPressed] = useState(false)

  if (locked) return (
    <div style={{
      background: '#0D0D10', border: '1px solid rgba(255,255,255,0.04)',
      borderRadius: 24, padding: '20px 20px',
      display: 'flex', alignItems: 'center', gap: 16,
      opacity: 0.35, cursor: 'not-allowed', overflow: 'hidden', position: 'relative',
    }}>
      <div style={{ width: 48, height: 48, borderRadius: 15, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🔒</div>
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: '#4A4A50', marginBottom: 3 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#2A2A30', lineHeight: 1.4 }}>{subtitle}</div>
      </div>
    </div>
  )

  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div
        onTouchStart={() => setPressed(true)}
        onTouchEnd={() => setPressed(false)}
        onMouseDown={() => setPressed(true)}
        onMouseUp={() => setPressed(false)}
        onMouseLeave={() => setPressed(false)}
        style={{
          position: 'relative', overflow: 'hidden',
          borderRadius: 24,
          border: `1px solid rgba(${rgb}, ${pressed ? 0.45 : 0.22})`,
          background: `linear-gradient(135deg, #0E0E12 0%, rgba(${rgb},0.06) 100%)`,
          boxShadow: pressed
            ? `0 0 0 1px rgba(${rgb},0.4), 0 8px 32px rgba(${rgb},0.18), inset 0 0 0 1px rgba(${rgb},0.1)`
            : `0 4px 24px rgba(${rgb},0.08), inset 0 1px 0 rgba(255,255,255,0.04)`,
          transform: pressed ? 'scale(0.988) translateY(2px)' : 'scale(1) translateY(0)',
          transition: 'all 0.18s cubic-bezier(0.34,1.2,0.64,1)',
          cursor: 'pointer',
          minHeight: 96,
          display: 'flex',
          alignItems: 'stretch',
        }}
      >
        {/* Contenido izquierdo */}
        <div style={{ flex: 1, padding: '20px 18px 20px 20px', display: 'flex', alignItems: 'center', gap: 16, zIndex: 2, position: 'relative' }}>
          {/* Icono */}
          <div style={{
            width: 52, height: 52, borderRadius: 16, flexShrink: 0,
            background: `rgba(${rgb}, 0.12)`,
            border: `1.5px solid rgba(${rgb}, 0.28)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 24,
            boxShadow: `0 4px 16px rgba(${rgb}, 0.15)`,
          }}>{icon}</div>
          {/* Texto */}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: '#F4EEDF', marginBottom: 5, letterSpacing: -0.3 }}>{title}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.45 }}>{subtitle}</div>
          </div>
        </div>

        {/* Arte derecho — fade desde la izquierda */}
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: '52%',
          display: 'flex', alignItems: 'center',
          maskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.85) 100%)',
          WebkitMaskImage: 'linear-gradient(to right, transparent 0%, rgba(0,0,0,0.6) 35%, rgba(0,0,0,0.85) 100%)',
          opacity: pressed ? 0.55 : 0.38,
          transition: 'opacity 0.18s',
          paddingRight: 8,
          filter: `saturate(1.2)`,
        } as React.CSSProperties}>
          {art}
        </div>

        {/* Flecha */}
        <div style={{
          position: 'absolute', right: 18, top: '50%', transform: 'translateY(-50%)',
          width: 28, height: 28, borderRadius: 10, zIndex: 3,
          background: `rgba(${rgb}, 0.15)`,
          border: `1px solid rgba(${rgb}, 0.25)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: color, fontSize: 14, fontWeight: 800,
        }}>›</div>

        {/* Glow activo sutil */}
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 24,
          background: `radial-gradient(ellipse at 75% 50%, rgba(${rgb},${pressed?0.12:0.05}) 0%, transparent 70%)`,
          transition: 'background 0.18s',
          pointerEvents: 'none',
        }} />
      </div>
    </Link>
  )
}

/* ── Main ── */
export default function HubClient({ isAdmin, nombre }: { isAdmin: boolean; nombre: string }) {
  const firstName = nombre.split(' ')[0]
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div style={{
      minHeight: '100svh',
      background: '#07070D',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      padding: 'env(safe-area-inset-top, 44px) 20px 40px',
      fontFamily: 'system-ui, -apple-system, sans-serif',
    }}>
      <div style={{ width: '100%', maxWidth: 420 }}>

        {/* ── HEADER ── */}
        <div style={{ textAlign: 'center', padding: '28px 0 32px' }}>
          {/* Logos — ambas marcas */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, marginBottom: 20 }}>
            <div style={{ position: 'relative', width: 80, height: 80 }}>
              <Image src="/logo.png" alt="El Regreso Beer Co." fill style={{ objectFit: 'contain', filter: 'drop-shadow(0 0 18px rgba(212,175,55,0.45))' }} />
            </div>
            <div style={{ width: 1, height: 52, background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,0.14), transparent)' }} />
            <div style={{ position: 'relative', width: 76, height: 76 }}>
              <Image src="/logo-laida.png" alt="La Ida Kombucha" fill style={{ objectFit: 'contain', filter: 'invert(1) drop-shadow(0 0 10px rgba(255,255,255,0.15))' }} />
            </div>
          </div>

          {/* Nombre empresa */}
          <h1 style={{ fontSize: 26, fontWeight: 900, color: '#F4EEDF', letterSpacing: -0.8, margin: '0 0 8px', lineHeight: 1.1 }}>
            El Regreso Beer
          </h1>

          {/* Saludo */}
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.45)', margin: '0 0 12px', fontWeight: 500 }}>
            Hola, <span style={{ color: '#D4AF37', fontWeight: 800 }}>{firstName}</span> 👋
          </p>

          {/* Badge rol */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 14px', borderRadius: 99,
            background: 'rgba(212,175,55,0.08)',
            border: '1px solid rgba(212,175,55,0.18)',
          }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L7.5 4.5H11L8.5 6.8L9.5 10.5L6 8.5L2.5 10.5L3.5 6.8L1 4.5H4.5L6 1Z" fill="#D4AF37" fillOpacity="0.8"/>
            </svg>
            <span style={{ fontSize: 11, color: '#D4AF37', fontWeight: 700, letterSpacing: 0.3 }}>
              {isAdmin ? 'Administrador · Acceso total' : 'Acceso Ventas'}
            </span>
          </div>
        </div>

        {/* ── MODULE CARDS ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <ModuleCard
            href="/ventas"
            color="#D4AF37"
            rgb="212,175,55"
            title="Ventas"
            subtitle="Dashboard, clientes, KPIs y metas"
            icon="📊"
            art={<VentasArt />}
          />

          {isAdmin ? (
            <ModuleCard
              href="/gestion"
              color="#3B82F6"
              rgb="59,130,246"
              title="Gestión de tareas"
              subtitle="Tareas, proyectos, áreas y sistema operativo"
              icon="📋"
              art={<GestionArt />}
            />
          ) : (
            <ModuleCard
              href="/gestion"
              color="#3B82F6"
              rgb="59,130,246"
              title="Gestión"
              subtitle="Acceso restringido · Solo administradores"
              icon="🔒"
              art={<GestionArt />}
              locked
            />
          )}

          <ModuleCard
            href="/terreno"
            color="#10B981"
            rgb="16,185,129"
            title="Venta en terreno"
            subtitle="Rutas, auditorías y check-in GPS"
            icon="📍"
            art={<TerrenoArt />}
          />

          <ModuleCard
            href="/flota"
            color="#F97316"
            rgb="249,115,22"
            title="Logística"
            subtitle="Bitácora, rutas y control de vehículos"
            icon="🚛"
            art={<FlotaArt />}
          />

        </div>

        {/* ── LOGOUT ── */}
        <button
          onClick={handleLogout}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            width: '100%', marginTop: 20, padding: '16px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 18, cursor: 'pointer',
            fontSize: 14, fontWeight: 700,
            color: 'rgba(255,255,255,0.3)',
            transition: 'all 0.15s',
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
          Cerrar sesión
        </button>

        {/* ── FOOTER ── */}
        <div style={{ textAlign: 'center', marginTop: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><path d="M12 8v4l2 2"/>
          </svg>
          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.12)', letterSpacing: 0.8, margin: 0 }}>
            Cervecería El Regreso · Valdivia, Chile
          </p>
        </div>

      </div>
    </div>
  )
}
