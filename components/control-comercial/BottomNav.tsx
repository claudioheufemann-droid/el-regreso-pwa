'use client'

import { usePathname } from 'next/navigation'
import { LayoutDashboard, TrendingUp, Users, CircleDollarSign, Layers, Trophy, Presentation, Target, FileText } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// NavPill muestra 4 + "Más" — orden pensado para que lo más gerencial quede visible.
const ITEMS: NavItem[] = [
  { href: '/control-comercial/resumen',           icon: LayoutDashboard,  label: 'Resumen', exact: true },
  { href: '/control-comercial/ventas',            icon: TrendingUp,       label: 'Ventas' },
  { href: '/control-comercial/clientes',          icon: Users,            label: 'Clientes' },
  { href: '/control-comercial/cobranza',          icon: CircleDollarSign, label: 'Cobranza' },
  { href: '/control-comercial/barriles',          icon: Layers,           label: 'Barriles' },
  { href: '/control-comercial/equipo',            icon: Trophy,           label: 'Equipo' },
  { href: '/control-comercial/reunion-comercial', icon: Presentation,     label: 'Reunión' },
  { href: '/control-comercial/reportes',          icon: FileText,         label: 'Reportes' },
  { href: '/control-comercial/metas',             icon: Target,          label: 'Metas' },
]

export default function ControlComercialBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
