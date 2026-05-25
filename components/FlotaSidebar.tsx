'use client'

import { Truck, Plus, Map, BarChart3 } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/flota',         icon: Truck,     label: 'Vehículos',    exact: true  },
  { href: '/flota/checkin', icon: Plus,      label: 'Nueva Salida', exact: false },
  { href: '/flota/rutas',   icon: Map,       label: 'Rutas',        exact: false },
  { href: '/flota/admin',   icon: BarChart3, label: 'Reportes',     exact: false },
]

export default function FlotaSidebar() {
  return (
    <SidebarShell
      moduleName="Flota"
      ModuleIcon={Truck}
      sectionLabel="Flota"
      navItems={navItems}
    />
  )
}
