'use client'

import { usePathname } from 'next/navigation'
import { Briefcase, Building2, Factory } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

// El regreso al inicio va en el botón "Volver" del header, no en el nav.
const ITEMS: NavItem[] = [
  { href: '/gestion/comercial',      icon: Briefcase, label: 'Comercial'               },
  { href: '/gestion/administracion', icon: Building2, label: 'Admin'                   },
  { href: '/gestion/produccion',     icon: Factory,   label: 'Producción'               },
]

export default function GestionBottomNav() {
  const pathname = usePathname()
  // Solo mostrar en el hub /gestion — las sub-páginas usan el nav interno del Dashboard
  if (pathname !== '/gestion') return null
  return <NavPill items={ITEMS} pathname={pathname} />
}
