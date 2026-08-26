import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import AreaView from '@/components/area/AreaView'

export const dynamic = 'force-dynamic'

export default async function AreaPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const area = decodeURIComponent(name)

  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [{ data: tasks }, { data: users }] = await Promise.all([
    supabase.from('tasks').select('*, responsable:users(id, nombre, iniciales, rol, area, email, avatar_url)').eq('area', area).order('created_at', { ascending: false }),
    supabase.from('users').select('id, nombre, iniciales, rol, area, email, is_admin, macro_area, avatar_url'),
  ])

  const userProfile = users?.find(u => u.email === user.email)
  const isAdmin = userProfile?.is_admin === true
  const currentUserId = userProfile?.id ?? ''

  // Visibilidad total: cualquier usuario puede ver la carga de tareas de esta área,
  // sin importar su macro_area asignada — solo la creación/edición sigue controlada por isAdmin.

  return (
    <AreaView
      area={area}
      initialTasks={tasks ?? []}
      users={users ?? []}
      isAdmin={isAdmin}
      currentUserId={currentUserId}
    />
  )
}
