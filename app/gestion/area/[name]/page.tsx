import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import AreaView from '@/components/area/AreaView'
import { getMacroKey } from '@/lib/gestion-types'

export const dynamic = 'force-dynamic'

export default async function AreaPage({ params }: { params: Promise<{ name: string }> }) {
  const { name } = await params
  const area = decodeURIComponent(name)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: tasks }, { data: users }] = await Promise.all([
    supabase.from('tasks').select('*, responsable:users(id, nombre, iniciales, rol, area, email)').eq('area', area).order('created_at', { ascending: false }),
    supabase.from('users').select('id, nombre, iniciales, rol, area, email, is_admin, macro_area'),
  ])

  const userProfile = users?.find(u => u.email === user.email)
  const isAdmin = userProfile?.is_admin === true
  const currentUserId = userProfile?.id ?? ''
  const userMacroArea = userProfile?.macro_area ?? null

  // Bloquear acceso si el área no pertenece a la macro-área del usuario
  const areaMacro = getMacroKey(area)
  if (!isAdmin && userMacroArea !== null && userMacroArea !== areaMacro) {
    redirect('/gestion')
  }

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
