import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import Sidebar from '@/components/control-comercial/Sidebar'
import BottomNav from '@/components/control-comercial/BottomNav'

export default async function ControlComercialLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!puedeVerControlComercial(user)) redirect('/')

  return (
    // data-theme="light" es a propósito: Control Comercial es el único módulo con fondo
    // blanco (pedido explícito), independiente del theme oscuro del resto de la app —
    // ver la regla .cc-root[data-theme="light"] en globals.css.
    <div className="cc-root min-h-screen flex" data-theme="light" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <main className="flex-1 min-w-0 flex flex-col overflow-x-clip pb-36 lg:pb-0 mobile-safe-top">
        {children}
      </main>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
