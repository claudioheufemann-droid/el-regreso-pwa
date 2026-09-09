import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import SidebarAdministracion from './SidebarAdministracion'

/**
 * Módulo Administración — finanzas de la empresa.
 *
 * Solo administradores: acá se ve facturación, márgenes de caja y deuda por
 * cobrar de toda la empresa, no la cartera de un vendedor. El guard va en el
 * layout (no en cada página) para que cualquier ruta que se agregue después
 * quede protegida sola.
 *
 * Diseñado para PC: es una pantalla de escritorio, con tablas anchas y
 * gráficos. En pantallas chicas el contenido se apila, pero no hay barra
 * inferior de navegación como en Ventas.
 */
export default async function AdministracionLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <SidebarAdministracion />
      </div>
      <main className="flex-1 min-w-0 flex flex-col overflow-x-clip mobile-safe-top">
        {children}
      </main>
    </div>
  )
}
