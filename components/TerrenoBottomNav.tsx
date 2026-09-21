'use client'

import { usePathname } from 'next/navigation'
import { ClipboardList, CalendarClock } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// EXACTAMENTE 2 entradas (punto 1 del prompt de planificación semanal): Planificación
// semanal y Visitas. Nueva visita/Jornada/Mi ruta/Cercanos/Historial dejaron de ser
// destinos de nav de primer nivel — viven como accesos dentro del hub de Visitas
// (app/terreno/TerrenoHubClient.tsx ya los tenía como tarjetas, y "Nueva visita" como
// CTA principal), así que nada quedó inalcanzable, sólo se sacó del nav flotante.
// Consolidación hecha una vez que el flujo de planificación se probó en producción
// (antes se había agregado sólo de forma aditiva para no arriesgar el hábito diario).
const ITEMS: NavItem[] = [
  { href: '/terreno',               icon: ClipboardList, label: 'Visitas',       exact: true },
  { href: '/terreno/planificacion', icon: CalendarClock, label: 'Planificación'              },
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
