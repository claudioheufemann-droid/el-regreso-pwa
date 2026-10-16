'use client'

import { usePathname } from 'next/navigation'
import { ClipboardList, CalendarClock, Target } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// Visitas y Planificación (punto 1 del prompt de planificación semanal).
// Nueva visita/Jornada/Mi ruta/Cercanos/Historial dejaron de ser
// destinos de nav de primer nivel — viven como accesos dentro del hub de Visitas
// (app/terreno/TerrenoHubClient.tsx ya los tenía como tarjetas, y "Nueva visita" como
// CTA principal), así que nada quedó inalcanzable, sólo se sacó del nav flotante.
// Consolidación hecha una vez que el flujo de planificación se probó en producción
// (antes se había agregado sólo de forma aditiva para no arriesgar el hábito diario).
// 16-oct-2026: se agregó Metas (plan de venta temporada, /ventas/metas-temporada)
// a pedido de Claudio — el vendedor pasa el día en Terreno y no la encontraba
// en el nav de Ventas. Cada vendedor ve solo su plan: lo acota la RLS de
// plan_metas_semanales (user_id = auth.uid()). Se muestra a quien tiene
// cartera (region) y a admins (que ven el equipo); al resto no le sirve.
const ITEMS: NavItem[] = [
  { href: '/terreno',               icon: ClipboardList, label: 'Visitas',       exact: true },
  { href: '/terreno/planificacion', icon: CalendarClock, label: 'Planificación'              },
]

export const METAS_ITEM: NavItem = { href: '/ventas/metas-temporada', icon: Target, label: 'Metas' }

export default function TerrenoBottomNav() {
  const pathname = usePathname()
  const { isAdmin, region } = useUser()
  // Nueva Visita es un flujo propio a pantalla completa (con su propio header
  // y botón Volver) — el nav flotante le tapaba el botón de confirmar al
  // final de cada paso.
  if (pathname?.startsWith('/terreno/nueva-visita')) return null
  // El panel de administrador es su propio shell desktop (ver
  // app/terreno/admin/layout.tsx) con su propia navegación — no es para
  // vendedores, así que ni el nav flotante ni el sidebar de Terreno aplican ahí.
  if (pathname?.startsWith('/terreno/admin')) return null
  const items = isAdmin || region ? [...ITEMS, METAS_ITEM] : ITEMS
  return <NavPill items={items} pathname={pathname} />
}
