import { createClient } from '@/lib/supabase/server'
import DeudoresClient from './DeudoresClient'

export default async function DeudoresPage() {
  const supabase = await createClient()

  const { data: deudores } = await supabase
    .from('deudores')
    .select('*')
    .order('deuda_vencida', { ascending: false })

  return <DeudoresClient initialDeudores={deudores ?? []} />
}
