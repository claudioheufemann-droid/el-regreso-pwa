'use client'

import { usePathname } from 'next/navigation'
import { Truck, Plus, History, BarChart3, Route, Gauge } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// El regreso al inicio va en el botón "Volver" del header, no en el nav.
const ITEMS: NavItem[] = [
  { href: '/flota',           icon: Truck,     label: 'Flota',     exact: true  },
  { href: '/flota/checkin',   icon: Plus,      label: 'Salida'                  },
  { href: '/flota/despachos', icon: Route,     label: 'Despachos'               },
  { href: '/flota/historial', icon: History,   label: 'Historial'               },
  { href: '/flota/kpis',      icon: Gauge,     label: 'KPIs'                    },
  { href: '/flota/admin',     icon: BarChart3, label: 'Reportes'                },
]

export default function FlotaBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
