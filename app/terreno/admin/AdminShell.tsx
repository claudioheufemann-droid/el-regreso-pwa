'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home, CalendarClock, Users, Map as MapIcon, FileCheck2, BarChart3, ChevronRight,
} from 'lucide-react'
import SettingsPanel from '@/components/ui/SettingsPanel'
import { C } from '../theme'

const NAV = [
  { href: '/terreno/admin', label: 'Resumen', Icon: Home, exact: true },
  { href: '/terreno/admin/visitas', label: 'Visitas', Icon: CalendarClock, exact: false },
  { href: '/terreno/admin/clientes', label: 'Clientes', Icon: Users, exact: false },
  { href: '/terreno/admin/rutas', label: 'Rutas', Icon: MapIcon, exact: false },
  { href: '/terreno/admin/revision', label: 'Revisión', Icon: FileCheck2, exact: false },
  { href: '/terreno/admin/reportes', label: 'Reportes', Icon: BarChart3, exact: false },
] as const

interface Props {
  nombre: string
  email: string
  avatarUrl: string | null
  pendientesRevision: number
  children: React.ReactNode
}

/**
 * Shell del panel de administrador de Terreno — desktop primero, como
 * pide el spec ("Administrador desktop: lateral ... y cuenta inferior").
 * Reemplaza a TerrenoSidebar/TerrenoBottomNav sólo dentro de /terreno/admin
 * (ver el guard en esos dos componentes): la navegación de un vendedor
 * (Panel/Viaje/Cercanos/Historial) no tiene nada que ver con la de un
 * admin revisando presencia de todo el equipo.
 */
export default function AdminShell({ nombre, email, avatarUrl, pendientesRevision, children }: Props) {
  const pathname = usePathname()
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex' }}>
      <aside style={{
        width: 230, flexShrink: 0, background: C.card, borderRight: `1px solid ${C.line}`,
        display: 'none', flexDirection: 'column', justifyContent: 'space-between',
        position: 'sticky', top: 0, height: '100vh',
      }} className="terreno-admin-sidebar">
        <div>
          <div style={{ padding: '22px 20px 18px' }}>
            <p style={{ fontSize: 15, fontWeight: 900, color: C.text, letterSpacing: '-0.3px', lineHeight: 1 }}>EL REGRESO</p>
            <p style={{ fontSize: 10.5, fontWeight: 700, color: C.muted, letterSpacing: '0.12em', marginTop: 2 }}>TERRENO</p>
          </div>
          <nav style={{ padding: '4px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map(({ href, label, Icon, exact }) => {
              const activo = exact ? pathname === href : pathname?.startsWith(href)
              return (
                <Link key={href} href={href} style={{ textDecoration: 'none' }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10,
                    background: activo ? C.verdeLlegadaSoft : 'transparent',
                    color: activo ? C.verdeLlegada : C.muted,
                  }}>
                    <Icon size={17} />
                    <span style={{ fontSize: 13.5, fontWeight: activo ? 800 : 600, flex: 1 }}>{label}</span>
                    {label === 'Revisión' && pendientesRevision > 0 && (
                      <span style={{
                        minWidth: 20, height: 20, borderRadius: 10, background: activo ? C.verdeLlegada : C.amber,
                        color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
                      }}>
                        {pendientesRevision}
                      </span>
                    )}
                  </div>
                </Link>
              )
            })}
          </nav>
        </div>

        <button
          onClick={() => setShowSettings(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', margin: 8,
            borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <span style={{
            width: 34, height: 34, borderRadius: '50%', background: C.hero, color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, flexShrink: 0, overflow: 'hidden',
          }}>
            {avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatarUrl} alt={nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : nombre.slice(0, 2).toUpperCase()}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nombre}</p>
            <p style={{ fontSize: 11, color: C.muted }}>Administrador</p>
          </div>
          <ChevronRight size={15} color={C.faint} />
        </button>
      </aside>

      <div style={{ flex: 1, minWidth: 0 }}>
        {children}
      </div>

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} userName={nombre} userEmail={email} avatarUrl={avatarUrl ?? undefined} />
      )}

      <style>{`@media (min-width: 1024px) { .terreno-admin-sidebar { display: flex !important; } }`}</style>
    </div>
  )
}
