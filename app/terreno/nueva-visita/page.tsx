import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import NuevaVisitaClient from './NuevaVisitaClient'

export const dynamic = 'force-dynamic'

function normalizarNombre(nombre: string): string {
  if (/barril.*30l.*local/i.test(nombre))         return 'Barril 30 Litros (Local)'
  if (/barril.*30l.*central/i.test(nombre))        return 'Barril 30 Litros (Zona Central)'
  if (/barril.*30l/i.test(nombre))                 return 'Barril 30 Litros'
  return nombre.replace(/\s{2,}/g, ' ').trim()
}

function esProductoCatalogable(nombre: string): boolean {
  if (!nombre) return false
  const excluir = ['empaque y distribución', 'empaque y distribucion', 'distribución lata', 'distribucion lata']
  const n = nombre.toLowerCase()
  return !excluir.some(e => n.includes(e))
}

export default async function NuevaVisitaPage({
  searchParams,
}: {
  searchParams: Promise<{ retomar?: string; cliente?: string }>
}) {
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
      .select('id, cliente_nombre, es_cliente_nuevo, lat, lng, direccion_gps, estado, foto_exterior, foto_exhibicion, foto_competencia')
      .eq('id', retomar)
      .eq('estado', 'en_progreso')
    if (!user.isAdmin) query = query.eq('vendedor_id', user.id)
    const { data } = await query.maybeSingle()
    visitaRetomada = data ?? null
  }

  // Clientes desde tabla maestra (compartida entre módulos)
  const { data: clientesMaestros } = await supabase
    .from('clientes')
    .select('nombre_fantasia, categoria, localidad, direccion, lat, lng')
    .not('nombre_fantasia', 'is', null)
    .order('nombre_fantasia')

  const clientes = (clientesMaestros ?? []).map(c => ({
    nombre_fantasia: c.nombre_fantasia,
    categoria_negocio: c.categoria ?? null,
    localidad: c.localidad ?? null,
    direccion: c.direccion ?? null,
    lat: c.lat ?? null,
    lng: c.lng ?? null,
  }))

  // Productos del catálogo — filtrados y normalizados
  const { data: productosRaw } = await supabase
    .from('ventas')
    .select('producto, categoria_producto, envase')
    .not('producto', 'is', null)
    .order('producto')

  const seenProd = new Set<string>()
  const productos = (productosRaw ?? [])
    .filter(p => p.producto && esProductoCatalogable(p.producto))
    .map(p => ({ ...p, producto: normalizarNombre(p.producto) }))
    .filter(p => {
      if (seenProd.has(p.producto)) return false
      seenProd.add(p.producto)
      return true
    })

  // Deudores para mostrar estado de cuenta al seleccionar cliente
  const { data: deudoresRaw } = await supabase
    .from('deudores')
    .select('nombre_fantasia, saldo_total, deuda_vencida, ultimo_pago, fecha_ultima_compra, limite_cta_cte')

  const deudores = (deudoresRaw ?? []).map(d => ({
    nombre_fantasia: d.nombre_fantasia as string,
    saldo_total: Number(d.saldo_total ?? 0),
    deuda_vencida: Number(d.deuda_vencida ?? 0),
    ultimo_pago: d.ultimo_pago as string | null,
    fecha_ultima_compra: d.fecha_ultima_compra as string | null,
    limite_cta_cte: d.limite_cta_cte ? Number(d.limite_cta_cte) : null,
  }))

  return (
    <NuevaVisitaClient
      vendedor={user}
      clientesExistentes={clientes}
      catalogoProductos={productos}
      visitaRetomada={visitaRetomada}
      deudores={deudores}
      clientePre={clientePre ?? null}
    />
  )
}
