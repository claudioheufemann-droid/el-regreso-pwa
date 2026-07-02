'use client'

import { usePathname } from 'next/navigation'
import { Home, MapPin, History, Plus, Navigation, Locate } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const ITEMS: NavItem[] = [
  { href: '/',                     icon: Home,       label: 'Inicio',    exact: true  },
  { href: '/terreno',              icon: MapPin,     label: 'Panel',     exact: true  },
  { href: '/terreno/nueva-visita', icon: Plus,       label: 'Visita'                  },
  { href: '/terreno/ruta',         icon: Navigation, label: 'Viaje'                   },
  { href: '/terreno/cercanos',     icon: Locate,     label: 'Cercanos'                },
  { href: '/terreno/historial',    icon: History,    label: 'Historial'               },
]

export default function TerrenoBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
