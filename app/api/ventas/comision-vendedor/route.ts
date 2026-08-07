import { NextResponse } from 'next/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { SUPABASE_URL } from '@/lib/supabase/config'
import { getServerUser } from '@/lib/auth'
import {
  VENDEDORES_CONTRATO_TERCERA, calcularResumenVendedor,
  type CanalVenta, type EventoApertura, type CarteraVendedor, type PorEntregarVendedor,
} from '@/lib/comisionesVendedor'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ventas/comision-vendedor?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Remuneración variable de un vendedor bajo la cláusula TERCERA de su
 * contrato (Yadro Fabijancic, Marcelo Diaz). Devuelve el resumen + el
 * detalle de aperturas/recompras del período.
 *
 * A propósito NO recibe el vendedor por parámetro: se deriva siempre de
 * `vendedoresErp` de la sesión. Así un vendedor no puede pedir la
 * comisión de otro cambiando la URL — ni con el nombre exacto, porque
 * el endpoint nunca confía en un nombre que venga del cliente.
 */
export async function GET(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const contratoTercera = (VENDEDORES_CONTRATO_TERCERA as readonly string[])
  const esVendedorContratoTercera = user.vendedoresErp.some(v => contratoTercera.includes(v))
  if (!esVendedorContratoTercera) return NextResponse.json({ error: 'Sin acceso' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const desde = searchParams.get('desde') ?? ''
  const hasta = searchParams.get('hasta') ?? ''
  const esFecha = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s)
  if (!esFecha(desde) || !esFecha(hasta))
    return NextResponse.json({ error: 'desde/hasta deben ser YYYY-MM-DD' }, { status: 400 })
  if (desde > hasta)
    return NextResponse.json({ error: 'desde no puede ser posterior a hasta' }, { status: 400 })

  // Cliente service-role, mismo motivo que /api/ventas/comision: el cálculo
  // cruza tablas con RLS por dueño/región y el control de acceso ya se hizo
  // arriba, explícito, contra vendedoresErp.
  const serviceKey = process.env.SUPABASE_SERVICE_KEY
  if (!serviceKey) return NextResponse.json({ error: 'Falta SUPABASE_SERVICE_KEY' }, { status: 500 })
  const supabase = createSbClient(SUPABASE_URL, serviceKey)

  // Todas las variantes con que este vendedor aparece en el ERP (ej. Yadro
  // tiene "Yadro Fabijancic" y "Yadro Favijancic" por un typo histórico),
  // para no perder ventas registradas bajo la otra ortografía.
  const p_vendedores = user.vendedoresErp

  const [rCanal, rEventos, rCartera, rPorEntregar] = await Promise.all([
    supabase.rpc('comision_vendedor_por_canal', { p_ini: desde, p_fin: hasta, p_vendedores }),
    supabase.rpc('comision_vendedor_aperturas', { p_ini: desde, p_fin: hasta, p_vendedores }),
    supabase.rpc('comision_vendedor_cartera',   { p_ini: desde, p_fin: hasta, p_vendedores }),
    supabase.rpc('comision_gerente_por_entregar', { p_ini: desde, p_fin: hasta, p_vendedores }),
  ])

  const err = rCanal.error ?? rEventos.error ?? rCartera.error ?? rPorEntregar.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  const canales: CanalVenta[] = ((rCanal.data ?? []) as Record<string, unknown>[]).map(r => ({
    canal: r.canal === 'retail_distribuidor' ? 'retail_distribuidor' : 'horeca_tradicional',
    ventaNeta: Number(r.venta_neta ?? 0),
    litros: Number(r.litros ?? 0),
    pedidos: Number(r.pedidos ?? 0),
  }))

  const eventos: EventoApertura[] = ((rEventos.data ?? []) as Record<string, unknown>[]).map(r => ({
    tipo: r.tipo === 'recompra' ? 'recompra' : 'apertura',
    cliente: String(r.cliente ?? ''),
    fecha: String(r.fecha ?? ''),
    monto: Number(r.monto ?? 0),
  }))

  const filaCartera = ((rCartera.data ?? []) as Record<string, unknown>[])[0] ?? {}
  const cartera: CarteraVendedor = {
    clientesConVenta: Number(filaCartera.clientes_con_venta ?? 0),
    clientesAlDia: Number(filaCartera.clientes_al_dia ?? 0),
    clientesCartera: Number(filaCartera.clientes_cartera ?? 0),
    clientesActivos: Number(filaCartera.clientes_activos ?? 0),
    interacciones: Number(filaCartera.interacciones ?? 0),
  }

  const filaPorEntregar = ((rPorEntregar.data ?? []) as Record<string, unknown>[])[0] ?? {}
  const porEntregar: PorEntregarVendedor = {
    ventaNeta: Number(filaPorEntregar.venta_neta ?? 0),
    litros: Number(filaPorEntregar.litros ?? 0),
    pedidos: Number(filaPorEntregar.pedidos ?? 0),
  }

  return NextResponse.json({
    resumen: calcularResumenVendedor(canales, eventos, cartera),
    canales,
    cartera,
    porEntregar,
  })
}
