'use client'

import { BarChart2, Users, Zap, ListChecks } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/ventas',                     icon: BarChart2,  label: 'Hoy',       exact: true, adminOnly: false },
  { href: '/ventas/agenda',              icon: ListChecks, label: 'Agenda',                 adminOnly: false },
  { href: '/ventas/misiones',            icon: Zap,        label: 'Misiones',               adminOnly: false },
  { href: '/ventas/clientes',            icon: Users,      label: 'Clientes',               adminOnly: false },
]

export default function Sidebar() {
  return (
    <SidebarShell
      moduleName="Ventas"
      sectionLabel="Panel"
      navItems={navItems}
    />
  )
}
