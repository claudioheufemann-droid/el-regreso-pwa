'use client'

import { PackagePlus, PackageCheck, AlertTriangle, Truck, BarChart3 } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/logistica/despachos',           icon: Truck,         label: 'Despachos',     exact: false },
  { href: '/logistica/produccion/declarar', icon: PackagePlus,   label: 'Declarar lote', exact: false },
  { href: '/logistica/recepcion',           icon: PackageCheck,  label: 'Recepción',     exact: false },
  { href: '/logistica/alertas',             icon: AlertTriangle, label: 'Alertas',       exact: false },
  { href: '/logistica/kpis',                icon: BarChart3,     label: 'KPIs',          exact: false },
]

export default function LogisticaSidebar() {
  return (
    <SidebarShell
      moduleName="Logística"
      sectionLabel="Producción · Bodega"
      navItems={navItems}
    />
  )
}
