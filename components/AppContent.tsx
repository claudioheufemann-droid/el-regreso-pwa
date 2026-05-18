'use client'

import { useUser } from '@/lib/userContext'
import UserPicker from './UserPicker'
import Sidebar from './Sidebar'
import BottomNav from './BottomNav'

export default function AppContent({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser()

  // Esperar a que cargue el estado de localStorage
  if (!isLoaded) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A0A0A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ width: 32, height: 32, border: '3px solid #333', borderTopColor: '#F59E0B', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      </div>
    )
  }

  if (!user) return <UserPicker />

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg)' }}>
      <div className="hidden lg:flex">
        <Sidebar />
      </div>
      <main className="flex-1 flex flex-col min-h-screen overflow-y-auto pb-24 lg:pb-0">
        {children}
      </main>
      <div className="lg:hidden">
        <BottomNav />
      </div>
    </div>
  )
}
