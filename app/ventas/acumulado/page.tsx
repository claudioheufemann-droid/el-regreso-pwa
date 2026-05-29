import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { VENDEDORES, CLIENTES_EXCLUIR } from '@/lib/types'
import AcumuladoClient from './AcumuladoClient'

export const dynamic = 'force-dynamic'

// ── Tipos exportados ────────────────────────────────────────────────────────
export interface KpiData {
  litros: number;        litrosAnterior: number
  venta: number;         ventaAnterior: number
  ticketPromedio: number; ticketPromedioAnterior: number
  clientesActivos: number; clientesActivosAnterior: number
  categoriaLider: string; categoriaLiderPct: number; categoriaLiderPctAnterior: number
}
export interface EvoDia   { fecha: string; [key: string]: number | string }
export interface CatRow   { litros: number; venta: number; litrosAnterior: number }
export interface TopCliente { nombre: string; categoria: string; litros: number; litrosAnterior: number }
export interface MixItem  { categoria: string; litros: number }
export interface InsightItem { texto: string; tipo: 'positive'|'negative'|'warning'|'info' }
export interface AlertaItem  { titulo: string; subtexto: string; tipo: 'danger'|'warning'|'info'|'success'; hace: string }
export interface DivVend  { categorias: Record<string,number>; score: number; descripcion: string }

// Tipos de detalle para interactividad
export type ClienteDet = { nombre: string; litros: number; venta: number }
export type EvoDetalle = Record<string, Record<string, ClienteDet[]>>          // fecha→vend→clientes
export type CatClientes = Record<string, Record<string, ClienteDet[]>>         // vend→cat→clientes
export type MixDetalle  = Record<string, ClienteDet[]>                         // cat→clientes

// ── Helpers ──────────────────────────────────────────────────────────────────
const excluido = (n: string|null) => !n || CLIENTES_EXCLUIR.some(ex => n.includes(ex))
const getCat = (v: { categoria_negocio: string|null }) =>
  (v.categoria_negocio && v.categoria_negocio !== '-') ? v.categoria_negocio : 'Otros'

function prevPeriod(fechaInicio: string) {
  const [y, m] = fechaInicio.split('-').map(Number)
  const pm = m === 1 ? 12 : m - 1
  const py = m === 1 ? y - 1 : y
  return {
    inicio: `${py}-${String(pm).padStart(2,'0')}-01`,
    fin: new Date(y, m - 1, 0).toISOString().split('T')[0],
  }
}

function hhi(cats: Record<string,number>) {
  const t = Object.values(cats).reduce((s,v)=>s+v,0)
  if (!t) return 1
  return Object.values(cats).reduce((s,v)=>s+(v/t)**2,0)
}

function divScore(cats: Record<string,number>) {
  const h = hhi(cats)
  const score = Math.round(Math.max(0,Math.min(100,(1-h)*130)))
  const sorted = Object.entries(cats).sort((a,b)=>b[1]-a[1])
  const t = Object.values(cats).reduce((s,v)=>s+v,0)||1
  const topPct = (sorted[0]?.[1]??0)/t
  const desc = topPct>0.5 ? `Dependencia alta en ${sorted[0]?.[0]}`
             : topPct>0.35 ? 'Diversificación moderada'
             : 'Diversificación saludable'
  return { score, descripcion: desc }
}

