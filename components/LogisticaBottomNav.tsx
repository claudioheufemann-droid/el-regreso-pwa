'use client'

import { usePathname } from 'next/navigation'
import { PackagePlus, PackageCheck, AlertTriangle, Archive } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const ITEMS: NavItem[] = [
  { href: '/logistica/produccion/declarar', icon: PackagePlus,  label: 'Declarar'  },
  { href: '/logistica/recepcion',           icon: PackageCheck, label: 'Recepción' },
  { href: '/logistica/alertas',             icon: AlertTriangle,label: 'Alertas'   },
  { href: '/logistica/historial',           icon: Archive,      label: 'Historial' },
]

export default function LogisticaBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
