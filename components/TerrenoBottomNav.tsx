'use client'

import { usePathname } from 'next/navigation'
import { LayoutDashboard, Route, Plus, Navigation, History } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// 5 destinos = los 5 slots del NavPill, sin botón "Más".
// Orden = flujo de trabajo del vendedor: reviso mi día → planifico a dónde voy
// → registro la visita (acción central) → veo qué tengo cerca → reviso lo hecho.
const ITEMS: NavItem[] = [
  { href: '/terreno',              icon: LayoutDashboard, label: 'Panel',     exact: true },
  { href: '/terreno/ruta',         icon: Route,           label: 'Viaje'                  },
  { href: '/terreno/nueva-visita', icon: Plus,            label: 'Visita'                 },
  { href: '/terreno/cercanos',     icon: Navigation,      label: 'Cercanos'               },
  { href: '/terreno/historial',    icon: History,         label: 'Historial'              },
]

export default function TerrenoBottomNav() {
  const pathname = usePathname()
  // Nueva Visita es un flujo propio a pantalla completa (con su propio header
  // y botón Volver) — el nav flotante le tapaba el botón de confirmar al
  // final de cada paso.
  if (pathname?.startsWith('/terreno/nueva-visita')) return null
  return <NavPill items={ITEMS} pathname={pathname} />
}
