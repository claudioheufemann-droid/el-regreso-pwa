'use client'

import { usePathname } from 'next/navigation'
import { BarChart2, TrendingUp, Users, Map, Upload, Home, Target, Trophy } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const BASE_ITEMS: NavItem[] = [
  { href: '/',                 icon: Home,       label: 'Inicio',   exact: true  },
  { href: '/ventas',           icon: BarChart2,  label: 'Hoy',      exact: true  },
  { href: '/ventas/acumulado', icon: TrendingUp, label: 'Período'               },
  { href: '/ventas/misiones',  icon: Target,     label: 'Misiones'              },
  { href: '/ventas/clientes',  icon: Users,      label: 'Clientes'              },
  { href: '/ventas/mapa',      icon: Map,        label: 'Mapa'                  },
  { href: '/ventas/metas',     icon: Trophy,     label: 'Metas'                 },
]

const ADMIN_ITEM: NavItem = { href: '/ventas/admin/cargar', icon: Upload, label: 'Cargar' }

export default function BottomNav() {
  const pathname  = usePathname()
  const { isAdmin } = useUser()
  const items = isAdmin ? [...BASE_ITEMS, ADMIN_ITEM] : BASE_ITEMS
  return <NavPill items={items} pathname={pathname} />
}
