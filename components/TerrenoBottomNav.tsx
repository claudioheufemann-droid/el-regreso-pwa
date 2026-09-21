'use client'

import { usePathname } from 'next/navigation'
import { LayoutDashboard, CalendarClock, Route, Plus, Navigation, History } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// 6 destinos: NavPill muestra los primeros 4 y el resto en "Más" (sin scroll
// horizontal, sin romper nada). "Planificación" se agrega de forma ADITIVA
// (punto 8 del plan de planificación semanal) — Panel/Viaje/Visita se quedan
// donde estaban para no romper el hábito diario; Cercanos/Historial pasan al
// overflow porque se usan con menos frecuencia que planificar la semana.
const ITEMS: NavItem[] = [
  { href: '/terreno',              icon: LayoutDashboard, label: 'Panel',          exact: true },
  { href: '/terreno/planificacion', icon: CalendarClock,  label: 'Planificación'               },
  { href: '/terreno/nueva-visita', icon: Plus,            label: 'Visita'                      },
  { href: '/terreno/ruta',         icon: Route,           label: 'Viaje'                       },
  { href: '/terreno/cercanos',     icon: Navigation,      label: 'Cercanos'                    },
  { href: '/terreno/historial',    icon: History,         label: 'Historial'                   },
]

export default function TerrenoBottomNav() {
  const pathname = usePathname()
  // Nueva Visita es un flujo propio a pantalla completa (con su propio header
  // y botón Volver) — el nav flotante le tapaba el botón de confirmar al
  // final de cada paso.
  if (pathname?.startsWith('/terreno/nueva-visita')) return null
  // El panel de administrador es su propio shell desktop (ver
  // app/terreno/admin/layout.tsx) con su propia navegación — no es para
  // vendedores, así que ni el nav flotante ni el sidebar de Terreno aplican ahí.
  if (pathname?.startsWith('/terreno/admin')) return null
  return <NavPill items={ITEMS} pathname={pathname} />
}
