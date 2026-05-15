import { createClient } from '@/lib/supabase/server'
import { VENDEDORES } from '@/lib/types'
import MetasAdminClient from './MetasAdminClient'

export default async function MetasAdminPage() {
  const supabase = await createClient()

  const { data: periodos } = await supabase
    .from('periodos')
    .select('*')
    .order('fecha_inicio', { ascending: false })

  const { data: metas } = await supabase
    .from('metas')
    .select('*')
    .order('vendedor')
    .order('tipo')
    .order('categoria_negocio')

  return (
    <MetasAdminClient
      periodos={periodos ?? []}
      metas={metas ?? []}
      vendedores={VENDEDORES as unknown as string[]}
    />
  )
}
