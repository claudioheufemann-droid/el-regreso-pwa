import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Dashboard from '@/components/dashboard/Dashboard'
import { MACRO_AREAS } from '@/lib/gestion-types'

export const dynamic = 'force-dynamic'

// Áreas que pertenecen a esta macro + tareas personales
const COMERCIAL_AREAS = [...MACRO_AREAS.comercial.areas, 'Mi Cerebro']

export default async function ComercialPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const [{ data: users }] = await Promise.all([
    supabase.from('users').select('id, nombre, iniciales, rol, area, email, is_admin, macro_area, avatar_url'),
  ])

  const userProfile = users?.find(u => u.email === user.email)
  const userName = userProfile?.nombre ?? user.email?.split('@')[0] ?? 'Usuario'
  const isAdmin = userProfile?.is_admin === true
  const currentUserId = userProfile?.id ?? ''
  const userMacroArea = userProfile?.macro_area ?? null

  // Bloquear acceso si el usuario pertenece a otra macro-área
  if (!isAdmin && userMacroArea !== null && userMacroArea !== 'comercial') {
    redirect('/gestion')
  }

  // Siempre filtrar a esta macro-área (incluso para admin)
  // La vista global está disponible en el Panel KPIs dentro del módulo
  const { data: tasks } = await supabase
    .from('tasks')
    .select('*, responsable:users(id, nombre, iniciales, rol, area, email, avatar_url), responsable_ids')
    .in('area', COMERCIAL_AREAS)
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
        currentMacroArea="comercial"
        backHref="/gestion"
      />
    </div>
  )
}
