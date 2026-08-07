import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { getServerUser } from '@/lib/auth'
import {
  VENDEDORES_COMISIONABLES, calcularResumen,
  type ClienteComision, type ProductoComision, type CarteraComision, type PorEntregarComision,
} from '@/lib/comisiones'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ventas/comision?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Remuneración variable del Gerente Comercial en el período (cláusula NOVENA
 * del contrato). Devuelve el resumen + el detalle por cliente y por producto.
 *
 * Es información de remuneración personal: sólo la ve quien tenga el permiso
 * `users.ve_comision_gerente`, no los admins en general. Un admin cualquiera
 * NO debe poder mirar cuánto gana otra persona.
 */
export async function GET(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.veComisionGerente) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''
  const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!esFecha(desde) || !esFecha(hasta))
    return NextResponse.json({ error: 'desde/hasta deben ser YYYY-MM-DD' }, { status: 400 })
  if (desde > hasta)
    return NextResponse.json({ error: 'desde no puede ser posterior a hasta' }, { status: 400 })

  /**
   * Cliente service-role, NO el de sesión, a propósito.
   *
   * El cálculo cruza `ventas`, `deudores`, `clientes` y `visitas_terreno`, y
   * las dos últimas tienen RLS que recorta filas por región o por dueño
   * (visitas_select_own: cada vendedor ve sólo sus visitas). Con el cliente
   * de sesión el resultado saldría COMPLETO sólo porque quien lo pide es
   * admin — si mañana se le quita ese flag, la comisión bajaría en silencio,
   * sin error, mostrando menos plata de la real.
   *
   * El control de acceso ya se hizo arriba con `ve_comision_gerente`: es un
   * único lugar, explícito, en vez de depender de un efecto colateral de las
   * políticas RLS.
   */
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_KEY' }, { status: 500 })
  const supabase = createSbClient(SUPABASE_URL, serviceKey)
  const p_vendedores = [...VENDEDORES_COMISIONABLES]

  const [rClientes, rProductos, rCartera, rPorEntregar] = await Promise.all([
    supabase.rpc('comision_gerente_por_cliente',    { p_ini: desde, p_fin: hasta, p_vendedores }),
    supabase.rpc('comision_gerente_por_producto',   { p_ini: desde, p_fin: hasta, p_vendedores }),
    supabase.rpc('comision_gerente_cartera',        { p_ini: desde, p_fin: hasta, p_vendedores }),
    supabase.rpc('comision_gerente_por_entregar',   { p_ini: desde, p_fin: hasta, p_vendedores }),
  ])

  const err = rClientes.error ?? rProductos.error ?? rCartera.error ?? rPorEntregar.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const clientes: ClienteComision[] = ((rClientes.data ?? []) as Record<string, unknown>[]).map(r => ({
    cliente: String(r.cliente ?? ''),
    vendedor: String(r.vendedor ?? ''),
    ventaNeta: Number(r.venta_neta ?? 0),
    litros: Number(r.litros ?? 0),
    pedidos: Number(r.pedidos ?? 0),
    deudaVencida: Number(r.deuda_vencida ?? 0),
    saldoTotal: Number(r.saldo_total ?? 0),
    comisiona: r.comisiona === true,
  }))

  const productos: ProductoComision[] = ((rProductos.data ?? []) as Record<string, unknown>[]).map(r => ({
    producto: String(r.producto ?? ''),
    envase: String(r.envase ?? ''),
    categoria: String(r.categoria ?? ''),
    ventaNeta: Number(r.venta_neta ?? 0),
    litros: Number(r.litros ?? 0),
    clientes: Number(r.clientes ?? 0),
  }))

  const filaCartera = ((rCartera.data ?? []) as Record<string, unknown>[])[0] ?? {}
  const cartera: CarteraComision = {
    clientesConVenta: Number(filaCartera.clientes_con_venta ?? 0),
    clientesAlDia: Number(filaCartera.clientes_al_dia ?? 0),
    clientesCartera: Number(filaCartera.clientes_cartera ?? 0),
    clientesActivos: Number(filaCartera.clientes_activos ?? 0),
    interacciones: Number(filaCartera.interacciones ?? 0),
  }

  // Sólo informativo — "lo que podrías tener" cuando se despache. La
  // comisión NUNCA se calcula sobre esto (pedido explícito de Claudio: la
  // base siempre es lo entregado, ver comisiona_gerente_por_entregar.sql).
  const filaPorEntregar = ((rPorEntregar.data ?? []) as Record<string, unknown>[])[0] ?? {}
  const porEntregar: PorEntregarComision = {
    ventaNeta: Number(filaPorEntregar.venta_neta ?? 0),
    litros: Number(filaPorEntregar.litros ?? 0),
    pedidos: Number(filaPorEntregar.pedidos ?? 0),
  }

  return NextResponse.json({
    resumen: calcularResumen(clientes, cartera),
    clientes,
    productos,
    cartera,
    porEntregar,
  })
}
