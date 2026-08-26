import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import GestionHubClient from '@/components/GestionHubClient'
import { MACRO_AREAS } from '@/lib/gestion-types'

export const dynamic = 'force-dynamic'

export default async function GestionPage() {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) redirect('/login')

  const [{ data: tasks }, { data: users }] = await Promise.all([
    supabase.from('tasks').select('area, estado').not('estado', 'in', '("Completada","Rechazada")'),
    supabase.from('users').select('id, nombre, email, is_admin, macro_area'),
  ])

  const userProfile = users?.find(u => u.email === user.email)
  const userName = userProfile?.nombre ?? user.nombre
  const isAdmin = userProfile?.is_admin === true
  const userMacroArea: string | null = userProfile?.macro_area ?? null

  // Todos los usuarios ven el Hub con las 3 áreas — visibilidad total de cargas de trabajo.
  // userMacroArea solo se usa para destacar "tu área asignada" (ver GestionHubClient).

  const taskCounts: Record<string, number> = {}
  for (const [key, macro] of Object.entries(MACRO_AREAS)) {
    taskCounts[key] = (tasks ?? []).filter(t =>
      (macro.areas as readonly string[]).includes(t.area)
    ).length
  }

  return <GestionHubClient userName={userName} taskCounts={taskCounts} userMacroArea={userMacroArea} />
}
