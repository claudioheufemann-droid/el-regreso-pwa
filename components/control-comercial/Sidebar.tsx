'use client'

import { LayoutDashboard, TrendingUp, Target, Settings } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from '@/components/SidebarShell'

// Fase 1: Resumen, Ventas, Metas. El resto (Clientes, Cobranza, Barriles,
// Equipo, Reunión Comercial) se agrega en fases siguientes — ver auditoría.
const navItems: SidebarNavItem[] = [
  { href: '/control-comercial/resumen', icon: LayoutDashboard, label: 'Resumen Ejecutivo', exact: true, adminOnly: false },
  { href: '/control-comercial/ventas',  icon: TrendingUp,      label: 'Ventas',                         adminOnly: false },
  { href: '/control-comercial/metas',   icon: Target,          label: 'Metas',                          adminOnly: false },
]

export default function ControlComercialSidebar() {
  return (
    <SidebarShell
      moduleName="Control Comercial"
      sectionLabel="Panel"
      navItems={navItems}
      cta={
        <a
          href="/control-comercial/metas"
          style={{
            display: 'flex', alignItems: 'center', gap: 8, marginTop: 8,
            padding: '9px 10px', borderRadius: 9, fontSize: 12, fontWeight: 600,
            color: 'var(--muted)', textDecoration: 'none',
          }}
        >
          <Settings size={14} /> Configuración
        </a>
      }
    />
  )
}
