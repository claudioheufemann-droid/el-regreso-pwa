'use client'

import { Plus, History, BarChart3, Truck, Route, Gauge } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/flota',           icon: Truck,    label: 'Vehículos',    exact: true  },
  { href: '/flota/checkin',   icon: Plus,     label: 'Nueva Salida', exact: false },
  { href: '/flota/despachos', icon: Route,    label: 'Despachos',    exact: false },
  { href: '/flota/historial', icon: History,  label: 'Historial',    exact: false },
  { href: '/flota/kpis',      icon: Gauge,    label: 'KPIs',         exact: false },
  { href: '/flota/admin',     icon: BarChart3,label: 'Control',      exact: false },
]

export default function FlotaSidebar() {
  return (
    <SidebarShell
      moduleName="Logística"
      sectionLabel="Logística"
      navItems={navItems}
    />
  )
}
