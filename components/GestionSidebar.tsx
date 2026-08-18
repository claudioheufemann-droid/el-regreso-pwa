'use client'

import { Briefcase, Building2, Factory, LayoutGrid } from 'lucide-react'
import SidebarShell, { SidebarNavItem } from './SidebarShell'

const navItems: SidebarNavItem[] = [
  { href: '/gestion',                icon: LayoutGrid, label: 'Hub Gestión',  exact: true  },
  { href: '/gestion/comercial',      icon: Briefcase,  label: 'Comercial'                  },
  { href: '/gestion/administracion', icon: Building2,  label: 'Administración'              },
  { href: '/gestion/produccion',     icon: Factory,    label: 'Producción'                  },
]

export default function GestionSidebar() {
  return (
    <SidebarShell
      moduleName="Gestión"
      sectionLabel="Áreas"
      navItems={navItems}
    />
  )
}
