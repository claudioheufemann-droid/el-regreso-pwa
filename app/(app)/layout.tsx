import { UserProvider } from '@/lib/userContext'
import AppContent from '@/components/AppContent'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <AppContent>
        {children}
      </AppContent>
    </UserProvider>
  )
}
