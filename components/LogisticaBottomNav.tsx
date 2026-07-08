'use client'

import { usePathname } from 'next/navigation'
import { PackagePlus, PackageCheck, AlertTriangle } from 'lucide-react'
import { NavPill, type NavItem } from '@/components/ui/NavPill'

const ITEMS: NavItem[] = [
  { href: '/logistica/produccion/declarar', icon: PackagePlus,  label: 'Declarar'  },
  { href: '/logistica/recepcion',           icon: PackageCheck, label: 'Recepción' },
  { href: '/logistica/alertas',             icon: AlertTriangle,label: 'Alertas'   },
]

export default function LogisticaBottomNav() {
  const pathname = usePathname()
  return <NavPill items={ITEMS} pathname={pathname} />
}
