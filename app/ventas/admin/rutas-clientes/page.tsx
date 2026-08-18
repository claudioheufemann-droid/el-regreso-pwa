import { createClient } from '@/lib/supabase/server'
import RutasClientesClient from './RutasClientesClient'

export default async function RutasClientesPage() {
  const supabase = await createClient()

  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre_fantasia, vendedor, localidad, localidad_entrega, ruta_despacho, telefono')
    .order('nombre_fantasia')

  return <RutasClientesClient clientes={clientes ?? []} />
}
