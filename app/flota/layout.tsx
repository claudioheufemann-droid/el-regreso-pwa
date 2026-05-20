import FlotaSidebar from '@/components/FlotaSidebar'
import FlotaBottomNav from '@/components/FlotaBottomNav'

export default function FlotaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg)' }}>
      <FlotaSidebar />
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        {children}
      </main>
      <FlotaBottomNav />
    </div>
  )
}