function upsertCliente(arr: ClienteDet[], nombre: string, litros: number, venta: number) {
  const ex = arr.find(c=>c.nombre===nombre)
  if (ex) { ex.litros+=litros; ex.venta+=venta }
  else arr.push({ nombre, litros, venta })
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default async function AcumuladoPage() {
  const supabase = await createClient()
  const appUser  = await getServerUser()

  const vendedoresScope = appUser?.isAdmin ? VENDEDORES : VENDEDORES.filter(v=>v===appUser?.nombre)
  const scope = vendedoresScope.length ? vendedoresScope : ['__none__']

  const { data: periodo } = await supabase.from('periodos').select('*').eq('activo',true).single()
  const fechaInicio = periodo?.fecha_inicio ?? new Date(new Date().getFullYear(),new Date().getMonth(),1).toISOString().split('T')[0]
  const fechaFin    = periodo?.fecha_fin    ?? new Date().toISOString().split('T')[0]
  const prev = prevPeriod(fechaInicio)

  const [{ data: ventasRaw }, { data: ventasPrevRaw }, { data: metasData }, { data: riesgoRaw }] = await Promise.all([
    supabase.from('ventas')
      .select('vendedor_actual,litros,total_sin_impuesto,categoria_negocio,categoria_producto,fecha_pedido,nombre_fantasia,pedido')
      .in('vendedor_actual', scope).gte('fecha_pedido', fechaInicio).lte('fecha_pedido', fechaFin),
    supabase.from('ventas')
      .select('vendedor_actual,litros,total_sin_impuesto,categoria_negocio,categoria_producto,fecha_pedido,nombre_fantasia')
      .in('vendedor_actual', scope).gte('fecha_pedido', prev.inicio).lte('fecha_pedido', prev.fin),
    supabase.from('metas').select('vendedor,meta_litros,tipo').eq('periodo_id', periodo?.id??-1).eq('tipo','mensual'),
    supabase.rpc('get_pending_call_alerts', { p_vendedor: null, p_nivel_minimo: 'critico' }),
  ])

  const ventas     = (ventasRaw    ??[]).filter(v=>!excluido(v.nombre_fantasia))
  const ventasPrev = (ventasPrevRaw??[]).filter(v=>!excluido(v.nombre_fantasia))

  // ── KPIs ──────────────────────────────────────────────────────────────────
  const totalLitros     = ventas.reduce((s,v)=>s+(v.litros??0),0)
  const totalVenta      = ventas.reduce((s,v)=>s+(v.total_sin_impuesto??0),0)
  const totalLitrosPrev = ventasPrev.reduce((s,v)=>s+(v.litros??0),0)
  const totalVentaPrev  = ventasPrev.reduce((s,v)=>s+(v.total_sin_impuesto??0),0)
  const pedidos     = new Set(ventas.filter(v=>(v as {pedido?:string}).pedido).map(v=>(v as {pedido?:string}).pedido)).size||1
  const pedidosPrev = new Set(ventasPrev.filter(v=>(v as {pedido?:string}).pedido).map(v=>(v as {pedido?:string}).pedido)).size||1
  const clientesActivos     = new Set(ventas.map(v=>v.nombre_fantasia).filter(Boolean)).size
  const clientesActivosPrev = new Set(ventasPrev.map(v=>v.nombre_fantasia).filter(Boolean)).size

  // Cat resumen global
  const catActual: Record<string,number> = {}
  const catAnterior: Record<string,number> = {}
  for (const v of ventas)     catActual[getCat(v)] = (catActual[getCat(v)]??0)+(v.litros??0)
  for (const v of ventasPrev) catAnterior[getCat(v)] = (catAnterior[getCat(v)]??0)+(v.litros??0)
  const catLiderEntry = Object.entries(catActual).sort((a,b)=>b[1]-a[1])[0]??['—',0]

  const kpis: KpiData = {
    litros: totalLitros, litrosAnterior: totalLitrosPrev,
    venta: totalVenta, ventaAnterior: totalVentaPrev,
    ticketPromedio: totalVenta/pedidos, ticketPromedioAnterior: totalVentaPrev/pedidosPrev,
    clientesActivos, clientesActivosAnterior: clientesActivosPrev,
    categoriaLider: catLiderEntry[0],
    categoriaLiderPct: totalLitros>0 ? Math.round((catLiderEntry[1]/totalLitros)*100) : 0,
    categoriaLiderPctAnterior: totalLitrosPrev>0 ? Math.round(((catAnterior[catLiderEntry[0]]??0)/totalLitrosPrev)*100) : 0,
  }

  // ── Evolución diaria + detalle ────────────────────────────────────────────
  const evoMap  = new Map<string, Record<string,number>>()
  const evoDetalle: EvoDetalle = {}
  for (const v of ventas) {
    const f = v.fecha_pedido; const vnd = v.vendedor_actual
    if (!evoMap.has(f)) evoMap.set(f,{})
    evoMap.get(f)![vnd] = (evoMap.get(f)![vnd]??0)+(v.litros??0)
    if (!evoDetalle[f]) evoDetalle[f]={}
    if (!evoDetalle[f][vnd]) evoDetalle[f][vnd]=[]
    if (v.nombre_fantasia) upsertCliente(evoDetalle[f][vnd], v.nombre_fantasia, v.litros??0, v.total_sin_impuesto??0)
  }
  for (const f of Object.keys(evoDetalle))
    for (const vnd of Object.keys(evoDetalle[f]))
      evoDetalle[f][vnd].sort((a,b)=>b.litros-a.litros)

  const evolucion: EvoDia[] = Array.from(evoMap.entries())
    .sort((a,b)=>a[0].localeCompare(b[0]))
    .map(([fecha,vals])=>({ fecha,...vals }))

  // ── Proyección ────────────────────────────────────────────────────────────
  const hoy = new Date()
  const diasTranscurridos = Math.max(1,Math.ceil((hoy.getTime()-new Date(fechaInicio).getTime())/86400000))
  const diasTotales = Math.ceil((new Date(fechaFin).getTime()-new Date(fechaInicio).getTime())/86400000)+1
  const promedioDiario = totalLitros/diasTranscurridos
  const proyeccionFin  = promedioDiario*diasTotales
  const mejorDiaEntry  = Array.from(evoMap.entries())
    .map(([fecha,vals])=>({ fecha, total: Object.values(vals).reduce((s,v)=>s+v,0) }))
    .sort((a,b)=>b.total-a.total)[0]

  // ── Categorías por vendedor + clientes ────────────────────────────────────
  const catPorVendedor: Record<string, Record<string,CatRow>> = {}
  const catClientes: CatClientes = {}
  for (const vend of vendedoresScope) {
    const vV = ventas.filter(v=>v.vendedor_actual===vend)
    const prevMap: Record<string,number> = {}
    for (const v of ventasPrev.filter(v=>v.vendedor_actual===vend))
      prevMap[getCat(v)] = (prevMap[getCat(v)]??0)+(v.litros??0)
    catPorVendedor[vend] = {}; catClientes[vend] = {}
    for (const v of vV) {
      const cat = getCat(v)
      if (!catPorVendedor[vend][cat]) catPorVendedor[vend][cat] = { litros:0, venta:0, litrosAnterior: prevMap[cat]??0 }
      catPorVendedor[vend][cat].litros += v.litros??0
      catPorVendedor[vend][cat].venta  += v.total_sin_impuesto??0
      if (!catClientes[vend][cat]) catClientes[vend][cat]=[]
      if (v.nombre_fantasia) upsertCliente(catClientes[vend][cat], v.nombre_fantasia, v.litros??0, v.total_sin_impuesto??0)
    }
    for (const cat of Object.keys(catPorVendedor[vend]))
      catPorVendedor[vend][cat].litrosAnterior = prevMap[cat]??0
    for (const cat of Object.keys(catClientes[vend]))
      catClientes[vend][cat].sort((a,b)=>b.litros-a.litros)
  }

  // ── Mix de estilos + detalle ──────────────────────────────────────────────
  const mixMap: Record<string,number> = {}
  const mixDetalle: MixDetalle = {}
  for (const v of ventas) {
    const cat = v.categoria_producto ?? 'Otros'
    mixMap[cat] = (mixMap[cat]??0)+(v.litros??0)
    if (!mixDetalle[cat]) mixDetalle[cat]=[]
    if (v.nombre_fantasia) upsertCliente(mixDetalle[cat], v.nombre_fantasia, v.litros??0, v.total_sin_impuesto??0)
  }
  for (const cat of Object.keys(mixDetalle)) mixDetalle[cat].sort((a,b)=>b.litros-a.litros)
  const mixEstilos: MixItem[] = Object.entries(mixMap).sort((a,b)=>b[1]-a[1]).map(([categoria,litros])=>({ categoria, litros }))

  // ── Top clientes ──────────────────────────────────────────────────────────
  const topMap: Record<string,{litros:number;venta:number;categoria:string}> = {}
  for (const v of ventas) {
    if (!v.nombre_fantasia) continue
    if (!topMap[v.nombre_fantasia]) topMap[v.nombre_fantasia]={ litros:0, venta:0, categoria:v.categoria_negocio??'Otros' }
    topMap[v.nombre_fantasia].litros += v.litros??0
    topMap[v.nombre_fantasia].venta  += v.total_sin_impuesto??0
  }
  const prevClienteMap: Record<string,number> = {}
  for (const v of ventasPrev) if (v.nombre_fantasia)
    prevClienteMap[v.nombre_fantasia] = (prevClienteMap[v.nombre_fantasia]??0)+(v.litros??0)
  const topClientes: TopCliente[] = Object.entries(topMap)
    .sort((a,b)=>b[1].litros-a[1].litros).slice(0,8)
    .map(([nombre,d])=>({ nombre, categoria:d.categoria, litros:d.litros, litrosAnterior:prevClienteMap[nombre]??0 }))

  // ── Metas ─────────────────────────────────────────────────────────────────
  const metasPorVendedor: Record<string,number> = {}
  for (const m of metasData??[]) metasPorVendedor[m.vendedor] = (metasPorVendedor[m.vendedor]??0)+m.meta_litros
  const metaTotal = Object.values(metasPorVendedor).reduce((s,v)=>s+v,0)

  // ── Diversificación ───────────────────────────────────────────────────────
  const diversificacion: Record<string,DivVend> = {}
  for (const vend of vendedoresScope) {
    const cats: Record<string,number> = {}
    for (const v of ventas.filter(vv=>vv.vendedor_actual===vend))
      cats[getCat(v)] = (cats[getCat(v)]??0)+(v.litros??0)
    diversificacion[vend] = { categorias:cats, ...divScore(cats) }
  }

  // ── Insights ──────────────────────────────────────────────────────────────
  const insights: InsightItem[] = []
  for (const vend of vendedoresScope) {
    const tot = Object.values(catPorVendedor[vend]??{}).reduce((s,c)=>s+c.litros,0)
    const top = Object.entries(catPorVendedor[vend]??{}).sort((a,b)=>b[1].litros-a[1].litros)[0]
    if (top && tot>0) {
      const pct = Math.round((top[1].litros/tot)*100)
      insights.push({ texto:`${top[0]} representa el ${pct}% de las ventas de ${vend.split(' ')[0]}`, tipo: pct>50?'warning':'info' })
    }
  }
  const catCrecimiento = Object.entries(catActual)
    .filter(([cat])=>catAnterior[cat])
    .map(([cat,lit])=>({ cat, pct: Math.round(((lit-(catAnterior[cat]??0))/(catAnterior[cat]??1))*100) }))
    .sort((a,b)=>b.pct-a.pct)
  if (catCrecimiento[0]?.pct>10)
    insights.push({ texto:`${catCrecimiento[0].cat} creció +${catCrecimiento[0].pct}% vs período anterior`, tipo:'positive' })
  const catCaida = catCrecimiento.filter(c=>c.pct<-10)
  if (catCaida[0])
    insights.push({ texto:`${catCaida[0].cat} cayó ${Math.abs(catCaida[0].pct)}% vs período anterior`, tipo:'negative' })
  if (vendedoresScope.length>=2) {
    const [v1,v2]=vendedoresScope
    if (Math.abs((diversificacion[v1]?.score??0)-(diversificacion[v2]?.score??0))>10) {
      const mejor = (diversificacion[v1]?.score??0)>(diversificacion[v2]?.score??0) ? v1 : v2
      insights.push({ texto:`${mejor.split(' ')[0]} tiene mejor diversificación de canales`, tipo:'info' })
    }
  }
  const ticketPorCat: Record<string,{venta:number;pedidos:Set<string>}> = {}
  for (const v of ventas) {
    const cat = getCat(v)
    if (!ticketPorCat[cat]) ticketPorCat[cat]={ venta:0, pedidos:new Set() }
    ticketPorCat[cat].venta += v.total_sin_impuesto??0
    if ((v as {pedido?:string}).pedido) ticketPorCat[cat].pedidos.add((v as {pedido?:string}).pedido!)
  }
  const ticketTop = Object.entries(ticketPorCat)
    .map(([cat,d])=>({ cat, ticket:d.pedidos.size>0?d.venta/d.pedidos.size:0 }))
    .sort((a,b)=>b.ticket-a.ticket)[0]
  if (ticketTop)
    insights.push({ texto:`${ticketTop.cat} tiene el mayor ticket promedio: $${Math.round(ticketTop.ticket).toLocaleString('es-CL')}`, tipo:'info' })

  // ── Alertas ───────────────────────────────────────────────────────────────
  const alertas: AlertaItem[] = []
  const riesgo = (riesgoRaw??[]) as {nombre_fantasia:string;dias_sin_compra:number;segmento:string}[]
  for (const r of riesgo.slice(0,2))
    alertas.push({ titulo:`Seg. ${r.segmento} — ${r.dias_sin_compra}d sin compras`, subtexto:r.nombre_fantasia, tipo:'danger', hace:'hoy' })
  for (const c of catCaida.slice(0,1))
    alertas.push({ titulo:`Caída ${Math.abs(c.pct)}% en ${c.cat}`, subtexto:'Revisar estrategia comercial', tipo:'warning', hace:'este período' })
  if (metaTotal>0) {
    const pctMeta = Math.round((totalLitros/metaTotal)*100)
    if (pctMeta>=90)
      alertas.push({ titulo:`¡Meta al ${pctMeta}%!`, subtexto:`Faltan ${Math.max(0,Math.round(metaTotal-totalLitros))} L`, tipo:'success', hace:'hoy' })
  }

  const [py,pm] = prev.inicio.split('-').map(Number)
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

  return (
    <AcumuladoClient
      periodo={periodo} periodoAnteriorNombre={`${meses[pm-1]} ${py}`}
      kpis={kpis} evolucion={evolucion} evoDetalle={evoDetalle}
      promedioDiario={promedioDiario} proyeccionFin={proyeccionFin}
      diasTranscurridos={diasTranscurridos} diasTotales={diasTotales}
      mejorDia={mejorDiaEntry??null}
      catPorVendedor={catPorVendedor} catClientes={catClientes}
      mixEstilos={mixEstilos} mixDetalle={mixDetalle}
      topClientes={topClientes}
      metasPorVendedor={metasPorVendedor} metaTotal={metaTotal}
      diversificacion={diversificacion}
      insights={insights} alertas={alertas}
      vendedoresScope={vendedoresScope as string[]}
      isAdmin={appUser?.isAdmin??false}
    />
  )
}
