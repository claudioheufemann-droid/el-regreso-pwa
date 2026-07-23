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

const RUTAS_PANTALLA_COMPLETA = ['/flota/checkin', '/flota/checkout', '/flota/viaje']

export default function FlotaBottomNav() {
  const pathname = usePathname()
  // Checkin/Checkout/Viaje son flujos a pantalla completa con su propio header
  // y footer con botones de acción (Iniciar/Terminar viaje) — el nav flotante
  // les tapaba esos botones al quedar ambos fijos en la misma zona inferior.
  if (RUTAS_PANTALLA_COMPLETA.some(r => pathname?.startsWith(r))) return null
  return <NavPill items={ITEMS} pathname={pathname} />
}
