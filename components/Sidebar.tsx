'use client'

import { BarChart2, Users, ListChecks, Package, FileText, TrendingUp, Wallet, CircleDollarSign } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

// 31-ago-2026: se sacó Misiones (módulo dado de baja) y se agregó Deudores
// (cada vendedor ve la deuda de su propia cartera; ver app/ventas/deudores).
const navItems: SidebarNavItem[] = [
  { href: '/ventas',                     icon: BarChart2,        label: 'Hoy',          exact: true, adminOnly: false },
  { href: '/ventas/agenda',              icon: ListChecks,       label: 'Agenda',                    adminOnly: false },
  { href: '/ventas/cotizaciones',        icon: FileText,         label: 'Cotizaciones',              adminOnly: false },
  { href: '/ventas/rentabilidad',        icon: TrendingUp,       label: 'Rentabilidad',               margenesOnly: true },
  { href: '/ventas/comisiones',          icon: Wallet,           label: 'Comisiones',                 margenesOnly: true },
  { href: '/ventas/deudores',            icon: CircleDollarSign, label: 'Deudores',                  adminOnly: false },
  { href: '/ventas/stock',               icon: Package,          label: 'Stock',                     adminOnly: false },
  { href: '/ventas/clientes',            icon: Users,            label: 'Clientes',                  adminOnly: false },
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
