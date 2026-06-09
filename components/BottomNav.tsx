'use client'

import { usePathname } from 'next/navigation'
import { BarChart2, Users, Map, Upload, Home, Target, TrendingUp, CalendarDays, Settings2 } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// NavPill con scroll horizontal — soporta 6-7 ítems con fades laterales
const VENDEDOR_ITEMS: NavItem[] = [
  { href: '/',                icon: Home,       label: 'Inicio',   exact: true },
  { href: '/ventas',          icon: BarChart2,  label: 'Hoy',      exact: true },
  { href: '/ventas/misiones', icon: Target,     label: 'Misiones'              },
  { href: '/ventas/clientes', icon: Users,      label: 'Clientes'              },
  { href: '/ventas/metas',    icon: TrendingUp, label: 'Metas'                 },
  { href: '/ventas/mapa',     icon: Map,        label: 'Mapa'                  },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/',                    icon: Home,        label: 'Inicio',   exact: true },
  { href: '/ventas',              icon: BarChart2,   label: 'Hoy',      exact: true },
  { href: '/ventas/acumulado',    icon: CalendarDays,label: 'Período'               },
  { href: '/ventas/misiones',     icon: Target,      label: 'Misiones'              },
  { href: '/ventas/clientes',     icon: Users,       label: 'Clientes'              },
  { href: '/ventas/metas',        icon: TrendingUp,  label: 'Metas'                 },
  { href: '/ventas/mapa',         icon: Map,         label: 'Mapa'                  },
  { href: '/ventas/admin',        icon: Settings2,   label: 'Admin'                 },
  { href: '/ventas/admin/cargar', icon: Upload,      label: 'Cargar'                },
]

export default function BottomNav() {
  const pathname   = usePathname()
  const { isAdmin } = useUser()
  const items = isAdmin ? ADMIN_ITEMS : VENDEDOR_ITEMS
  return <NavPill items={items} pathname={pathname} />
}
