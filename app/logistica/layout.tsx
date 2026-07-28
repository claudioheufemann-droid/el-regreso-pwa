import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import LogisticaSidebar from '@/components/LogisticaSidebar'
import LogisticaBottomNav from '@/components/LogisticaBottomNav'

export default async function LogisticaLayout({ children }: { children: React.ReactNode }) {
  // Acceso total para cualquier trabajador autenticado, sin importar su área.
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <LogisticaSidebar />
      </div>
      {/* Sin overflow-y-auto/min-h-screen acá a propósito — mismo fix que
          app/ventas/layout.tsx: un <main> con su propio contenedor de
          scroll ANIDADO dentro de una página larga con el nav flotante
          abajo hace que el navegador no sepa resolver el gesto de scroll
          (por eso "no se puede hacer scroll en nada"). Dejando que sea la
          página completa (documento) la que scrollea se elimina el
          contenedor de scroll de más. overflow-x-clip, NO overflow-x-hidden:
          por spec de CSS, 'hidden' fuerza el otro eje (overflow-y) a 'auto'
          automáticamente y reintroduce el mismo contenedor anidado; 'clip'
          no dispara ese acoplamiento. */}
      <main className="flex-1 min-w-0 flex flex-col overflow-x-clip pb-32 lg:pb-0 mobile-safe-top">
        {children}
      </main>
      <div className="lg:hidden">
        <LogisticaBottomNav />
      </div>
    </div>
  )
}
