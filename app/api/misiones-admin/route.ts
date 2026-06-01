import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

// ── Helpers ──────────────────────────────────────────────────────────────────

function getMondayOfWeek(d: Date): string {
  const x = new Date(d); const day = x.getDay()
  x.setDate(x.getDate() - day + (day === 0 ? -6 : 1))
  return x.toISOString().split('T')[0]
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

function prevWeek(semana: string): string {
  const d = new Date(semana + 'T12:00:00')
  d.setDate(d.getDate() - 7)
  return getMondayOfWeek(d)
}

const esComp = (e: string) => e === 'contactado_pedido' || e === 'auto_completado'

// ── GET /api/misiones-admin?semana=YYYY-MM-DD ─────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const semana    = searchParams.get('semana') ?? getMondayOfWeek(new Date())
  const semanaFin = addDays(semana, 6)
  const semAnt    = prevWeek(semana)
  const semAntFin = addDays(semAnt, 6)
  const sem8ago   = (() => { const d = new Date(semana + 'T12:00:00'); d.setDate(d.getDate() - 49); return getMondayOfWeek(d) })()

  // ── Queries en paralelo ──────────────────────────────────────────────────────
  const [
    { data: mActual },
    { data: mAnt },
    { data: mHist },
    { data: riesgo },
    { data: agendados },
    { data: vActual },
    { data: vAnt },
    { data: mHist8 },   // historial completado_at para mejores días
  ] = await Promise.all([
    supabase.from('misiones').select('vendedor, estado, tipo, resultado_litros').eq('semana', semana),
    supabase.from('misiones').select('vendedor, estado, tipo, resultado_litros').eq('semana', semAnt),
    supabase.from('misiones').select('semana, estado, tipo').gte('semana', sem8ago).lte('semana', semana).order('semana'),
    supabase.from('client_scores').select('nombre, dias_sin_compra, vendedor_actual, ultima_compra, segmento').gt('dias_sin_compra', 30).order('dias_sin_compra', { ascending: false }).limit(20),
    supabase.from('followups').select('id').eq('estado', 'pendiente').gte('fecha_recordatorio', semana).lte('fecha_recordatorio', semanaFin),
    supabase.from('ventas').select('vendedor_actual, litros, total_sin_impuesto, pedido, localidad').gte('fecha_pedido', semana).lte('fecha_pedido', semanaFin),
    supabase.from('ventas').select('vendedor_actual, litros, total_sin_impuesto').gte('fecha_pedido', semAnt).lte('fecha_pedido', semAntFin),
    supabase.from('misiones').select('completado_at, estado').gte('semana', sem8ago).lte('semana', semana).not('completado_at', 'is', null),
  ])

  // ── Telefono de top clientes en riesgo ──────────────────────────────────────
  const top5nombres = (riesgo ?? []).slice(0, 5).map(r => r.nombre)
  const { data: clientesTel } = top5nombres.length
    ? await supabase.from('clientes').select('nombre_fantasia, telefono').in('nombre_fantasia', top5nombres)
    : { data: [] }
  const telMap = new Map((clientesTel ?? []).map(c => [c.nombre_fantasia, c.telefono ?? null]))

  // ── Clientes con volumen a la baja (señal temprana de fuga) ───────────────────
  const { data: volBajaData } = await supabase.rpc('get_clientes_volumen_baja', {
    p_vendedor: null,
    p_umbral: 0.25,
  })
  const volumenBaja = ((volBajaData ?? []) as {
    nombre_fantasia: string; vendedor_actual: string; segmento: string
    litros_reciente: number; litros_baseline: number; caida_pct: number
    pedidos_totales: number; dias_sin_compra: number; telefono: string | null
  }[]).slice(0, 8)
  const volumenBajaTotal = (volBajaData ?? []).length

  // ── Oportunidades de cross-sell ───────────────────────────────────────────────
  const { data: crossRaw } = await supabase.rpc('get_cross_sell', { p_vendedor: null, p_min_penetracion: 0.4 })
  const crossSell = ((crossRaw ?? []) as {
    nombre_fantasia: string; vendedor_actual: string; categoria_negocio: string
    categoria_sugerida: string; peers_pct: number; telefono: string | null
  }[]).slice(0, 8)
  const crossSellTotal = (crossRaw ?? []).length

  // ── Segmentación tipo_cliente ─────────────────────────────────────────────────
  const { data: tiposData } = await supabase
    .from('client_scores')
    .select('nombre_fantasia, tipo_cliente, vendedor_actual')

  const tipoConteo = { activo: 0, inactivo: 0, temporal: 0, nuevo: 0 }
  for (const t of (tiposData ?? [])) {
    const tipo = t.tipo_cliente as keyof typeof tipoConteo
    if (tipo in tipoConteo) tipoConteo[tipo]++
  }

  // ── Helpers de cálculo ────────────────────────────────────────────────────────

  function calcMisiones(rows: typeof mActual) {
    const r = rows ?? []
    const total       = r.length
    const completadas = r.filter(m => esComp(m.estado)).length
    const vencidas    = r.filter(m => m.tipo === 'vencido' && !esComp(m.estado)).length
    const porContactar = total - completadas
    return { total, completadas, vencidas, porContactar }
  }

  type VentaRow = { vendedor_actual?: string; litros?: number | null; total_sin_impuesto?: number | null; pedido?: string | null; localidad?: string | null }
  function calcVentas(rows: VentaRow[] | null) {
    const r = rows ?? []
    const volumen = r.reduce((s, v) => s + (v.litros ?? 0), 0)
    const venta   = r.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)
    const pedidos = new Set(r.map(v => v.pedido).filter(Boolean)).size
    const ticket  = pedidos > 0 ? venta / pedidos : 0
    return { volumen, venta, pedidos, ticket }
  }

  const kA  = calcMisiones(mActual)
  const kAn = calcMisiones(mAnt)
  const vA  = calcVentas(vActual)
  const vAn = calcVentas(vAnt)

  // ── Rendimiento por vendedor (misiones + ventas) ──────────────────────────────
  const vendedoresSet = new Set([...(mActual ?? []).map(m => m.vendedor)])
  const vendMap = new Map<string, { asignadas: number; completadas: number; volActual: number; volAnt: number }>()
  for (const v of vendedoresSet) {
    vendMap.set(v, { asignadas: 0, completadas: 0, volActual: 0, volAnt: 0 })
  }
  for (const m of (mActual ?? [])) {
    const e = vendMap.get(m.vendedor)!
    e.asignadas++
    if (esComp(m.estado)) e.completadas++
  }
  for (const v of (vActual ?? [])) {
    const e = vendMap.get(v.vendedor_actual)
    if (e) e.volActual += v.litros ?? 0
  }
  for (const v of (vAnt ?? [])) {
    const e = vendMap.get(v.vendedor_actual)
    if (e) e.volAnt += v.litros ?? 0
  }
  const VEND_COLORS: Record<string, string> = {
    'Javier Badilla': '#F59E0B',
    'Carlos Urrejola': '#60A5FA',
  }
  const DEFAULT_COLORS = ['#A78BFA', '#F87171', '#34D399', '#FB923C', '#38BDF8']
  let colorIdx = 0
  const porVendedor = [...vendMap.entries()]
    .sort((a, b) => b[1].asignadas - a[1].asignadas)
    .map(([vendedor, d]) => ({
      vendedor,
      asignadas:  d.asignadas,
      completadas: d.completadas,
      pct: d.asignadas > 0 ? Math.round((d.completadas / d.asignadas) * 100) : 0,
      volumen: Math.round(d.volActual * 10) / 10,
      dVolumen: Math.round((d.volActual - d.volAnt) * 10) / 10,
      color: VEND_COLORS[vendedor] ?? DEFAULT_COLORS[colorIdx++ % DEFAULT_COLORS.length],
    }))

  // ── Sparklines: últimas 8 semanas ────────────────────────────────────────────
  const semanas8: string[] = []
  const semBase = new Date(sem8ago + 'T12:00:00')
  for (let i = 0; i < 8; i++) {
    semanas8.push(getMondayOfWeek(semBase))
    semBase.setDate(semBase.getDate() + 7)
  }
  const histMap = new Map<string, { total: number; completadas: number; porContactar: number; vencidas: number }>()
  for (const s of semanas8) histMap.set(s, { total: 0, completadas: 0, porContactar: 0, vencidas: 0 })
  for (const m of (mHist ?? [])) {
    const key = m.semana
    if (!histMap.has(key)) continue
    const h = histMap.get(key)!
    h.total++
    if (esComp(m.estado)) h.completadas++
    else h.porContactar++
    if (m.tipo === 'vencido' && !esComp(m.estado)) h.vencidas++
  }
  const sparklines = {
    total:        semanas8.map(s => histMap.get(s)?.total ?? 0),
    completadas:  semanas8.map(s => histMap.get(s)?.completadas ?? 0),
    porContactar: semanas8.map(s => histMap.get(s)?.porContactar ?? 0),
    vencidas:     semanas8.map(s => histMap.get(s)?.vencidas ?? 0),
  }

  // ── Mejores días para contactar (análisis de completado_at) ──────────────────
  const diasNombres = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
  const diaCount = new Array(7).fill(0)
  for (const m of (mHist8 ?? [])) {
    if (m.completado_at && esComp(m.estado)) {
      const dia = new Date(m.completado_at).getDay()
      diaCount[dia]++
    }
  }
  const totalComp = diaCount.reduce((s, n) => s + n, 0)
  const mejoresDias = diasNombres.map((dia, i) => ({
    dia,
    count: diaCount[i],
    tasa: totalComp > 0 ? Math.round((diaCount[i] / totalComp) * 100) : 0,
  })).sort((a, b) => b.count - a.count)

  // ── Zonas con bajo volumen ───────────────────────────────────────────────────
  const locMap = new Map<string, number>()
  for (const v of (vActual ?? [])) {
    if (!v.localidad) continue
    locMap.set(v.localidad, (locMap.get(v.localidad) ?? 0) + (v.litros ?? 0))
  }
  const locValues = [...locMap.values()]
  const mediana = locValues.length > 0
    ? locValues.sort((a, b) => a - b)[Math.floor(locValues.length / 2)]
    : 0
  const zonasRiesgo = locValues.filter(v => v < mediana * 0.5).length

  // ── Top 5 clientes en riesgo ─────────────────────────────────────────────────
  const topRiesgo = (riesgo ?? []).slice(0, 5).map(r => ({
    nombre:        r.nombre,
    vendedor:      r.vendedor_actual ?? '—',
    diasSinCompra: r.dias_sin_compra,
    ultimaCompra:  r.ultima_compra,
    segmento:      r.segmento,
    telefono:      telMap.get(r.nombre) ?? null,
  }))

  return NextResponse.json({
    semana,
    semanaFin,
    semanas: semanas8,

    // KPIs principales
    total:        kA.total,
    completadas:  kA.completadas,
    porContactar: kA.porContactar,
    vencidas:     kA.vencidas,

    // Deltas vs semana anterior
    dTotal:        kA.total        - kAn.total,
    dCompletadas:  kA.completadas  - kAn.completadas,
    dPorContactar: kA.porContactar - kAn.porContactar,
    dVencidas:     kA.vencidas     - kAn.vencidas,

    // Revenue (de tabla ventas)
    volumen:       Math.round(vA.volumen * 10) / 10,
    venta:         Math.round(vA.venta),
    ticket:        Math.round(vA.ticket),
    dVolumen:      Math.round((vA.volumen - vAn.volumen) * 10) / 10,
    dVenta:        Math.round(((vAn.venta > 0 ? (vA.venta - vAn.venta) / vAn.venta : 0) * 100)),
    dTicket:       Math.round(((vAn.ticket > 0 ? (vA.ticket - vAn.ticket) / vAn.ticket : 0) * 100)),

    // Otros KPIs
    clientesEnRiesgo: (riesgo ?? []).length,
    agendados:        (agendados ?? []).length,

    // Por vendedor
    porVendedor,

    // Sparklines (8 semanas)
    sparklines,

    // Insights
    mejoresDias,
    zonasRiesgo,

    // Top 5 en riesgo
    topRiesgo,

    // Segmentación activo/inactivo/temporal/nuevo
    segmentacion: tipoConteo,

    // Caída de volumen (señal temprana de fuga)
    volumenBaja,
    volumenBajaTotal,

    // Cross-sell
    crossSell,
    crossSellTotal,
  })
}
