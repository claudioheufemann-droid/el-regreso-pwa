import { createClient } from '@/lib/supabase/server'
import { VENDEDORES } from '@/lib/types'
import { Suspense } from 'react'
import AdminHubClient from './AdminHubClient'

export default async function AdminHubPage() {
  const supabase = await createClient()

  const [{ data: periodos }, { data: metas }, { data: deudores }] = await Promise.all([
    supabase.from('periodos').select('*').order('fecha_inicio', { ascending: false }),
    supabase.from('metas').select('*').order('vendedor').order('tipo').order('categoria_negocio'),
    supabase.from('deudores').select('*').order('deuda_vencida', { ascending: false }),
  ])

  return (
    <Suspense>
      <AdminHubClient
        periodos={periodos ?? []}
        metas={metas ?? []}
        vendedores={VENDEDORES as unknown as string[]}
        deudores={deudores ?? []}
      />
    </Suspense>
  )
}
