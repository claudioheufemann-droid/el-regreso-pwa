import BottomNav from '@/components/BottomNav'
import Sidebar from '@/components/Sidebar'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      {/* Sidebar — solo escritorio */}
      <div className="hidden lg:flex">
        <Sidebar />
      </div>

      {/* Contenido principal */}
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto pb-24 lg:pb-0">
        {children}
      </main>

      {/* Bottom nav — solo móvil */}
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
