import { createClient } from '@/lib/supabase/server'
import CargarClient from './CargarClient'

export default async function CargarPage() {
  const supabase = await createClient()

  const { data: periodos } = await supabase
    .from('periodos')
    .select('*')
    .order('fecha_inicio', { ascending: false })

  return <CargarClient periodos={periodos ?? []} />
}
