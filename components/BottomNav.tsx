'use client'

import { usePathname } from 'next/navigation'
import { BarChart2, Users, Upload, Target, ListChecks, Crosshair } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// El regreso al inicio va en el botón "Volver" del header, no en el nav.
const VENDEDOR_ITEMS: NavItem[] = [
  { href: '/ventas',           icon: BarChart2,  label: 'Hoy',      exact: true },
  { href: '/ventas/agenda',    icon: ListChecks, label: 'Agenda'                },
  { href: '/ventas/misiones',  icon: Target,     label: 'Misiones'              },
  { href: '/ventas/clientes',  icon: Users,      label: 'Clientes'              },
  { href: '/ventas/leads',     icon: Crosshair,  label: 'Leads'                 },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/ventas',                      icon: BarChart2,   label: 'Hoy',      exact: true },
  { href: '/ventas/agenda',               icon: ListChecks,  label: 'Agenda'                },
  { href: '/ventas/misiones',             icon: Target,      label: 'Misiones'              },
  { href: '/ventas/clientes',             icon: Users,       label: 'Clientes'              },
  { href: '/ventas/leads',                icon: Crosshair,   label: 'Leads'                 },
  { href: '/ventas/admin/cargar',         icon: Upload,      label: 'Cargar'                },
]

export default function BottomNav() {
  const pathname   = usePathname()
  const { isAdmin } = useUser()
  const items = isAdmin ? ADMIN_ITEMS : VENDEDOR_ITEMS
  return <NavPill items={items} pathname={pathname} />
}
