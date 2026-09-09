'use client'

import { LineChart, Wallet } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from '@/components/SidebarShell'

// Una sola entrada por ahora: el módulo vive en una pantalla con pestañas
// internas (Ingresos / Flujo de caja), mismo patrón que Producción. Cuando
// aparezcan secciones que merezcan URL propia (ej. costos, resultados), se
// agregan acá.
const navItems: SidebarNavItem[] = [
  { href: '/administracion', icon: LineChart, label: 'Finanzas', exact: true },
  { href: '/ventas/deudores', icon: Wallet, label: 'Cobranza' },
]

export default function SidebarAdministracion() {
  return (
    <SidebarShell
      moduleName="Administración"
      sectionLabel="Panel"
      navItems={navItems}
    />
  )
}
