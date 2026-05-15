'use client'

import BottomNav from '@/components/BottomNav'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart2, TrendingUp, Target, Upload } from 'lucide-react'

const navItems = [
  { href: '/', icon: <BarChart2 size={20} />, label: 'Hoy' },
  { href: '/acumulado', icon: <TrendingUp size={20} />, label: 'Período' },
  { href: '/metas', icon: <Target size={20} />, label: 'Metas' },
  { href: '/admin/cargar', icon: <Upload size={20} />, label: 'Cargar' },
]

function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      className="hidden lg:flex flex-col fixed left-0 top-0 h-full w-[220px] z-50"
      style={{ background: '#111', borderRight: '1px solid #222' }}
    >
      {/* Branding */}
      <div className="px-5 pt-6 pb-5" style={{ borderBottom: '1px solid #1E1E1E' }}>
        <p className="text-base font-black" style={{ color: '#F59E0B' }}>El Regreso</p>
        <p className="text-xs mt-0.5" style={{ color: '#666' }}>Ventas</p>
      </div>

      {/* Nav items */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(item => {
          const active = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all"
              style={{
                background: active ? '#F59E0B18' : 'transparent',
                color: active ? '#F59E0B' : '#666',
              }}
            >
              {item.icon}
              <span className="text-sm font-medium">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0F0F0F' }}>
      <Sidebar />
      <div className="lg:pl-[220px] flex-1 flex flex-col">
        <main className="flex-1 pb-24 lg:pb-8">
          {children}
        </main>
        <BottomNav />
      </div>
    </div>
  )
}
