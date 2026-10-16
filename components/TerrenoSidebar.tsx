'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ClipboardList, CalendarClock, Plus } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { METAS_ITEM } from './TerrenoBottomNav'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

// Visitas y Planificación, más Metas para quien tiene cartera (mismo criterio
// que TerrenoBottomNav.tsx). "Nueva Visita" sigue sin ir en la lista de nav — es la acción
// principal y vive en el CTA dorado, no un tercer módulo.
const navItems: SidebarNavItem[] = [
  { href: '/terreno',               icon: ClipboardList, label: 'Visitas',       exact: true  },
  { href: '/terreno/planificacion', icon: CalendarClock, label: 'Planificación', exact: false },
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
  const pathname = usePathname()
  // El panel de administrador (app/terreno/admin) es su propio shell desktop
  // con su propia navegación (Resumen/Planificación/Visitas/Clientes/Rutas/
  // Revisión/Reportes) — no el de un vendedor. Mismo criterio que TerrenoBottomNav.
  const { isAdmin, region } = useUser()
  if (pathname?.startsWith('/terreno/admin')) return null
  // Metas: mismo criterio que TerrenoBottomNav (cartera propia o admin).
  const items: SidebarNavItem[] = isAdmin || region ? [...navItems, { ...METAS_ITEM, exact: false }] : navItems
  return (
    <SidebarShell
      moduleName="Terreno"
      sectionLabel="Navegación"
      navItems={items}
      cta={cta}
    />
  )
}
