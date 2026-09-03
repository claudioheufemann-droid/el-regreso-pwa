'use client'

import { usePathname } from 'next/navigation'
import { LayoutDashboard, TrendingUp, Target } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const ITEMS: NavItem[] = [
  { href: '/control-comercial/resumen', icon: LayoutDashboard, label: 'Resumen', exact: true },
  { href: '/control-comercial/ventas',  icon: TrendingUp,      label: 'Ventas' },
  { href: '/control-comercial/metas',   icon: Target,          label: 'Metas' },
]

export default function ControlComercialBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
