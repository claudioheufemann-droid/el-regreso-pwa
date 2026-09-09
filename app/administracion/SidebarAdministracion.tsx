'use client'

import { LineChart, Wallet } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from '@/components/SidebarShell'

// Cobranza vive nativa en el módulo (antes era un link de salida a
// /ventas/deudores) — mismo dato y misma reconstrucción de facturas
// (lib/cobranza.ts), con un dashboard propio pensado para escritorio.
const navItems: SidebarNavItem[] = [
  { href: '/administracion', icon: LineChart, label: 'Finanzas', exact: true },
  { href: '/administracion/cobranza', icon: Wallet, label: 'Cobranza' },
]

export default function SidebarAdministracion() {
  return (
    <SidebarShell
      moduleName="Administración y Finanzas"
      sectionLabel="Panel"
      navItems={navItems}
    />
  )
}
