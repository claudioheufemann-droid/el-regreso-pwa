import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import AdminShell from './AdminShell'

export const dynamic = 'force-dynamic'

export default async function TerrenoAdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // Mariel (paga fondos, revisa rendición) y Claudio (aprueba planificación) necesitan
  // entrar a /terreno/admin/planificacion sin ser admin del resto del panel — el gate se
  // amplía acá y AdminShell recorta el menú a "Planificación" para quien no es admin.
  const puedeEntrar = user.isAdmin || user.puedeAprobarPlanificacionTerreno || user.puedePagarPlanificacionTerreno
  if (!puedeEntrar) redirect('/terreno')

  const supabase = await createClient()
  const { count } = user.isAdmin
    ? (await supabase
        .from('visitas_terreno')
        .select('id', { count: 'exact', head: true })
        .eq('estado_presencia', 'pendiente_revision'))
    : { count: 0 }

  return (
    <AdminShell
      nombre={user.nombre}
      email={user.email}
      avatarUrl={user.avatarUrl}
      pendientesRevision={count ?? 0}
      isAdmin={user.isAdmin}
      puedeAprobarPlanificacion={user.puedeAprobarPlanificacionTerreno}
      puedePagarPlanificacion={user.puedePagarPlanificacionTerreno}
    >
      {children}
    </AdminShell>
  )
}
