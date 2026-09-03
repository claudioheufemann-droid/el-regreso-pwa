import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import {
  periodoActual, periodoPorAncla, comparacionAnioAnterior, comparacionPeriodoAnterior,
} from '@/lib/control-comercial/periodos'
import { VENDEDORES_INCOBRABLES } from '@/lib/types'
import type { FilaVentaAgregada, KpiEjecutivo, ResumenEjecutivoRaw, ResumenEjecutivoResponse } from '@/lib/control-comercial/tipos'

export const dynamic = 'force-dynamic'

const CLP0 = (n: number) => Math.round(n)

export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const anio = Number(searchParams.get('anio')) || undefined
  const mes = Number(searchParams.get('mes')) || undefined
  const comparar = searchParams.get('comparar') === 'anterior' ? 'anterior' : 'anio_anterior'

  const periodo = anio && mes ? periodoPorAncla(anio, mes) : periodoActual()
  const comparacion = comparar === 'anterior' ? comparacionPeriodoAnterior(periodo) : comparacionAnioAnterior(periodo)

  const supabase = await createClient()

  const [actualRes, comparadoRes, territorioRes, deudaRes, barrilesRes, periodoRowRes] = await Promise.all([
    supabase.rpc('fn_resumen_ejecutivo', { p_inicio: comparacion.actual.inicio, p_fin: comparacion.actual.fin }),
    supabase.rpc('fn_resumen_ejecutivo', { p_inicio: comparacion.comparado.inicio, p_fin: comparacion.comparado.fin }),
    supabase.rpc('fn_ventas_agregadas', { p_inicio: periodo.inicio, p_fin: comparacion.actual.fin }),
    supabase.from('deudores').select('deuda_vencida, vendedor'),
    supabase.from('barriles_clientes').select('fecha_entrega'),
    supabase.from('periodos').select('id').eq('fecha_inicio', periodo.inicio).eq('fecha_fin', periodo.fin).maybeSingle(),
  ])

  if (actualRes.error) return NextResponse.json({ error: actualRes.error.message }, { status: 500 })
  if (comparadoRes.error) return NextResponse.json({ error: comparadoRes.error.message }, { status: 500 })

  const actual = (actualRes.data?.[0] ?? null) as ResumenEjecutivoRaw | null
  const comparado = (comparadoRes.data?.[0] ?? null) as ResumenEjecutivoRaw | null
  const ventasPorTerritorio = (territorioRes.data ?? []) as FilaVentaAgregada[]

  // Deuda vencida: total actual (snapshot ERP, no hay histórico previo para comparar todavía).
  // deudores tiene RLS por región (admin ve todo) — si la sesión no es un usuario autenticado real
  // (ej. LOGIN_DESACTIVADO_TEMPORAL), esto vuelve vacío en silencio, no como error. Se distingue acá.
  const deudaVencida = (deudaRes.data ?? [])
    .filter(d => !VENDEDORES_INCOBRABLES.includes(d.vendedor ?? ''))
    .reduce((acc, d) => acc + Number(d.deuda_vencida ?? 0), 0)
  const deudaDisponible = !deudaRes.error && (deudaRes.data?.length ?? 0) > 0

  // Barriles críticos: +90 días fuera (política inicial del spec §26). Snapshot actual del ERP.
  const AHORA = Date.now()
  const barrilesCriticos = (barrilesRes.data ?? []).filter(b => {
    if (!b.fecha_entrega) return false
    const dias = (AHORA - new Date(b.fecha_entrega).getTime()) / 86_400_000
    return dias > 90
  }).length
  const barrilesDisponible = !barrilesRes.error && (barrilesRes.data?.length ?? 0) > 0

  // Meta compañía $ del período (si está configurada).
  let metaVentasClp: number | null = null
  if (periodoRowRes.data?.id) {
    const { data: metaRow } = await supabase
      .from('metas_comerciales')
      .select('valor_meta')
      .eq('periodo_id', periodoRowRes.data.id)
      .eq('scope_type', 'compania')
      .eq('kpi_type', 'ventas_clp')
      .maybeSingle()
    metaVentasClp = metaRow?.valor_meta ?? null
  }

  function variacion(a: number, c: number): number | null {
    if (!c) return a > 0 ? null : 0
    return ((a - c) / Math.abs(c)) * 100
  }

  const kpis: KpiEjecutivo[] = []

  if (actual && comparado) {
    kpis.push({
      id: 'venta_ytd', titulo: 'Venta del período', valor: CLP0(actual.monto_total), formato: 'clp',
      comparado: CLP0(comparado.monto_total), variacionPct: variacion(actual.monto_total, comparado.monto_total),
      tooltip: `Suma de ventas con pedido ENTREGADO en el período (regla de reconocimiento del spec). Comparado vs ${comparar === 'anterior' ? 'período anterior' : 'mismo período año anterior'}, mismos ${comparacion.dias} días.`,
      drillHref: '/control-comercial/ventas',
    })
    kpis.push({
      id: 'crecimiento_yoy', titulo: 'Crecimiento YoY', valor: variacion(actual.monto_total, comparado.monto_total) ?? 0, formato: 'porcentaje',
      comparado: null, variacionPct: variacion(actual.monto_total, comparado.monto_total),
      tooltip: 'Variación % de venta $ vs el mismo período del año anterior (mismos días si el período está en curso).',
      drillHref: '/control-comercial/ventas',
    })
    kpis.push({
      id: 'cumplimiento_meta', titulo: 'Cumplimiento de meta', valor: metaVentasClp ? (actual.monto_total / metaVentasClp) * 100 : 0, formato: 'porcentaje',
      comparado: metaVentasClp, variacionPct: null,
      tooltip: metaVentasClp ? 'Venta $ del período / meta compañía configurada para este período.' : 'Todavía no hay una meta compañía ($ ventas) configurada para este período.',
      estado: metaVentasClp ? 'ok' : 'sin_meta',
      drillHref: '/control-comercial/metas',
    })
    kpis.push({
      id: 'clientes_activos', titulo: 'Clientes activos', valor: actual.clientes_activos, formato: 'numero',
      comparado: comparado.clientes_activos, variacionPct: variacion(actual.clientes_activos, comparado.clientes_activos),
      tooltip: 'Clientes distintos con al menos una venta reconocida (entregada) en el período.',
      drillHref: '/ventas/clientes',
    })
    kpis.push({
      id: 'crecimiento_neto_clientes', titulo: 'Crecimiento neto de clientes', valor: actual.clientes_nuevos - actual.clientes_perdidos, formato: 'numero',
      comparado: comparado.clientes_nuevos - comparado.clientes_perdidos, variacionPct: null,
      tooltip: `Nuevos (${actual.clientes_nuevos}, primera compra en el período) − Perdidos (${actual.clientes_perdidos}, cruzaron 90+ días sin comprar durante el período).`,
      drillHref: '/control-comercial/clientes',
    })
  }

  kpis.push({
    id: 'deuda_vencida', titulo: 'Deuda vencida', valor: CLP0(deudaVencida), formato: 'clp',
    comparado: null, variacionPct: null,
    tooltip: deudaDisponible
      ? 'Total de deuda vencida al día de hoy (foto del ERP). Todavía no hay histórico de snapshots para comparar contra el período anterior.'
      : 'No se pudo leer la cartera de deudores con esta sesión (permiso/RLS). Verifica que la sesión tenga rol autenticado real.',
    estado: deudaDisponible ? 'sin_comparacion' : 'no_disponible',
    drillHref: '/ventas/deudores',
  })
  kpis.push({
    id: 'cobranza_recuperada', titulo: 'Cobranza recuperada', valor: 0, formato: 'clp',
    comparado: null, variacionPct: null,
    tooltip: 'Aún no disponible: el ERP no registra montos de pago por cliente/fecha, solo el saldo vencido actual y la fecha del último pago. Hace falta esa fuente para calcular este KPI con confianza.',
    estado: 'no_disponible',
    drillHref: null,
  })
  kpis.push({
    id: 'barriles_criticos', titulo: 'Barriles críticos', valor: barrilesCriticos, formato: 'numero',
    comparado: null, variacionPct: null,
    tooltip: barrilesDisponible
      ? 'Barriles con más de 90 días fuera (política inicial 🔴). Foto actual del ERP — no hay histórico de recuperación previo a esta fecha.'
      : 'No se pudo leer el detalle de barriles con esta sesión (permiso/RLS). Verifica que la sesión tenga rol autenticado real.',
    estado: barrilesDisponible ? 'sin_comparacion' : 'no_disponible',
    drillHref: '/ventas/barriles',
  })

  const body: ResumenEjecutivoResponse = {
    periodo: { nombre: periodo.nombre, inicio: periodo.inicio, fin: comparacion.actual.fin, truncado: comparacion.truncado },
    kpis,
    ventasPorTerritorio,
  }

  return NextResponse.json(body)
}
