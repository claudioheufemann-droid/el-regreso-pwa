'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Truck, Plus, Map, BarChart3, ArrowLeft } from 'lucide-react'

const F = '#F97316'
const F_DIM = 'rgba(249,115,22,0.12)'
const F_BORDER = 'rgba(249,115,22,0.28)'

const items = [
  { href: '/flota',        icon: Truck,    label: 'Vehículos', exact: true  },
  { href: '/flota/checkin',icon: Plus,     label: 'Nueva Salida', exact: false },
  { href: '/flota/rutas',  icon: Map,      label: 'Rutas',     exact: false },
  { href: '/flota/admin',  icon: BarChart3,label: 'Reportes',  exact: false },
]

export default function FlotaSidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden lg:flex flex-col" style={{ width: 220, minHeight: '100vh', background: 'var(--surface)', borderRight: '1px solid var(--border)', padding: '24px 16px', flexShrink: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: F_DIM, border: `1px solid ${F_BORDER}`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Truck size={18} color={F} />
        </div>
        <div>
          <p style={{ fontSize: 12, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.3px' }}>El Regreso</p>
          <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>Flota</p>
        </div>
      </div>

      <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, marginBottom: 16, color: 'var(--muted)', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>
        <ArrowLeft size={13} />
        Cambiar módulo
      </Link>

      <nav style={{ display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {items.map(({ href, icon: Icon, label, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href)
          return (
            <Link key={href} href={href} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, textDecoration: 'none', background: active ? F_DIM : 'transparent', color: active ? F : 'var(--muted)', fontSize: 13, fontWeight: active ? 700 : 500, border: `1px solid ${active ? F_BORDER : 'transparent'}`, transition: 'all 0.15s' }}>
              <Icon size={16} />
              {label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
