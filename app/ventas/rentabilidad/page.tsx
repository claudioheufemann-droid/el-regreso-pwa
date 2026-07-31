import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import type { CostoPrecio } from '@/lib/rentabilidad'
import RentabilidadClient from './RentabilidadClient'

export const dynamic = 'force-dynamic'

export default async function RentabilidadPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // No es un caso de "no tiene el módulo en su menú" — es información de
  // costos/márgenes internos. Si no tiene el permiso, ni siquiera debe saber
  // que esta ruta existe, así que se manda directo al Hub.
  if (!user.puedeVerMargenes) redirect('/ventas')

  const supabase = await createClient()
  const { data } = await supabase
    .from('costos_precios')
    .select('id, producto, codigo, categoria, zona, formato, costo_neto, precio_neto, aplica_ila')
    .order('categoria')
    .order('producto')

  const filas = (data ?? []) as CostoPrecio[]

  return <RentabilidadClient user={user} filasIniciales={filas} />
}
