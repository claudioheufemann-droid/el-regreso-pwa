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

  // costo_neto/precio_neto son `numeric` en Postgres — PostgREST los manda
  // como string en el JSON para no perder precisión (ej. "1690.611729").
  // Sin este Number(), cualquier suma con `+` en el cliente (ej. precio +
  // iva) concatena texto en vez de sumar. Se convierten acá, una sola vez,
  // para que el resto de la app trabaje con number de verdad.
  const filas: CostoPrecio[] = (data ?? []).map(f => ({
    ...f,
    costo_neto: Number(f.costo_neto),
    precio_neto: Number(f.precio_neto),
  }))

  return <RentabilidadClient user={user} filasIniciales={filas} />
}
