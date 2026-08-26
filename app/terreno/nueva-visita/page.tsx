import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NuevaVisitaClient from './NuevaVisitaClient'
import type { ClienteResumen } from './PasoCliente'

export const dynamic = 'force-dynamic'

/**
 * Antes esta página mandaba al navegador:
 *   · los ~600 clientes de la tabla maestra completos (nombre/categoría/
 *     localidad/dirección/lat/lng de TODOS, para que PasoCliente filtrara
 *     en memoria) — nunca se mostraban de golpe, pero viajaban igual;
 *   · el `producto` de CADA fila de `ventas` (toda la tabla, decenas de
 *     miles de filas) sólo para deducir los nombres de producto — resultó
 *     no usarse en absoluto: `NuevaVisitaClient` no desestructura
 *     `catalogoProductos` de sus props. El catálogo real con precios sale
 *     de `catalogoParaVendedor()` (lib/catalogo-productos.ts, estático);
 *   · la tabla `deudores` completa — tampoco se usa: `AvisoDeuda`
 *     (piezas.tsx) consulta `saldos_clientes` por cliente, bajo demanda,
 *     cuando se abre la venta.
 *
 * Ahora sólo se calculan las listas cortas que el vendedor realmente ve al
 * abrir la pantalla (máx. 5 cada una): sus visitas recientes, sus clientes
 * más frecuentes y los que tiene pendientes de visitar. "Cerca de mí" pide
 * el GPS en el navegador y se resuelve server-side vía
 * /api/clientes/cercanos. La búsqueda del resto de la cartera es en vivo
 * contra Supabase (ver PasoCliente), con límite y debounce — la base
 * completa nunca se manda de una.
 */

interface Props {
  searchParams: Promise<{ retomar?: string; cliente?: string }>
}

export default async function NuevaVisitaPage({ searchParams }: Props) {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { retomar, cliente: clientePre } = await searchParams

  // Si hay visita a retomar, cargarla — solo si es del vendedor actual (o admin).
  // Terreno es un módulo personal: nadie más debe poder ver/retomar una visita
  // en curso de otro vendedor, ni siquiera editando el id en la URL.
  let visitaRetomada = null
  if (retomar) {
    let query = supabase
      .from('visitas_terreno')
      .select('id, cliente_nombre, es_cliente_nuevo, lat, lng, direccion_gps, estado, foto_exterior, foto_interior, foto_exhibicion, foto_competencia')
      .eq('id', retomar)
      .eq('estado', 'en_progreso')
    if (!user.isAdmin) query = query.eq('vendedor_id', user.id)
    const { data } = await query.maybeSingle()
    visitaRetomada = data ?? null
  }

  const [recientes, frecuentes, pendientes] = await Promise.all([
    cargarRecientes(supabase, user.id, user.isAdmin),
    cargarPorScore(supabase, user.vendedoresErp, 'frecuentes'),
    cargarPorScore(supabase, user.vendedoresErp, 'pendientes'),
  ])

  return (
    <NuevaVisitaClient
      vendedor={user}
      recientes={recientes}
      frecuentes={frecuentes}
      pendientes={pendientes}
      visitaRetomada={visitaRetomada}
      clientePre={clientePre ?? null}
    />
  )
}

/** Últimos clientes distintos que este vendedor visitó (no canceladas). */
async function cargarRecientes(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vendedorId: string,
  isAdmin: boolean,
): Promise<ClienteResumen[]> {
  let query = supabase
    .from('visitas_terreno')
    .select('cliente_nombre, iniciada_at')
    .neq('estado', 'cancelada')
    .order('iniciada_at', { ascending: false })
    .limit(40) // suficiente para deducir 5 nombres distintos aunque se repitan

  if (!isAdmin) query = query.eq('vendedor_id', vendedorId)
  const { data } = await query

  const nombres: string[] = []
  const vistos = new Set<string>()
  for (const v of data ?? []) {
    const n = (v.cliente_nombre ?? '').trim()
    if (!n || vistos.has(n.toLowerCase())) continue
    vistos.add(n.toLowerCase())
    nombres.push(n)
    if (nombres.length >= 5) break
  }
  if (nombres.length === 0) return []

  const { data: clientesData } = await supabase
    .from('clientes')
    .select('nombre_fantasia, categoria, localidad, lat, lng')
    .in('nombre_fantasia', nombres)

  const porNombre = new Map((clientesData ?? []).map(c => [c.nombre_fantasia as string, c]))
  return nombres.map(n => {
    const c = porNombre.get(n)
    return {
      nombre: n,
      categoria: (c?.categoria as string | null) ?? null,
      localidad: (c?.localidad as string | null) ?? null,
      lat: c?.lat != null ? Number(c.lat) : null,
      lng: c?.lng != null ? Number(c.lng) : null,
    }
  })
}

/**
 * Frecuentes (más pedidos/mes) o pendientes (venció su ciclo de compra),
 * leyendo el caché de `client_scores` — ya trae ciclo, score y días sin
 * comprar calculados (ver supabase/migrations/client_metrics_cache_materializado.sql).
 * Se acota al vendedor cuando el login sabe a qué nombres del ERP corresponde;
 * si no (admin, o el mapeo no existe), muestra el top global.
 */
async function cargarPorScore(
  supabase: Awaited<ReturnType<typeof createClient>>,
  vendedoresErp: string[],
  tipo: 'frecuentes' | 'pendientes',
): Promise<ClienteResumen[]> {
  let query = supabase
    .from('client_scores')
    .select('nombre_fantasia, dias_sin_compra, alert_level, pedidos_por_mes, ultima_compra, revenue_total')

  if (vendedoresErp.length > 0) query = query.in('vendedor_actual', vendedoresErp)

  if (tipo === 'pendientes') {
    query = query.in('alert_level', ['critico', 'vencido']).order('dias_sin_compra', { ascending: false })
  } else {
    query = query.order('pedidos_por_mes', { ascending: false })
  }

  const { data: scores } = await query.limit(5)
  const filas = (scores ?? []) as {
    nombre_fantasia: string; dias_sin_compra: number | null; ultima_compra: string | null; revenue_total: number | null
  }[]
  if (filas.length === 0) return []

  const nombres = filas.map(f => f.nombre_fantasia)
  const { data: clientesData } = await supabase
    .from('clientes')
    .select('nombre_fantasia, categoria, localidad, lat, lng')
    .in('nombre_fantasia', nombres)
  const porNombre = new Map((clientesData ?? []).map(c => [c.nombre_fantasia as string, c]))

  return filas.map(f => {
    const c = porNombre.get(f.nombre_fantasia)
    return {
      nombre: f.nombre_fantasia,
      categoria: (c?.categoria as string | null) ?? null,
      localidad: (c?.localidad as string | null) ?? null,
      lat: c?.lat != null ? Number(c.lat) : null,
      lng: c?.lng != null ? Number(c.lng) : null,
      diasSinComprar: f.dias_sin_compra ?? null,
      ultimaCompra: f.ultima_compra ?? null,
    }
  })
}
