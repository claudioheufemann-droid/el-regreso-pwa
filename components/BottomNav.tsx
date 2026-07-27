'use client'

import { usePathname } from 'next/navigation'
import { BarChart2, Users, Map, Upload, Target, TrendingUp, CalendarDays, Settings2, Trophy, ListChecks, Crosshair, Activity, BarChart, Route } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// El regreso al inicio va en el botón "Volver" del header, no en el nav.
const VENDEDOR_ITEMS: NavItem[] = [
  { href: '/ventas',           icon: BarChart2,  label: 'Hoy',      exact: true },
  { href: '/ventas/agenda',    icon: ListChecks, label: 'Agenda'                },
  { href: '/ventas/misiones',  icon: Target,     label: 'Misiones'              },
  { href: '/ventas/clientes',  icon: Users,      label: 'Clientes'              },
  { href: '/ventas/metas',     icon: TrendingUp, label: 'Metas'                 },
  { href: '/ventas/ranking',   icon: Trophy,     label: 'Ranking'               },
  { href: '/ventas/leads',     icon: Crosshair,  label: 'Leads'                 },
  { href: '/ventas/actividad', icon: Activity,   label: 'Actividad'             },
  { href: '/ventas/mapa',      icon: Map,        label: 'Mapa'                  },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/ventas',                      icon: BarChart2,   label: 'Hoy',      exact: true },
  { href: '/ventas/agenda',               icon: ListChecks,  label: 'Agenda'                },
  { href: '/ventas/acumulado',            icon: CalendarDays,label: 'Período'               },
  { href: '/ventas/misiones',             icon: Target,      label: 'Misiones'              },
  { href: '/ventas/clientes',             icon: Users,       label: 'Clientes'              },
  { href: '/ventas/leads',                icon: Crosshair,   label: 'Leads'                 },
  { href: '/ventas/metas',                icon: TrendingUp,  label: 'Metas'                 },
  { href: '/ventas/ranking',              icon: Trophy,      label: 'Ranking'               },
  { href: '/ventas/actividad',            icon: Activity,    label: 'Actividad'             },
  { href: '/ventas/mapa',                 icon: Map,         label: 'Mapa'                  },
  { href: '/ventas/admin',                icon: Settings2,   label: 'Admin'                 },
  { href: '/ventas/admin/cargar',         icon: Upload,      label: 'Cargar'                },
  { href: '/ventas/admin/reportes',       icon: BarChart,    label: 'Reportes'              },
  { href: '/ventas/admin/rutas-clientes', icon: Route,       label: 'Rutas'                 },
]

export default function BottomNav() {
  const pathname   = usePathname()
  const { isAdmin } = useUser()
  const items = isAdmin ? ADMIN_ITEMS : VENDEDOR_ITEMS
  return <NavPill items={items} pathname={pathname} />
}
