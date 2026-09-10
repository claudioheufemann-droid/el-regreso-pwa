'use client'

import { LayoutDashboard, TrendingUp, Users, CircleDollarSign, Layers, Trophy, Presentation, Target, FileText, Settings } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from '@/components/SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/control-comercial/resumen',           icon: LayoutDashboard,  label: 'Resumen Ejecutivo', exact: true, adminOnly: false },
  { href: '/control-comercial/ventas',            icon: TrendingUp,       label: 'Ventas',                         adminOnly: false },
  { href: '/control-comercial/clientes',          icon: Users,            label: 'Clientes',                       adminOnly: false },
  { href: '/control-comercial/cobranza',          icon: CircleDollarSign, label: 'Cobranza',                       adminOnly: false },
  { href: '/control-comercial/barriles',          icon: Layers,           label: 'Barriles',                       adminOnly: false },
  { href: '/control-comercial/equipo',            icon: Trophy,           label: 'Equipo',                         adminOnly: false },
  { href: '/control-comercial/reunion-comercial', icon: Presentation,     label: 'Reunión Comercial',              adminOnly: false },
  { href: '/control-comercial/reportes',          icon: FileText,         label: 'Reportes',                       adminOnly: false },
  { href: '/control-comercial/metas',             icon: Target,          label: 'Metas',                          adminOnly: false },
]

export default function ControlComercialSidebar() {
  return (
    <SidebarShell
      moduleName="Control Comercial"
      sectionLabel="Panel"
      navItems={navItems}
      cta={
        <a
          href="/control-comercial/configuracion"
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
