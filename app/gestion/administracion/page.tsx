import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/dashboard/Dashboard'
import { MACRO_AREAS } from '@/lib/gestion-types'

export const dynamic = 'force-dynamic'

// Áreas que pertenecen a esta macro + tareas personales
const ADMIN_AREAS = [...MACRO_AREAS.administracion.areas, 'Mi Cerebro']

export default async function AdministracionPage() {
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

  // Siempre filtrar a esta macro-área (incluso para admin)
  // La vista global está disponible en el Panel KPIs dentro del módulo
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, responsable:users(id, nombre, iniciales, rol, area, email, avatar_url), responsable_ids')
    .in('area', ADMIN_AREAS)
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
        currentMacroArea="administracion"
        backHref="/gestion"
      />
    </div>
  )
}
