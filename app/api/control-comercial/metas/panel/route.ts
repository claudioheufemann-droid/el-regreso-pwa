import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import { periodoActual, periodoPorAncla, comparacionAnioAnterior } from '@/lib/control-comercial/periodos'
import type { KpiMeta } from '@/lib/control-comercial/tipos'

export const dynamic = 'force-dynamic'

interface FilaEquipo {
  territorio: string; venta_clp: number; litros: number
  clientes_activos: number; clientes_nuevos: number; clientes_perdidos: number
  deuda_vencida: number; barriles_criticos: number; barriles_total: number
}
interface FilaSerie { mes: number; monto_total: number; litros_total: number }
interface FilaSerieCli { mes: number; clientes_nuevos: number }
interface MetaRow { id: number; scope_type: string; scope_value: string | null; kpi_type: KpiMeta; valor_meta: number }

/**
 * Datos de la pantalla Metas: meta compañía con avance real, metas por
 * responsable cruzadas contra su venta real, y plan anual acumulado.
 *
 * Vive aparte de /api/control-comercial/metas (que es el CRUD) porque esto es
 * una vista compuesta de solo lectura y no debe complicar el guardado.
 */
export async function GET(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const anioParam = Number(searchParams.get('anio')) || undefined
  const mesParam = Number(searchParams.get('mes')) || undefined
  const periodo = anioParam && mesParam ? periodoPorAncla(anioParam, mesParam) : periodoActual()
  const comparacion = comparacionAnioAnterior(periodo)

  const supabase = await createClient()

  const [periodoRowRes, equipoRes, equipoCompRes, resumenRes, territoriosRes, serieRes, serieCliRes, periodosAnioRes] = await Promise.all([
    supabase.from('periodos').select('id').eq('fecha_inicio', periodo.inicio).eq('fecha_fin', periodo.fin).maybeSingle(),
    supabase.rpc('fn_equipo_resumen', { p_inicio: periodo.inicio, p_fin: periodo.fin }),
    supabase.rpc('fn_equipo_resumen', { p_inicio: comparacion.comparado.inicio, p_fin: comparacion.comparado.fin }),
    supabase.rpc('fn_resumen_ejecutivo', { p_inicio: periodo.inicio, p_fin: comparacion.actual.fin }),
    supabase.from('territorios_responsables').select('territorio, responsable').is('vigente_hasta', null),
    supabase.rpc('fn_serie_periodos', { p_anio: periodo.anchorYear }),
    supabase.rpc('fn_serie_clientes', { p_anio: periodo.anchorYear }),
    supabase.from('periodos').select('id, fecha_inicio').gte('fecha_inicio', `${periodo.anchorYear - 1}-12-24`).lte('fecha_fin', `${periodo.anchorYear}-12-23`),
  ])

  if (equipoRes.error) return NextResponse.json({ error: equipoRes.error.message }, { status: 500 })

  const periodoId = periodoRowRes.data?.id ?? null

  const metasPeriodo: MetaRow[] = periodoId
    ? ((await supabase.from('metas_comerciales').select('id, scope_type, scope_value, kpi_type, valor_meta').eq('periodo_id', periodoId)).data ?? []) as MetaRow[]
    : []

  const idsAnio = (periodosAnioRes.data ?? []).map(p => p.id)
  const metasAnio: MetaRow[] = idsAnio.length
    ? ((await supabase.from('metas_comerciales').select('id, scope_type, scope_value, kpi_type, valor_meta').in('periodo_id', idsAnio).eq('scope_type', 'compania')).data ?? []) as MetaRow[]
    : []

  const responsablePorTerritorio = new Map((territoriosRes.data ?? []).map(t => [t.territorio, t.responsable]))
  const filasActual = ((equipoRes.data ?? []) as FilaEquipo[]).filter(f => f.territorio !== 'Sin territorio asignado')
  const filasComp = ((equipoCompRes.data ?? []) as FilaEquipo[]).filter(f => f.territorio !== 'Sin territorio asignado')

  // Un responsable puede tener más de un territorio: se agrega por persona para
  // no listarla dos veces con la mitad de sus números en cada fila.
  interface Real { responsable: string; territorios: string[]; venta: number; litros: number; nuevos: number; deuda: number; barrilesCriticos: number }
  function agregarPorResponsable(filas: FilaEquipo[]): Map<string, Real> {
    const mapa = new Map<string, Real>()
    for (const f of filas) {
      const responsable = responsablePorTerritorio.get(f.territorio)
      if (!responsable) continue
      const cur: Real = mapa.get(responsable) ?? { responsable, territorios: [], venta: 0, litros: 0, nuevos: 0, deuda: 0, barrilesCriticos: 0 }
      cur.territorios.push(f.territorio)
      cur.venta += Number(f.venta_clp)
      cur.litros += Number(f.litros)
      cur.nuevos += Number(f.clientes_nuevos)
      cur.deuda += Number(f.deuda_vencida)
      cur.barrilesCriticos += Number(f.barriles_criticos)
      mapa.set(responsable, cur)
    }
    return mapa
  }

  const realPorResponsable = agregarPorResponsable(filasActual)
  const realCompPorResponsable = agregarPorResponsable(filasComp)

  /** Meta de un responsable: la de scope=vendedor si existe, si no la suma de sus territorios. */
  function metaDe(responsable: string, territorios: string[], kpi: KpiMeta): number | null {
    const directa = metasPeriodo.find(m => m.scope_type === 'vendedor' && m.scope_value === responsable && m.kpi_type === kpi)
    if (directa) return Number(directa.valor_meta)
    const porTerritorio = metasPeriodo.filter(m => m.scope_type === 'territorio' && m.kpi_type === kpi && territorios.includes(m.scope_value ?? ''))
    if (porTerritorio.length === 0) return null
    return porTerritorio.reduce((a, m) => a + Number(m.valor_meta), 0)
  }

  const responsables = [...realPorResponsable.values()]
    .map(r => ({
      responsable: r.responsable,
      territorios: r.territorios,
      real: { venta: r.venta, litros: r.litros, nuevos: r.nuevos, deuda: r.deuda, barrilesCriticos: r.barrilesCriticos },
      realComparado: realCompPorResponsable.get(r.responsable)?.venta ?? null,
      metas: {
        ventas_clp: metaDe(r.responsable, r.territorios, 'ventas_clp'),
        litros_total: metaDe(r.responsable, r.territorios, 'litros_total'),
        nuevos_clientes: metaDe(r.responsable, r.territorios, 'nuevos_clientes'),
        cobranza_recuperada: metaDe(r.responsable, r.territorios, 'cobranza_recuperada'),
        barriles_recuperados: metaDe(r.responsable, r.territorios, 'barriles_recuperados'),
      },
    }))
    .sort((a, b) => b.real.venta - a.real.venta)

  const resumen = (resumenRes.data?.[0] ?? null) as { monto_total: number; litros_total: number; clientes_nuevos: number } | null
  const metaCompania = {
    ventas_clp: metasPeriodo.find(m => m.scope_type === 'compania' && m.kpi_type === 'ventas_clp')?.valor_meta ?? null,
    litros_total: metasPeriodo.find(m => m.scope_type === 'compania' && m.kpi_type === 'litros_total')?.valor_meta ?? null,
    nuevos_clientes: metasPeriodo.find(m => m.scope_type === 'compania' && m.kpi_type === 'nuevos_clientes')?.valor_meta ?? null,
  }

  const hoy = new Date()
  const finPeriodo = new Date(`${periodo.fin}T12:00:00`)
  const inicioPeriodo = new Date(`${periodo.inicio}T12:00:00`)
  const diasTotales = Math.round((finPeriodo.getTime() - inicioPeriodo.getTime()) / 86_400_000) + 1
  const diasRestantes = Math.max(0, Math.round((finPeriodo.getTime() - hoy.getTime()) / 86_400_000))

  // Plan anual: sólo hasta el período en curso, para no comparar un acumulado
  // parcial contra metas de meses que todavía no empiezan.
  const serie = ((serieRes.data ?? []) as FilaSerie[]).filter(f => f.mes <= periodo.anchorMonth)
  const serieCli = ((serieCliRes.data ?? []) as FilaSerieCli[]).filter(f => f.mes <= periodo.anchorMonth)
  const sumaMetaAnual = (kpi: KpiMeta) => {
    const filas = metasAnio.filter(m => m.kpi_type === kpi)
    return filas.length ? filas.reduce((a, m) => a + Number(m.valor_meta), 0) : null
  }

  const planAnual = {
    anio: periodo.anchorYear,
    hastaPeriodo: periodo.nombre,
    ventas: { real: serie.reduce((a, f) => a + Number(f.monto_total), 0), meta: sumaMetaAnual('ventas_clp') },
    litros: { real: serie.reduce((a, f) => a + Number(f.litros_total), 0), meta: sumaMetaAnual('litros_total') },
    nuevosClientes: { real: serieCli.reduce((a, f) => a + Number(f.clientes_nuevos), 0), meta: sumaMetaAnual('nuevos_clientes') },
  }

  return NextResponse.json({
    periodo: {
      id: periodoId, nombre: periodo.nombre, inicio: periodo.inicio, fin: periodo.fin,
      mes: periodo.anchorMonth, anio: periodo.anchorYear,
      enCurso: comparacion.truncado, diasTotales, diasRestantes,
    },
    metaCompania,
    real: {
      ventas: resumen ? Number(resumen.monto_total) : 0,
      litros: resumen ? Number(resumen.litros_total) : 0,
      nuevosClientes: resumen ? Number(resumen.clientes_nuevos) : 0,
    },
    responsables,
    planAnual,
    // Territorios vigentes, para poder crear una meta de alguien que todavía no vende.
    territorios: (territoriosRes.data ?? []),
  })
}
