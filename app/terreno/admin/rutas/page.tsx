import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hoySantiagoISO } from '@/lib/terreno/tiempoChile'

export const dynamic = 'force-dynamic'

/** /terreno/admin/rutas sin vendedor puntual — manda al primero de la lista (mismo orden que Resumen). */
export default async function RutasAdminPage({ searchParams }: { searchParams: Promise<{ tipo?: string; fecha?: string }> }) {
  const sp = await searchParams
  const supabase = await createClient()
  const { data: vendedores } = await supabase.from('users').select('id').ilike('rol', '%vendedor%').order('nombre').limit(1)

  const fecha = sp.fecha ?? hoySantiagoISO()
  const tipo = sp.tipo ?? 'dia'
  if (!vendedores || vendedores.length === 0) redirect('/terreno/admin')
  redirect(`/terreno/admin/rutas/${vendedores[0].id}?tipo=${tipo}&fecha=${fecha}`)
}
