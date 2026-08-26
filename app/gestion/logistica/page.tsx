import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/dashboard/Dashboard'
import { MACRO_AREAS } from '@/lib/gestion-types'

export const dynamic = 'force-dynamic'

const LOGISTICA_AREAS = [...MACRO_AREAS.logistica.areas, 'Mi Cerebro']

export default async function LogisticaGestionPage() {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [{ data: users }] = await Promise.all([
    supabase.from('users').select('id, nombre, iniciales, rol, area, email, is_admin, macro_area, avatar_url'),
  ])

  const userProfile = users?.find(u => u.email === user.email)
  const userName = userProfile?.nombre ?? user.nombre
  const isAdmin = userProfile?.is_admin === true
  const currentUserId = userProfile?.id ?? ''

  // Visibilidad total: cualquier usuario puede ver la carga de tareas de esta área,
  // sin importar su macro_area asignada — solo la creación/edición sigue controlada por isAdmin.

  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, responsable:users(id, nombre, iniciales, rol, area, email, avatar_url), responsable_ids')
    .in('area', LOGISTICA_AREAS)
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
        currentMacroArea="logistica"
        backHref="/gestion"
      />
    </div>
  )
}
