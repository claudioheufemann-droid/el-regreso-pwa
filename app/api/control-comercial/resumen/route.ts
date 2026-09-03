import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import {
  periodoActual, periodoPorAncla, comparacionAnioAnterior, comparacionPeriodoAnterior,
} from '@/lib/control-comercial/periodos'
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

  const [actualRes, comparadoRes, territorioRes, cobranzaRes, barrilesRes, periodoRowRes] = await Promise.all([
    supabase.rpc('fn_resumen_ejecutivo', { p_inicio: comparacion.actual.inicio, p_fin: comparacion.actual.fin }),
    supabase.rpc('fn_resumen_ejecutivo', { p_inicio: comparacion.comparado.inicio, p_fin: comparacion.comparado.fin }),
    supabase.rpc('fn_ventas_agregadas', { p_inicio: periodo.inicio, p_fin: comparacion.actual.fin }),
    supabase.rpc('fn_cobranza_kpis', { p_inicio: periodo.inicio, p_fin: comparacion.actual.fin }),
    supabase.rpc('fn_barriles_estado'),
    supabase.from('periodos').select('id').eq('fecha_inicio', periodo.inicio).eq('fecha_fin', periodo.fin).maybeSingle(),
  ])

  if (actualRes.error) return NextResponse.json({ error: actualRes.error.message }, { status: 500 })
  if (comparadoRes.error) return NextResponse.json({ error: comparadoRes.error.message }, { status: 500 })

  const actual = (actualRes.data?.[0] ?? null) as ResumenEjecutivoRaw | null
  const comparado = (comparadoRes.data?.[0] ?? null) as ResumenEjecutivoRaw | null
  const ventasPorTerritorio = (territorioRes.data ?? []) as FilaVentaAgregada[]

  // deudores/barriles tienen RLS — si la sesión no es un usuario autenticado real (ej.
  // LOGIN_DESACTIVADO_TEMPORAL), la RPC vuelve con 0 filas en silencio, no como error.
  const cobranza = (cobranzaRes.data?.[0] ?? null) as {
    deuda_vencida_actual: number; monto_recuperado: number; cuentas_regularizadas: number; hay_snapshot_inicio: boolean
  } | null
  const deudaDisponible = !cobranzaRes.error && cobranza !== null

  const barriles = (barrilesRes.data?.[0] ?? null) as { total: number; criticos: number } | null
  const barrilesDisponible = !barrilesRes.error && barriles !== null && barriles.total > 0

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
    id: 'deuda_vencida', titulo: 'Deuda vencida', valor: CLP0(cobranza?.deuda_vencida_actual ?? 0), formato: 'clp',
    comparado: null, variacionPct: null,
    tooltip: deudaDisponible
      ? 'Total de deuda vencida al día de hoy (foto del ERP), excluyendo cuentas internas e incobrables.'
      : 'No se pudo leer la cartera de deudores con esta sesión (permiso/RLS). Verifica que la sesión tenga rol autenticado real.',
    estado: deudaDisponible ? 'sin_comparacion' : 'no_disponible',
    drillHref: '/control-comercial/cobranza',
  })
  kpis.push({
    id: 'cobranza_recuperada', titulo: 'Cobranza recuperada', valor: CLP0(cobranza?.monto_recuperado ?? 0), formato: 'clp',
    comparado: null, variacionPct: null,
    tooltip: deudaDisponible && cobranza?.hay_snapshot_inicio
      ? 'Caída de deuda vencida por cliente entre el inicio y el fin del período (fotos diarias de deudores_historial), piso en 0 por cliente.'
      : 'Sin foto de deudores al inicio de este período todavía — el histórico se empezó a capturar recién, se irá completando período a período.',
    estado: deudaDisponible && cobranza?.hay_snapshot_inicio ? 'sin_comparacion' : 'no_disponible',
    drillHref: '/control-comercial/cobranza',
  })
  kpis.push({
    id: 'barriles_criticos', titulo: 'Barriles críticos', valor: barriles?.criticos ?? 0, formato: 'numero',
    comparado: null, variacionPct: null,
    tooltip: barrilesDisponible
      ? 'Barriles con más de 90 días fuera (política inicial 🔴). Foto actual del ERP.'
      : 'No se pudo leer el detalle de barriles con esta sesión (permiso/RLS). Verifica que la sesión tenga rol autenticado real.',
    estado: barrilesDisponible ? 'sin_comparacion' : 'no_disponible',
    drillHref: '/control-comercial/barriles',
  })

  const body: ResumenEjecutivoResponse = {
    periodo: { nombre: periodo.nombre, inicio: periodo.inicio, fin: comparacion.actual.fin, truncado: comparacion.truncado },
    kpis,
    ventasPorTerritorio,
  }

  return NextResponse.json(body)
}
