'use client'

import { PackagePlus, PackageCheck, AlertTriangle, Archive } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/logistica/produccion/declarar', icon: PackagePlus,   label: 'Declarar lote', exact: false },
  { href: '/logistica/recepcion',           icon: PackageCheck,  label: 'Recepción',     exact: false },
  { href: '/logistica/alertas',             icon: AlertTriangle, label: 'Alertas',       exact: false },
  { href: '/logistica/historial',           icon: Archive,       label: 'Historial',     exact: false },
]

export default function LogisticaSidebar() {
  return (
    <SidebarShell
      moduleName="Producción Logística"
      sectionLabel="Producción · Bodega"
      navItems={navItems}
    />
  )
}
