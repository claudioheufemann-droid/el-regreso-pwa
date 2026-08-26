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
  const [{ data: tasks }, { data: deudas }] = await Promise.all([
    supabase
      .from('tasks')
      .select('*, responsable:users(id, nombre, iniciales, rol, area, email, avatar_url), responsable_ids')
      .in('area', ADMIN_AREAS)
      .order('created_at', { ascending: false }),
    // Antes Administración mostraba exactamente la misma pantalla de tareas
    // que Comercial y Producción, sin nada propio de Contabilidad/Finanzas.
    supabase.from('deudores').select('deuda_vencida').gt('deuda_vencida', 0),
  ])

  const deudaVencida = (deudas ?? []).reduce((s, d) => s + (d.deuda_vencida ?? 0), 0)
  const deudaFmt = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(deudaVencida)

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
        areaStat={{ label: 'Deuda vencida', value: deudaFmt, href: '/ventas/admin/deudores' }}
      />
    </div>
  )
}
