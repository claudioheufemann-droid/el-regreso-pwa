import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/dashboard/Dashboard'
import { MACRO_AREAS } from '@/lib/gestion-types'

export const dynamic = 'force-dynamic'

const PRODUCCION_AREAS = [...MACRO_AREAS.produccion.areas, 'Mi Cerebro']

export default async function ProduccionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: users }] = await Promise.all([
    supabase.from('users').select('id, nombre, iniciales, rol, area, email, is_admin, macro_area'),
  ])

  const userProfile = users?.find(u => u.email === user.email)
  const userName = userProfile?.nombre ?? user.email?.split('@')[0] ?? 'Usuario'
  const isAdmin = userProfile?.is_admin === true
  const currentUserId = userProfile?.id ?? ''
  const userMacroArea = userProfile?.macro_area ?? null

  if (!isAdmin && userMacroArea !== null && userMacroArea !== 'produccion') {
    redirect('/gestion')
  }

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, responsable:users(id, nombre, iniciales, rol, area, email), responsable_ids')
    .in('area', PRODUCCION_AREAS)
    .order('created_at', { ascending: false })

  return (
    <div className="h-screen flex flex-col">
      <Dashboard
        initialTasks={tasks ?? []}
        users={users ?? []}
        userName={userName}
        userEmail={user.email ?? ''}
        isAdmin={isAdmin}
        currentUserId={currentUserId}
        currentMacroArea="produccion"
        backHref="/gestion"
      />
    </div>
  )
}
