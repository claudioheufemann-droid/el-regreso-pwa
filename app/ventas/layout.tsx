import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import BottomNav from '@/components/BottomNav'

export default async function VentasLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      {/* Sin overflow-y-auto/min-h-screen acá a propósito: un <main> con su
          propio contenedor de scroll ANIDADO dentro de una página larga y con
          muchos botones (el dashboard de Ventas) hace que el navegador tenga
          que resolver, en cada toque, si el arrastre es "scrollear el div
          interno" o "activar el botón de abajo" — esa ambigüedad extra es lo
          que reportó el usuario como "con un dedo no anda bien, con dos sí"
          (el gesto de dos dedos lo reconoce el sistema directo, sin pasar por
          esa resolución). Dejando que sea la página completa (documento) la
          que scrollea, como en el resto de los layouts, se elimina el
          contenedor de scroll de más. */}
      {/* overflow-x-clip, NO overflow-x-hidden: por spec de CSS, si un eje tiene
          overflow distinto de 'visible' el navegador fuerza el OTRO eje (acá,
          overflow-y, dejado sin especificar a propósito arriba) a 'auto'
          automáticamente — así main volvía a ser un contenedor de scroll
          propio (computed overflow-y:auto) aunque el className ya no diga
          overflow-y-auto, reintroduciendo el mismo scroll anidado/ambiguo que
          se había sacado. 'clip' no dispara ese acoplamiento. */}
      <main className="flex-1 min-w-0 flex flex-col overflow-x-clip pb-36 lg:pb-0 mobile-safe-top">
        {children}
      </main>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
