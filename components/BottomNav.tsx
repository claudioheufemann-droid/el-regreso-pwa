'use client'

import { usePathname } from 'next/navigation'
import { BarChart2, Users, Upload, Target, ListChecks, Package } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// El regreso al inicio va en el botón "Volver" del header, no en el nav.
// Orden pedido por Claudio: Stock al lado de Ventas: Agenda al final para
// que, en el admin (6 ítems, dispara el overflow del pill), quede dentro
// de "Más" junto a Cargar en vez de ocupar un slot visible.
const VENDEDOR_ITEMS: NavItem[] = [
  { href: '/ventas',           icon: BarChart2,  label: 'Ventas',   exact: true },
  { href: '/ventas/stock',     icon: Package,    label: 'Stock'                 },
  { href: '/ventas/misiones',  icon: Target,     label: 'Misiones'              },
  { href: '/ventas/clientes',  icon: Users,      label: 'Clientes'              },
  { href: '/ventas/agenda',    icon: ListChecks, label: 'Agenda'                },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/ventas',                      icon: BarChart2,   label: 'Ventas',   exact: true },
  { href: '/ventas/stock',                icon: Package,     label: 'Stock'                 },
  { href: '/ventas/misiones',             icon: Target,      label: 'Misiones'              },
  { href: '/ventas/clientes',             icon: Users,       label: 'Clientes'              },
  { href: '/ventas/agenda',               icon: ListChecks,  label: 'Agenda'                },
  { href: '/ventas/admin/cargar',         icon: Upload,      label: 'Cargar'                },
]

export default function BottomNav() {
  const pathname   = usePathname()
  const { isAdmin } = useUser()
  const items = isAdmin ? ADMIN_ITEMS : VENDEDOR_ITEMS
  return <NavPill items={items} pathname={pathname} />
}
