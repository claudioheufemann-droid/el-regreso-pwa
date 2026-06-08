'use client'

import { usePathname } from 'next/navigation'
import { Home, MapPin, History, Plus } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const ITEMS: NavItem[] = [
  { href: '/',                     icon: Home,    label: 'Inicio',    exact: true  },
  { href: '/terreno',              icon: MapPin,  label: 'Hub',       exact: true  },
  { href: '/terreno/historial',    icon: History, label: 'Historial'               },
  { href: '/terreno/nueva-visita', icon: Plus,    label: 'Visita'                  },
]

export default function TerrenoBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
