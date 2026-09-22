'use client'

import { usePathname } from 'next/navigation'
import { Home, CalendarClock, Users, Map as MapIcon, FileCheck2, BarChart3, Wallet } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const NAV_ADMIN: NavItem[] = [
  { href: '/terreno/admin', label: 'Resumen', icon: Home, exact: true },
  { href: '/terreno/admin/planificacion', label: 'Planificación', icon: Wallet },
  { href: '/terreno/admin/visitas', label: 'Visitas', icon: CalendarClock },
  { href: '/terreno/admin/clientes', label: 'Clientes', icon: Users },
  { href: '/terreno/admin/rutas', label: 'Rutas', icon: MapIcon },
  { href: '/terreno/admin/revision', label: 'Revisión', icon: FileCheck2 },
  { href: '/terreno/admin/reportes', label: 'Reportes', icon: BarChart3 },
]

/** Mariel/Claudio-como-pagador sin ser admin del resto del panel: sólo Planificación. */
const NAV_SOLO_PLANIFICACION: NavItem[] = [
  { href: '/terreno/admin/planificacion', label: 'Planificación', icon: Wallet, exact: true },
]

interface Props {
  isAdmin: boolean
}

/**
 * Equivalente móvil de la sidebar de AdminShell (que sólo se muestra desde 1024px).
 * Sin esto, un admin en el celular no tenía forma de navegar dentro de
 * /terreno/admin — el módulo quedaba inalcanzable fuera de escritorio.
 */
export default function AdminBottomNav({ isAdmin }: Props) {
  const pathname = usePathname()
  const items = isAdmin ? NAV_ADMIN : NAV_SOLO_PLANIFICACION
  return <NavPill items={items} pathname={pathname ?? ''} />
}
