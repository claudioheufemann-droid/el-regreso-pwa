import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/dashboard/Dashboard'

export const dynamic = 'force-dynamic'

export default async function GestionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: tasks }, { data: users }] = await Promise.all([
    supabase.from('tasks').select('*, responsable:users(id, nombre, iniciales, rol, area, email), responsable_ids').order('created_at', { ascending: false }),
    supabase.from('users').select('id, nombre, iniciales, rol, area, email, is_admin, macro_area'),
  ])

  const userProfile = users?.find(u => u.email === user.email)
  const userName = userProfile?.nombre ?? user.email?.split('@')[0] ?? 'Usuario'
  const isAdmin = userProfile?.is_admin === true
  const currentUserId = userProfile?.id ?? ''
  const currentMacroArea = userProfile?.macro_area ?? null

  return (
    <div className="h-screen flex flex-col">
      <Dashboard
        initialTasks={tasks ?? []}
        users={users ?? []}
        userName={userName}
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        currentMacroArea={currentMacroArea}
      />
    </div>
  )
}
