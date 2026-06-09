'use client'

import { usePathname } from 'next/navigation'
import { Home, Briefcase, Building2, Factory } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const ITEMS: NavItem[] = [
  { href: '/',                       icon: Home,      label: 'Inicio',     exact: true  },
  { href: '/gestion/comercial',      icon: Briefcase, label: 'Comercial'               },
  { href: '/gestion/administracion', icon: Building2, label: 'Admin'                   },
  { href: '/gestion/produccion',     icon: Factory,   label: 'Producción'               },
]

export default function GestionBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
