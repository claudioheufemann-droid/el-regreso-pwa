import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HistorialClient from './HistorialClient'

export const dynamic = 'force-dynamic'

export default async function HistorialPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Admin ve todas; vendedor solo las suyas
  let query = supabase
    .from('visitas_terreno')
    .select('id, cliente_nombre, tiene_venta, motivo_sin_venta, total_pedido, estado, iniciada_at, completada_at, vendedor_id, es_cliente_nuevo')
    .order('iniciada_at', { ascending: false })
    .limit(200)

  if (!user.isAdmin) {
    query = query.eq('vendedor_id', user.id)
  }

  const { data: visitas } = await query

  // Si admin: obtener nombres de vendedores para filtro
  let vendedores: { id: string; nombre: string }[] = []
  if (user.isAdmin) {
    const { data } = await supabase
      .from('users')
      .select('id, nombre')
      .order('nombre')
    vendedores = data ?? []
  }

  return (
    <HistorialClient
      user={user}
      visitas={visitas ?? []}
      vendedores={vendedores}
    />
  )
}
