'use client'

import Link from 'next/link'
import { History, MapPin, Plus } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/terreno',           icon: MapPin,  label: 'Hub Terreno', exact: true  },
  { href: '/terreno/historial', icon: History, label: 'Historial',   exact: false },
]

const cta = (
  <div style={{ marginTop: 20, paddingRight: 2 }}>
    <Link href="/terreno/nueva-visita" style={{ textDecoration: 'none' }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 12px', borderRadius: 10,
          background: 'var(--gold)', cursor: 'pointer',
          transition: 'opacity 0.15s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '0.85'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
      >
        <Plus size={16} color="#080808" strokeWidth={2.5} />
        <span style={{ fontSize: 'var(--fs-body)', fontWeight: 800, color: '#080808' }}>Nueva Visita</span>
      </div>
    </Link>
  </div>
)

export default function TerrenoSidebar() {
  return (
    <SidebarShell
      moduleName="Terreno"
      sectionLabel="Navegación"
      navItems={navItems}
      cta={cta}
    />
  )
}
