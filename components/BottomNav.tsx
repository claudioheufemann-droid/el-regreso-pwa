'use client'

import { usePathname } from 'next/navigation'
import { BarChart2, Users, Upload, Target, ListChecks, Package, FileText, TrendingUp, Wallet } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// El regreso al inicio va en el botón "Volver" del header, no en el nav.
// Orden pedido por Claudio: Stock al lado de Ventas: Agenda al final para
// que, en el admin (7 ítems, dispara el overflow del pill), quede dentro
// de "Más" junto a Cargar en vez de ocupar un slot visible.
const VENDEDOR_ITEMS: NavItem[] = [
  { href: '/ventas',              icon: BarChart2,  label: 'Ventas',       exact: true },
  { href: '/ventas/stock',        icon: Package,    label: 'Stock'                     },
  { href: '/ventas/cotizaciones', icon: FileText,   label: 'Cotizaciones'              },
  { href: '/ventas/clientes',     icon: Users,      label: 'Clientes'                  },
  { href: '/ventas/misiones',     icon: Target,     label: 'Misiones'                  },
  { href: '/ventas/agenda',       icon: ListChecks, label: 'Agenda'                    },
]

const ADMIN_ITEMS: NavItem[] = [
  { href: '/ventas',                      icon: BarChart2,   label: 'Ventas',       exact: true },
  { href: '/ventas/stock',                icon: Package,     label: 'Stock'                     },
  { href: '/ventas/cotizaciones',         icon: FileText,    label: 'Cotizaciones'              },
  { href: '/ventas/clientes',             icon: Users,       label: 'Clientes'                  },
  { href: '/ventas/misiones',             icon: Target,      label: 'Misiones'                  },
  { href: '/ventas/agenda',               icon: ListChecks,  label: 'Agenda'                    },
  { href: '/ventas/admin/cargar',         icon: Upload,      label: 'Cargar'                    },
]

// Rentabilidad: solo quienes tienen puede_ver_margenes (Claudio/Benja/Douglas).
// Comisiones: acceso aparte, ver puedeVerComisionesEquipo en lib/comisiones.ts
// (hoy Claudio/Douglas/Benjamín/Mariel — no siempre coincide con Rentabilidad,
// por eso van desacoplados aunque hoy compartan slot).
// Ambos toman el slot visible de Clientes (pedido explícito de Claudio, las
// usa más que Clientes) y mandan Clientes al final, junto con el resto en
// "Más" (el NavPill hace overflow solo, no hace falta cuidar el conteo acá).
const RENTABILIDAD_ITEM: NavItem = { href: '/ventas/rentabilidad', icon: TrendingUp, label: 'Rentabilidad' }
const COMISIONES_ITEM: NavItem = { href: '/ventas/comisiones', icon: Wallet, label: 'Comisiones' }

function conModulosDeMargenesEnLugarDeClientes(base: NavItem[], extra: NavItem[]): NavItem[] {
  if (extra.length === 0) return base
  const idx = base.findIndex(i => i.href === '/ventas/clientes')
  const clientesItem = base[idx]
  const sinClientes = base.filter(i => i.href !== '/ventas/clientes')
  const nuevos = [...sinClientes]
  nuevos.splice(idx, 0, ...extra)
  if (clientesItem) nuevos.push(clientesItem)
  return nuevos
}

export default function BottomNav() {
  const pathname = usePathname()
  const { isAdmin, puedeVerMargenes, veComisiones } = useUser()
  const base = isAdmin ? ADMIN_ITEMS : VENDEDOR_ITEMS
  const extra = [
    ...(puedeVerMargenes ? [RENTABILIDAD_ITEM] : []),
    ...(veComisiones ? [COMISIONES_ITEM] : []),
  ]
  const items = conModulosDeMargenesEnLugarDeClientes(base, extra)
  return <NavPill items={items} pathname={pathname} />
}
