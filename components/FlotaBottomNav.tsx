'use client'

import { usePathname } from 'next/navigation'
import { Truck, Plus, History, BarChart3, Home } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const ITEMS: NavItem[] = [
  { href: '/',                icon: Home,      label: 'Inicio',    exact: true  },
  { href: '/flota',           icon: Truck,     label: 'Flota',     exact: true  },
  { href: '/flota/checkin',   icon: Plus,      label: 'Salida'                  },
  { href: '/flota/historial', icon: History,   label: 'Historial'               },
  { href: '/flota/admin',     icon: BarChart3, label: 'Reportes'                },
]

export default function FlotaBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
