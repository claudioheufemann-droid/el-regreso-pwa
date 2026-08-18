'use client'

import { usePathname } from 'next/navigation'
import PageTabs from '@/components/PageTabs'
import type { PageTab } from '@/components/PageTabs'

const HIDDEN_ON = ['/flota/checkin', '/flota/viaje', '/flota/checkout']

export default function FlotaTabBar({ tabs, accent }: { tabs: PageTab[]; accent: string }) {
  const pathname = usePathname()
  const hide = HIDDEN_ON.some(p => pathname === p || pathname.startsWith(p + '/'))
  if (hide) return null
  return <PageTabs tabs={tabs} accent={accent} />
}
