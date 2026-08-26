import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import RutaClient from './RutaClient'

export const dynamic = 'force-dynamic'

/**
 * Antes esta página traía TODOS los clientes con coordenadas (~600) y los
 * serializaba enteros dentro del HTML en cada carga — el cliente ya los
 * recortaba a 60 al dibujar, pero el peso viajaba completo por la red
 * primero. Es justo el peor lugar para eso: /terreno/ruta la abre un
 * vendedor en movimiento, a veces con mala señal.
 *
 * Ahora el servidor manda sólo la primera página (60 — el mismo tope que
 * ya aplicaba el filtro del cliente) más el total real vía COUNT, que no
 * trae filas. Buscar más allá de esa página se resuelve en el navegador
 * contra Supabase directo, con debounce — mismo patrón que ya usa
 * BuscarClienteSheet.
 */
const CLIENTES_PAGINA = 60
/** Tope de "Recomendados para hoy" — nunca una lista larga, es una sugerencia. */
const RECOMENDADOS_MAX = 10

export default async function RutaPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  const [{ data: clientesRaw }, { count }, recomendados] = await Promise.all([
    supabase
      .from('clientes')
      .select('nombre_fantasia, categoria, localidad, direccion, telefono, lat, lng')
      .not('nombre_fantasia', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null)
      .order('nombre_fantasia')
      .limit(CLIENTES_PAGINA),
    supabase
      .from('clientes')
      .select('nombre_fantasia', { count: 'exact', head: true })
      .not('nombre_fantasia', 'is', null)
      .not('lat', 'is', null)
      .not('lng', 'is', null),
    cargarRecomendados(supabase, user.vendedoresErp),
  ])

  const clientesIniciales = (clientesRaw ?? [])
    .filter(c => c.lat != null && c.lng != null)
    .map(c => ({
      nombre: c.nombre_fantasia as string,
      categoria: c.categoria as string | null,
      localidad: c.localidad as string | null,
      direccion: c.direccion as string | null,
      telefono: c.telefono as string | null,
      lat: Number(c.lat),
      lng: Number(c.lng),
    }))

  return (
    <RutaClient
      clientesIniciales={clientesIniciales}
      totalConUbicacion={count ?? clientesIniciales.length}
      recomendados={recomendados}
    />
  )
}

/**
 * "Recomendados para hoy" — sin IA, por reglas: clientes con el ciclo de
 * compra vencido (client_scores.alert_level 'critico'/'vencido'), priorizando
 * al que lleva más días sin comprar y, dentro de eso, al de mayor venta
 * histórica (para no mandar al vendedor a golpear una puerta de bajo valor
 * cuando hay dos igual de atrasadas). Reutiliza el mismo caché que ya usa
 * Nueva Visita — nada nuevo que calcular.
 */
export interface ClienteRecomendado {
  nombre: string
  categoria: string | null
  localidad: string | null
  direccion: string | null
  telefono: string | null
  lat: number
  lng: number
  diasSinComprar: number | null
  ultimaCompra: string | null
}

async function cargarRecomendados(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vendedoresErp: string[],
): Promise<ClienteRecomendado[]> {
  let query = supabase
    .from('client_scores')
    .select('nombre_fantasia, dias_sin_compra, ultima_compra, revenue_total')
    .in('alert_level', ['critico', 'vencido'])

  if (vendedoresErp.length > 0) query = query.in('vendedor_actual', vendedoresErp)

  const { data: scores } = await query
    .order('dias_sin_compra', { ascending: false })
    .order('revenue_total', { ascending: false })
    .limit(RECOMENDADOS_MAX)

  const filas = (scores ?? []) as { nombre_fantasia: string; dias_sin_compra: number | null; ultima_compra: string | null }[]
  if (filas.length === 0) return []

  const nombres = filas.map(f => f.nombre_fantasia)
  const { data: clientesData } = await supabase
    .from('clientes')
    .select('nombre_fantasia, categoria, localidad, direccion, telefono, lat, lng')
    .in('nombre_fantasia', nombres)
    .not('lat', 'is', null)
    .not('lng', 'is', null)

  const porNombre = new Map((clientesData ?? []).map(c => [c.nombre_fantasia as string, c]))

  // Sólo entran los que además tienen coordenadas — sin eso no se pueden
  // agregar a una ruta (mismo criterio que el resto de la pantalla).
  return filas
    .map(f => {
      const c = porNombre.get(f.nombre_fantasia)
      if (!c || c.lat == null || c.lng == null) return null
      return {
        nombre: f.nombre_fantasia,
        categoria: c.categoria as string | null,
        localidad: c.localidad as string | null,
        direccion: c.direccion as string | null,
        telefono: c.telefono as string | null,
        lat: Number(c.lat),
        lng: Number(c.lng),
        diasSinComprar: f.dias_sin_compra,
        ultimaCompra: f.ultima_compra,
      }
    })
    .filter((c): c is ClienteRecomendado => c !== null)
}
