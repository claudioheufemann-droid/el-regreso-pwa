'use client'

import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        display: 'block', width: '100%', marginTop: 28,
        padding: '12px 0', borderRadius: 14,
        background: 'transparent', border: '1px solid rgba(255,255,255,0.06)',
        color: '#4A4540', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        letterSpacing: 0.5,
      }}
    >
      Cerrar sesión
    </button>
  )
}
