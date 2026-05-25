'use client'

import { BarChart2, TrendingUp, Target, Upload, Beer, Map, Users, BarChart } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/ventas',                icon: BarChart2,  label: 'Hoy',       exact: true,  adminOnly: false },
  { href: '/ventas/acumulado',      icon: TrendingUp, label: 'Período',   adminOnly: false },
  { href: '/ventas/clientes',       icon: Users,      label: 'Clientes',  adminOnly: false },
  { href: '/ventas/mapa',           icon: Map,        label: 'Mapa',      adminOnly: false },
  { href: '/ventas/metas',          icon: Target,     label: 'Metas',     adminOnly: false },
  { href: '/ventas/admin/cargar',   icon: Upload,     label: 'Cargar',    adminOnly: true  },
  { href: '/ventas/admin/reportes', icon: BarChart,   label: 'Reportes',  adminOnly: true  },
]

export default function Sidebar() {
  return (
    <SidebarShell
      moduleName="Ventas"
      ModuleIcon={Beer}
      sectionLabel="Panel"
      navItems={navItems}
    />
  )
}
