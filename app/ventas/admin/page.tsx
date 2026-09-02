import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { VENDEDORES } from '@/lib/types'
import { Suspense } from 'react'
import AdminHubClient from './AdminHubClient'

export default async function AdminHubPage() {
  const supabase = await createClient()

  const [{ data: periodos }, { data: metas }, { data: deudores }, { data: huerfanosRaw }] = await Promise.all([
    supabase.from('periodos').select('*').order('fecha_inicio', { ascending: false }),
    supabase.from('metas').select('*').order('vendedor').order('tipo').order('categoria_negocio'),
    supabase.from('deudores').select('*').order('deuda_vencida', { ascending: false }),
    // Service-role a propósito (lib/supabase/admin.ts): RPC de solo-lectura,
    // alerta temprana de clientes que no calzan entre tablas — ver migración
    // rpc_huerfanos_nombre_fantasia.
    createAdminClient().rpc('contar_huerfanos_nombre_fantasia'),
  ])

  return (
    <Suspense>
      <AdminHubClient
        periodos={periodos ?? []}
        metas={metas ?? []}
        vendedores={VENDEDORES as unknown as string[]}
        deudores={deudores ?? []}
        huerfanos={(huerfanosRaw ?? []) as { tabla: string; huerfanos: number }[]}
      />
    </Suspense>
  )
}
