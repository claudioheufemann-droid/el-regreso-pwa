'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { useUser } from '@/lib/userContext'
import {
  Search, Filter, ChevronDown, ChevronLeft, ChevronRight,
  MessageCircle, MoreVertical, Users, CheckCircle2, Clock,
  PhoneOff, AlertTriangle, Zap, Bell, Activity, X, User, Phone,
  Archive, BarChart3, Package,
} from 'lucide-react'
import type { ActividadItem } from './page'
import AppHeader from '@/components/ui/AppHeader'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import { VEND_COLOR, SEG_COLOR } from '@/lib/theme'
import { vendedorCanonico, VENDEDORES_CARTERA_ACTIVAS } from '@/lib/types'
import { formatLocalidad } from '@/lib/format'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface FrequencyStat {
  dias_sin_compra: number; ciclo_promedio_dias: number | null; total_pedidos: number
  alert_level: string; siguiente_compra_estimada: string | null
  score: number; segmento: string; confianza_score: string
  litros_totales: number; revenue_total: number; pedidos_por_mes: number
  /** Modelo de ciclo v2 — ver supabase/migrations/ciclo_estacional_v2.sql */
  es_estacional?: boolean
  /** Cliente de temporada, actualmente en su temporada baja: no es "riesgo". */
  temporada_baja?: boolean
  factor_estacional?: number
  /** Ciclo sin ajuste estacional ni calibración (para explicar el cálculo). */
  ciclo_base_dias?: number | null
  /** Fecha de la primera compra ALGUNA VEZ (para clasificar "Nuevo"). */
  primera_compra?: string | null
}
interface Cliente {
  id: number; nombre_fantasia: string | null; razon_social: string | null
  categoria: string | null; vendedor: string | null; localidad: string | null
  localidad_entrega: string | null; ruta_despacho: string | null; telefono: string | null
  lat: number | null; lng: number | null
  ultimoContacto: { fecha: string; tipo: string; vendedor: string } | null
  ultimoPedido: { ultimaFecha: string; litrosPeriodo: number; ventaPeriodo: number } | null
  frecuencia: FrequencyStat | null
  estadoCliente: 'activo' | 'inactivo' | 'estacional'
  notaEstado: string | null
  deuda: { deuda_vencida: number; saldo_total: number } | null
}
interface Stats {
  total: number; contactados7d: number; pendientes: number
  sinContacto: number; riesgoCompra: number; deudaAlta: number; alDia: number
}
interface Props {
  clientes: Cliente[]
  periodo: { nombre: string; fecha_inicio: string; fecha_fin: string } | null
  totalesPorVendedor: Record<string, { litros: number; venta: number }>
  stats: Stats
  actividad: ActividadItem[]
  isAdmin: boolean
  vendedoresScope: string[]
  /** El scoring de clientes no se pudo calcular (timeout de la consulta).
   *  Sin él, ciclo/días sin comprar/score salen vacíos y hay que decirlo. */
  scoringCaido?: boolean
}

// ── Paleta — importada desde lib/theme (fuente única de verdad) ───────────────
// SEG_COLOR y VEND_COLOR vienen del import de arriba
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

// ── Paleta CRM móvil (blanca) — sólo para la vista móvil de esta pantalla ─────
// Deliberadamente local (no toca las variables --bg/--surface globales, que
// son casi-negras): mismo patrón ya usado en Ventas > Hoy (const C) para
// secciones que necesitan una identidad propia sin migrar el resto de la app.
const MC = {
  bg:        '#F1F5F9',
  card:      '#FFFFFF',
  cardHover: '#F8FAFC',
  border:    '#E2E8F0',
  text:      '#0F172A',
  muted:     '#64748B',
  blue:      '#2563EB',
  blueBg:    'rgba(37,99,235,0.10)',
  green:     '#059669',
  greenBg:   'rgba(5,150,105,0.10)',
  amber:     '#D97706',
  amberBg:   'rgba(217,119,6,0.10)',
  orange:    '#EA580C',
  orangeBg:  'rgba(234,88,12,0.10)',
  red:       '#DC2626',
  redBg:     'rgba(220,38,38,0.10)',
  whatsapp:  '#25D366',
}

// ── Stock proyectado del cliente ───────────────────────────────────────────────
// No existe (todavía) un trackeo real de litros en el local del cliente — se
// estima a partir del ciclo de compra que calcula client_scores:
//   litros por pedido = litros_totales / total_pedidos  (tamaño típico de compra)
//   consumo diario    = litros por pedido / ciclo_promedio_dias
//   días restantes    = ciclo_promedio_dias - dias_sin_compra  (negativo = vencido)
//   fecha de quiebre   = siguiente_compra_estimada (ya viene calculada)
//
// `ciclo_promedio_dias` NO es un promedio simple pese al nombre (se conservó
// por compatibilidad): desde ciclo_estacional_v2.sql es
//   mediana de los últimos 8 gaps desestacionalizados
//     × factor del mes proyectado          (estacionalidad)
//     × factor de calibración global       (corrige el sesgo del modelo)
// Detalle y justificación en supabase/migrations/ciclo_estacional_v2.sql.
type StockBand = 'verde' | 'amarillo' | 'naranja' | 'rojo' | null
interface StockProyectado {
  diasRestantes: number
  litrosDisponibles: number
  consumoSemanal: number
  fechaQuiebre: string | null
  agotado: boolean
  band: StockBand
  /** Cliente de temporada fuera de su temporada: se muestra neutro, no en rojo. */
  temporadaBaja: boolean
}
function calcularStock(f: FrequencyStat | null): StockProyectado | null {
  if (!f || !f.ciclo_promedio_dias || f.total_pedidos <= 0) return null
  const litrosPorPedido = f.litros_totales / f.total_pedidos
  const consumoDiario = litrosPorPedido / f.ciclo_promedio_dias
  const diasRestantes = Math.round(f.ciclo_promedio_dias - f.dias_sin_compra)
  const litrosDisponibles = Math.max(0, consumoDiario * diasRestantes)
  const agotado = diasRestantes <= 0
  const band: StockBand = agotado ? 'rojo' : diasRestantes < 3 ? 'rojo' : diasRestantes <= 7 ? 'naranja' : diasRestantes <= 14 ? 'amarillo' : 'verde'
  return {
    diasRestantes,
    litrosDisponibles,
    consumoSemanal: consumoDiario * 7,
    fechaQuiebre: f.siguiente_compra_estimada,
    agotado,
    band,
    temporadaBaja: !!f.temporada_baja,
  }
}
const BAND_COLOR: Record<Exclude<StockBand,null>, { fg:string; bg:string }> = {
  verde:    { fg: MC.green,  bg: MC.greenBg  },
  amarillo: { fg: MC.amber,  bg: MC.amberBg  },
  naranja:  { fg: MC.orange, bg: MC.orangeBg },
  rojo:     { fg: MC.red,    bg: MC.redBg    },
}
/** Riesgo alto = naranja o rojo; medio = amarillo; sin riesgo = verde o sin historial.
 *  Un cliente de temporada FUERA de su temporada nunca es riesgo alto: que no
 *  compre en su temporada baja es su comportamiento normal, no una alerta. */
function riesgoDeBand(band: StockBand, temporadaBaja = false): 'alto' | 'medio' | 'bajo' {
  if (temporadaBaja) return 'bajo'
  if (band === 'rojo' || band === 'naranja') return 'alto'
  if (band === 'amarillo') return 'medio'
  return 'bajo'
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function diasDesde(f?: string | null): number | null {
  if (!f) return null
  return Math.floor((Date.now() - new Date(f).getTime()) / 86400000)
}
function fFecha(s: string): string {
  const [y, m, d] = s.split('T')[0].split('-')
  return `${parseInt(d)} ${MESES[parseInt(m)-1]} ${y}`
}
function fDias(d: number | null): string {
  if (d === null) return '—'
  if (d === 0) return 'Hoy'
  if (d === 1) return 'Ayer'
  return `hace ${d}d`
}
function fPeso(n: number): string {
  return `$${Math.round(n).toLocaleString('es-CL')}`
}
function esPasada(f: string | null | undefined): boolean {
  if (!f) return false
  return new Date(f) < new Date()
}

// Cliente "Nuevo": su primera compra ALGUNA VEZ fue hace <=30 días. Se usa
// `primera_compra` (ventas reales) y no `clientes.created_at` porque esta
// última es cuándo se cargó la fila en la app (hubo una importación masiva
// de 723 clientes de golpe el 28-may-2026), no cuándo el cliente empezó a
// comprar de verdad.
const DIAS_CLIENTE_NUEVO = 30
function esClienteNuevo(f: FrequencyStat | null): boolean {
  if (!f?.primera_compra) return false
  const dias = diasDesde(f.primera_compra)
  return dias !== null && dias >= 0 && dias <= DIAS_CLIENTE_NUEVO
}

// ── Score badge con anillo SVG de progreso ─────────────────────────────────────
function ScoreBadge({ seg, score, segColor, size = 46 }: { seg: string; score: number; segColor: string; size?: number }) {
  const r = (size - 5) / 2
  const cx = size / 2
  const cy = size / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(score, 100) / 100)
  return (
    <div style={{ position:'relative', width:size, height:size, flexShrink:0 }}>
      <svg width={size} height={size} style={{ position:'absolute', inset:0, transform:'rotate(-90deg)' }}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={`${segColor}20`} strokeWidth={2.5}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={segColor} strokeWidth={2.5}
          strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round"/>
      </svg>
      <div style={{ position:'absolute', inset:0, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:0 }}>
        <span style={{ fontSize: size > 44 ? 18 : 16, fontWeight:900, color:segColor, lineHeight:1 }}>{seg}</span>
        <span style={{ fontSize:8, fontWeight:700, color:segColor, opacity:0.85 }}>{Math.round(score)}</span>
      </div>
    </div>
  )
}

type EstadoDisplay = { label: string; color: string; bg: string; border: string }

function getEstado(c: Cliente): EstadoDisplay {
  if (c.estadoCliente === 'inactivo')
    return { label:'Inactivo',      color:'var(--muted)',     bg:'rgba(107,114,128,0.1)', border:'rgba(107,114,128,0.2)' }
  if ((c.deuda?.deuda_vencida ?? 0) > 0)
    return { label:'Deuda alta',    color:'var(--red-dim)',   bg:'rgba(181,84,62,0.1)',   border:'rgba(181,84,62,0.2)'   }
  const al = c.frecuencia?.alert_level
  if (al === 'critico' || al === 'vencido')
    return { label:'Riesgo',        color:'var(--gold)',      bg:'rgba(245,158,11,0.1)', border:'rgba(245,158,11,0.2)'  }
  const dc = diasDesde(c.ultimoContacto?.fecha)
  if (!c.ultimoContacto || dc === null || dc > 7)
    return { label:'Sin contacto',  color:'var(--muted)',     bg:'rgba(156,163,175,0.1)', border:'rgba(156,163,175,0.2)' }
  return { label:'Al día',          color:'var(--green-dim)', bg:'rgba(52,211,153,0.1)',  border:'rgba(52,211,153,0.2)'  }
}

// waUrl eliminado → se usa WAModal global

const ROWS_PER_PAGE = 10

// ── Donut resumen ─────────────────────────────────────────────────────────────
function DonutResumen({ stats }: { stats: Stats }) {
  const total = stats.total || 1
  const items = [
    { label:'Al día',       count: stats.alDia,        color:'#5A8A4A'  },
    { label:'Riesgo',       count: stats.riesgoCompra, color:'#D4AF37'  },
    { label:'Deuda alta',   count: stats.deudaAlta,    color:'#B5543E'  },
    { label:'Sin contacto', count: stats.sinContacto,  color:'#6B6560'  },
  ]
  let cum = -Math.PI/2
  const R=44; const r=26; const cx=52; const cy=52
  const arcs = items.map(it => {
    const angle = (it.count/total)*2*Math.PI
    if (angle < 0.01) { cum+=angle; return null }
    const x1=cx+R*Math.cos(cum); const y1=cy+R*Math.sin(cum)
    cum+=angle
    const x2=cx+R*Math.cos(cum); const y2=cy+R*Math.sin(cum)
    const x3=cx+r*Math.cos(cum); const y3=cy+r*Math.sin(cum)
    const x4=cx+r*Math.cos(cum-angle); const y4=cy+r*Math.sin(cum-angle)
    return { d:`M ${x1} ${y1} A ${R} ${R} 0 ${angle>Math.PI?1:0} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${angle>Math.PI?1:0} 0 ${x4} ${y4} Z`, color:it.color }
  })

  return (
    <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
      <svg width={104} height={104} viewBox="0 0 104 104" style={{ flexShrink:0 }}>
        {arcs.map((a,i)=> a && <path key={i} d={a.d} fill={a.color}/>)}
      </svg>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5, paddingTop:4 }}>
        {items.map(it=>(
          <div key={it.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ width:7, height:7, borderRadius:'50%', background:it.color }}/>
              <span style={{ fontSize:11, color:'var(--muted)' }}>{it.label}</span>
            </div>
            <span style={{ fontSize:11, fontWeight:700, color:'var(--cream)' }}>
              {it.count} <span style={{ fontSize:10, color:'var(--muted)', fontWeight:400 }}>({Math.round((it.count/total)*100)}%)</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Sidebar ───────────────────────────────────────────────────────────────────
function Sidebar({ stats, actividad, onAlertaClick, onClienteClick }: {
  stats: Stats
  actividad: ActividadItem[]
  onAlertaClick: (filtro: string) => void
  onClienteClick: (nombre: string) => void
}) {
  const ALERTAS = [
    { key:'deuda',       count:stats.deudaAlta,    icon:AlertTriangle, color:'#B5543E', bg:'rgba(181,84,62,0.05)',   border:'rgba(181,84,62,0.2)',   label:`${stats.deudaAlta} clientes`,    sub:'con deuda vencida',                  show: stats.deudaAlta > 0 },
    { key:'sin_contacto',count:stats.sinContacto,  icon:PhoneOff,      color:'#D4AF37', bg:'rgba(245,158,11,0.05)', border:'rgba(245,158,11,0.2)',  label:`${stats.sinContacto} clientes`,  sub:'sin contacto hace más de 7 días',    show: stats.sinContacto > 0 },
    { key:'riesgo',      count:stats.riesgoCompra, icon:Clock,         color:'#D4AF37', bg:'rgba(96,165,250,0.05)', border:'rgba(96,165,250,0.2)',  label:`${stats.riesgoCompra} clientes`, sub:'con riesgo de compra',               show: stats.riesgoCompra > 0 },
  ]

  return (
    <div style={{ width:260, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
      {/* Resumen rápido */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'14px 16px' }}>
        <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', marginBottom:12, letterSpacing:'0.04em' }}>RESUMEN RÁPIDO</p>
        <DonutResumen stats={stats}/>
      </div>

      {/* Actividad reciente */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'14px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
          <Activity size={12} color="#D4AF37"/>
          <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', letterSpacing:'0.04em' }}>ACTIVIDAD RECIENTE</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {actividad.slice(0,6).map((a,i)=>{
            const dc = diasDesde(a.fecha)
            const isContacto = a.tipo === 'contacto'
            return (
              <div key={i} onClick={()=>onClienteClick(a.cliente)}
                style={{ display:'flex', gap:8, alignItems:'flex-start', cursor:'pointer',
                  padding:'4px 6px', borderRadius:8, margin:'0 -6px',
                  transition:'background 0.15s' }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(255,255,255,0.03)')}
                onMouseLeave={e=>(e.currentTarget.style.background='transparent')}>
                <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                  background: isContacto?'rgba(37,211,102,0.1)':'rgba(96,165,250,0.1)' }}>
                  {isContacto ? <MessageCircle size={13} color="#25D366"/> : <Zap size={13} color="#D4AF37"/>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:11, fontWeight:600, color:'var(--cream)' }}>
                    {isContacto ? 'Contacto realizado' : 'Pedido confirmado'}
                  </p>
                  <p style={{ fontSize:10, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {a.cliente}
                  </p>
                  {a.tipo === 'pedido' && (
                    <p style={{ fontSize:9, color:'#D4AF37', fontWeight:600 }}>{a.detalle}</p>
                  )}
                </div>
                <span style={{ fontSize:9, color:'#555', flexShrink:0, marginTop:2 }}>{fDias(dc)}</span>
              </div>
            )
          })}
          {actividad.length === 0 && <p style={{ fontSize:11, color:'var(--muted)' }}>Sin actividad reciente</p>}
        </div>
      </div>

      {/* Alertas importantes */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'14px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
          <Bell size={12} color="#D4AF37"/>
          <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', letterSpacing:'0.04em' }}>ALERTAS IMPORTANTES</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {ALERTAS.filter(a=>a.show).map(a=>(
            <button key={a.key} onClick={()=>onAlertaClick(a.key)}
              style={{ display:'flex', gap:10, alignItems:'center', background:a.bg, border:`1px solid ${a.border}`,
                borderRadius:10, padding:'10px 12px', cursor:'pointer', width:'100%', textAlign:'left',
                transition:'all 0.15s' }}
              onMouseEnter={e=>{e.currentTarget.style.background=a.bg.replace('0.05','0.1');e.currentTarget.style.borderColor=a.color.replace(')','') + (a.color.includes('#')?'80':'')}}
              onMouseLeave={e=>{e.currentTarget.style.background=a.bg;e.currentTarget.style.borderColor=a.border}}>
              <a.icon size={14} color={a.color}/>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:12, fontWeight:700, color:'var(--cream)' }}>{a.label}</p>
                <p style={{ fontSize:10, color:'var(--muted)' }}>{a.sub}</p>
              </div>
              <ChevronRight size={12} color={a.color}/>
            </button>
          ))}
          {ALERTAS.every(a=>!a.show) && (
            <p style={{ fontSize:12, color:'#5A8A4A', fontWeight:600, textAlign:'center', padding:'8px 0' }}>
              ✓ Sin alertas críticas
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fila de tabla (rediseñada) ────────────────────────────────────────────────
function ClienteRow({ c, onClick, onWA }: { c: Cliente; onClick: () => void; onWA: (t:WATarget)=>void }) {
  const estado    = getEstado(c)
  const seg       = c.frecuencia?.segmento ?? 'E'
  const score     = c.frecuencia?.score ?? 0
  const segColor  = SEG_COLOR[seg] ?? '#888'
  const vendColor = VEND_COLOR[vendedorCanonico(c.vendedor)] ?? '#888'
  const dcont     = diasDesde(c.ultimoContacto?.fecha)
  const siguComp  = c.frecuencia?.siguiente_compra_estimada
  const deuda     = c.deuda?.deuda_vencida ?? 0
  const saldo     = c.deuda?.saldo_total ?? 0
  const al        = c.frecuencia?.alert_level ?? 'sin_historial'
  const diasSin   = c.frecuencia?.dias_sin_compra ?? 0

  const alertBorderColor = al === 'critico' ? '#B5543E'
    : al === 'vencido' ? '#B5543E'
    : al === 'proximo'  ? '#D4AF37'
    : 'transparent'

  return (
    <tr onClick={onClick} style={{
      borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer',
      borderLeft:`3px solid ${alertBorderColor}`,
    }}>
      {/* Cliente + Score */}
      <td style={{ padding:'10px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <ScoreBadge seg={seg} score={score} segColor={segColor} size={44}/>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:13, fontWeight:700, color:'var(--cream)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>
              {c.nombre_fantasia}
            </p>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
              <span style={{ fontSize:10, color:vendColor, fontWeight:700 }}>{vendedorCanonico(c.vendedor).split(' ')[0]}</span>
              {(c.localidad_entrega || c.localidad) && (
                <span style={{ fontSize:10, color:'#555' }}>· {formatLocalidad(c.localidad_entrega || c.localidad)}</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Ruta */}
      <td style={{ padding:'10px 8px' }}>
        <span style={{ fontSize:11, color: c.ruta_despacho ? 'var(--cream)' : '#444', fontWeight: c.ruta_despacho ? 600 : 400 }}>
          {c.ruta_despacho || '—'}
        </span>
      </td>

      {/* Último pedido + Días sin */}
      <td style={{ padding:'10px 8px' }}>
        {c.ultimoPedido ? (
          <div>
            <p style={{ fontSize:11, color:'var(--cream)', fontWeight:600, marginBottom:2 }}>{fFecha(c.ultimoPedido.ultimaFecha)}</p>
            {diasSin > 0 && (
              <span style={{ fontSize:10, fontWeight:700, color:alertBorderColor !== 'transparent' ? alertBorderColor : '#555' }}>
                {diasSin}d sin comprar
              </span>
            )}
          </div>
        ) : <span style={{ fontSize:11, color:'#444' }}>Sin pedidos</span>}
      </td>

      {/* Deuda */}
      <td style={{ padding:'10px 8px' }}>
        {saldo > 0 ? (
          <div>
            <p style={{ fontSize:12, fontWeight:800, color: deuda>0 ? '#B5543E' : '#5A8A4A' }}>{fPeso(saldo)}</p>
            {deuda > 0 && <p style={{ fontSize:10, color:'#B5543E' }}>vcda {fPeso(deuda)}</p>}
          </div>
        ) : <span style={{ fontSize:11, color:'#444' }}>—</span>}
      </td>

      {/* Quiebre stock */}
      <td style={{ padding:'10px 8px' }}>
        {siguComp ? (() => {
          const past = esPasada(siguComp)
          const qColor = past ? '#EF4444' : '#5A8A4A'
          return (
            <div>
              <p style={{ fontSize:11, color: past ? '#EF4444' : 'var(--cream)', fontWeight:600, marginBottom:2 }}>{fFecha(siguComp)}</p>
              <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10,
                background: past ? 'rgba(239,68,68,0.1)' : 'rgba(52,211,153,0.12)',
                color:qColor, fontWeight:700 }}>
                {past ? '⚠ vencido' : '▸ estimado'}
              </span>
            </div>
          )
        })() : <span style={{ fontSize:11, color:'#444' }}>—</span>}
      </td>

      {/* Contacto + WA */}
      <td style={{ padding:'10px 8px' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <button onClick={()=>onWA({ nombre:c.nombre_fantasia??'', telefono:c.telefono, contexto:'general', cicloPromedioDias:c.frecuencia?.ciclo_promedio_dias, siguienteCompra:c.frecuencia?.siguiente_compra_estimada, subtitulo:c.categoria??undefined })}
            style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8,
              background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.2)',
              color:'#25D366', fontSize:11, fontWeight:700, cursor:'pointer', width:'fit-content' }}>
            <MessageCircle size={13}/> WhatsApp
          </button>
          <span style={{ fontSize:10, fontWeight:600,
            color: dcont !== null && dcont <= 3 ? '#4ADE80' : dcont !== null && dcont <= 7 ? '#FBBF24' : '#EF4444' }}>
            {c.ultimoContacto ? fDias(dcont) : 'Sin contacto'}
          </span>
        </div>
      </td>

      {/* Estado */}
      <td style={{ padding:'10px 8px' }}>
        <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20,
          color:estado.color, background:estado.bg, border:`1px solid ${estado.border}`, whiteSpace:'nowrap' }}>
          {estado.label}
        </span>
      </td>

      {/* Ver ficha */}
      <td style={{ padding:'10px 8px', textAlign:'center' }} onClick={e=>e.stopPropagation()}>
        <button onClick={onClick}
          style={{ background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)',
            borderRadius:8, padding:'5px 10px', cursor:'pointer', color:'var(--muted)', fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
          Ver →
        </button>
      </td>
    </tr>
  )
}


// ── Ficha comercial móvil (CRM navy) ──────────────────────────────────────────
function fLitros(n: number): string {
  return `${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })} L`
}

// Iniciales del avatar: primera letra del nombre de fantasía (o "?" si falta).
function inicialAvatar(nombre: string | null): string {
  const n = (nombre ?? '').trim()
  return n ? n[0].toUpperCase() : '?'
}

function StockClienteCard({ c, onClick, onWA }: { c: Cliente; onClick: () => void; onWA: (t:WATarget)=>void }) {
  const stock    = calcularStock(c.frecuencia)
  const diasSin  = c.frecuencia?.dias_sin_compra ?? 0
  const deudaV   = c.deuda?.deuda_vencida ?? 0
  const nuevo    = esClienteNuevo(c.frecuencia)
  // Cliente de temporada fuera de su temporada: se pinta neutro (gris) y se
  // rotula "Temporada baja". Que no compre ahora es su patrón normal — pintarlo
  // en rojo llenaba la lista del vendedor de falsas urgencias cada invierno.
  const enTemporadaBaja = !!stock?.temporadaBaja

  // El avatar y la barra de stock reflejan el estado REAL de la banda (verde/
  // ámbar/naranja/rojo) tal como lo calcula calcularStock — "Nuevo" es sólo
  // una etiqueta encima, no cambia el color de estos dos (un cliente nuevo con
  // ciclo ya calculado sigue mostrando su banda real, como en el mockup).
  const avatarColor = !stock || enTemporadaBaja
    ? { fg: MC.muted, bg: 'rgba(15,23,42,0.07)' }
    : BAND_COLOR[stock.band ?? 'verde']

  // La etiqueta SÍ prioriza "Nuevo" sobre el riesgo: con 1-2 pedidos casi nunca
  // hay ciclo calculado todavía, y "Sin historial" es mucho menos útil para el
  // vendedor que saber que es un cliente nuevo.
  const badgeColor = nuevo
    ? { fg: MC.blue, bg: MC.blueBg }
    : !stock
      ? { fg: MC.muted, bg: 'rgba(15,23,42,0.07)' }
      : enTemporadaBaja
        ? { fg: MC.muted, bg: 'rgba(15,23,42,0.07)' }
        : riesgoDeBand(stock.band) === 'alto' ? { fg: MC.red, bg: MC.redBg }
        : riesgoDeBand(stock.band) === 'medio' ? { fg: MC.amber, bg: MC.amberBg }
        : { fg: MC.green, bg: MC.greenBg }
  const badgeLabel = nuevo
    ? 'Nuevo'
    : !stock
      ? 'Sin historial'
      : enTemporadaBaja
        ? 'Temporada baja'
        : riesgoDeBand(stock.band) === 'alto' ? 'Riesgo alto'
        : riesgoDeBand(stock.band) === 'medio' ? 'Riesgo medio'
        : 'Sin riesgo'

  const waTarget: WATarget = { nombre:c.nombre_fantasia??'', telefono:c.telefono, contexto:'general', cicloPromedioDias:c.frecuencia?.ciclo_promedio_dias, siguienteCompra:c.frecuencia?.siguiente_compra_estimada, subtitulo:c.categoria??undefined }

  // Barra: % de stock restante respecto al ciclo completo (100% = recién comprado)
  const ciclo = c.frecuencia?.ciclo_promedio_dias ?? 0
  const pct = stock && ciclo > 0 ? Math.max(0, Math.min(100, Math.round((stock.diasRestantes / ciclo) * 100))) : 0

  return (
    <div onClick={onClick} style={{
      background:MC.card, borderRadius:16, marginBottom:10, cursor:'pointer',
      border:`1px solid ${MC.border}`, boxShadow:'0 1px 2px rgba(15,23,42,0.04)',
      padding:'12px 14px',
    }}>
      {/* Cabecera: avatar + nombre/localidad·vendedor + badge + chevron */}
      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:40, height:40, borderRadius:'50%', flexShrink:0,
          display:'flex', alignItems:'center', justifyContent:'center',
          background:avatarColor.bg, color:avatarColor.fg, fontSize:16, fontWeight:800 }}>
          {inicialAvatar(c.nombre_fantasia)}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:15, fontWeight:800, color:MC.text,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {c.nombre_fantasia}
          </p>
          <p style={{ fontSize:12, color:MC.muted, marginTop:1,
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {(c.localidad_entrega || c.localidad) ? formatLocalidad(c.localidad_entrega || c.localidad) : '—'}
            {' · '}{vendedorCanonico(c.vendedor).split(' ')[0]}
          </p>
        </div>
        <span style={{ fontSize:11, fontWeight:700, padding:'5px 11px', borderRadius:20, flexShrink:0,
          color:badgeColor.fg, background:badgeColor.bg }}>
          {badgeLabel}
        </span>
        <ChevronRight size={16} color={MC.muted} style={{ flexShrink:0 }}/>
      </div>

      {/* Deuda vencida (si aplica) — no está en el mockup porque ninguno de sus
          ejemplos tiene deuda, pero es información crítica que no se puede perder. */}
      {deudaV > 0 && (
        <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:8 }}>
          <AlertTriangle size={11} color={MC.red}/>
          <span style={{ fontSize:11, fontWeight:700, color:MC.red }}>Deuda vencida: {fPeso(deudaV)}</span>
        </div>
      )}

      {/* Fila de datos: Stock · Últ. pedido · Total + acciones */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:12 }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:6, minWidth:0 }}>
          <Archive size={15} color={MC.muted} style={{ flexShrink:0, marginTop:1 }}/>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:10, color:MC.muted, marginBottom:1 }}>Stock</p>
            <p style={{ fontSize:13, fontWeight:800, color: stock ? (stock.agotado ? MC.red : MC.text) : MC.muted, whiteSpace:'nowrap' }}>
              {stock ? (stock.agotado ? 'Agotado' : `${stock.diasRestantes} días`) : '—'}
            </p>
            {stock && (
              <div style={{ width:44, height:4, borderRadius:2, background:'rgba(15,23,42,0.08)', overflow:'hidden', marginTop:4 }}>
                <div style={{ height:'100%', width:`${stock.agotado ? 100 : pct}%`, background:avatarColor.fg }}/>
              </div>
            )}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'flex-start', gap:6, minWidth:0 }}>
          <BarChart3 size={15} color={MC.muted} style={{ flexShrink:0, marginTop:1 }}/>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:10, color:MC.muted, marginBottom:1 }}>Últ. pedido</p>
            <p style={{ fontSize:13, fontWeight:800, color: c.ultimoPedido ? MC.text : MC.muted, whiteSpace:'nowrap' }}>
              {c.ultimoPedido ? fFecha(c.ultimoPedido.ultimaFecha) : '—'}
            </p>
            {diasSin > 0 && <p style={{ fontSize:10, color:MC.muted, marginTop:1, whiteSpace:'nowrap' }}>{diasSin}d sin comprar</p>}
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'flex-start', gap:6, minWidth:0, flex:1 }}>
          <Package size={15} color={MC.muted} style={{ flexShrink:0, marginTop:1 }}/>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:10, color:MC.muted, marginBottom:1 }}>Total</p>
            <p style={{ fontSize:13, fontWeight:800, color:MC.text, whiteSpace:'nowrap' }}>{fLitros(c.frecuencia?.litros_totales ?? 0)}</p>
            <p style={{ fontSize:10, color:MC.muted, marginTop:1, whiteSpace:'nowrap' }}>{fPeso(c.frecuencia?.revenue_total ?? 0)}</p>
          </div>
        </div>

        {/* Acciones: WhatsApp y llamada, botones circulares */}
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={e=>{e.stopPropagation();onWA(waTarget)}} aria-label="WhatsApp"
            style={{ width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              background:MC.greenBg, border:'none', color:MC.whatsapp, cursor:'pointer' }}>
            <MessageCircle size={16}/>
          </button>
          {c.telefono ? (
            <a href={`tel:${c.telefono}`} onClick={e=>e.stopPropagation()} aria-label="Llamar"
              style={{ width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
                background:'rgba(15,23,42,0.06)', color:MC.text }}>
              <Phone size={16}/>
            </a>
          ) : (
            <span style={{ width:36, height:36, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center',
              background:'rgba(15,23,42,0.04)', color:'#CBD5E1' }}>
              <Phone size={16}/>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Modal Campaña WA ──────────────────────────────────────────────────────────
function CampanaWAModal({ clientes, onClose }: { clientes: Cliente[]; onClose: () => void }) {
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
  const conTelefono = clientes.filter(c => c.telefono)
  const sinTelefono = clientes.filter(c => !c.telefono)

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:1000,
      display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#141414', border:'1px solid var(--border)', borderRadius:20,
        padding:'24px', maxWidth:480, width:'100%', maxHeight:'80vh', overflow:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <h2 style={{ fontSize:16, fontWeight:900, color:'var(--cream)' }}>Campaña WhatsApp</h2>
            <p style={{ fontSize:11, color:'var(--muted)' }}>{conTelefono.length} clientes con teléfono</p>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)' }}>
            <X size={18}/>
          </button>
        </div>

        <p style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
          Haz clic en cada cliente para abrir WhatsApp con un mensaje personalizado:
        </p>

        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {conTelefono.slice(0, 20).map(c => (
            <button key={c.id}
              onClick={()=>setWaTarget({ nombre:c.nombre_fantasia??'', telefono:c.telefono, contexto:'campana', subtitulo:c.categoria??undefined })}
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'10px 14px', background:'rgba(255,255,255,0.03)',
                border:'1px solid var(--border)', borderRadius:10, cursor:'pointer', width:'100%', textAlign:'left' }}>
              <div>
                <p style={{ fontSize:12, fontWeight:600, color:'var(--cream)' }}>{c.nombre_fantasia}</p>
                <p style={{ fontSize:10, color:'var(--muted)' }}>{c.telefono}</p>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:5, color:'#25D366', fontSize:11, fontWeight:700 }}>
                <MessageCircle size={14}/> Editar y enviar
              </div>
            </button>
          ))}
          {waTarget && <WAModal target={waTarget} onClose={()=>setWaTarget(null)}/>}
          {conTelefono.length > 20 && (
            <p style={{ fontSize:11, color:'var(--muted)', textAlign:'center', padding:8 }}>
              +{conTelefono.length-20} clientes más
            </p>
          )}
          {sinTelefono.length > 0 && (
            <p style={{ fontSize:11, color:'var(--muted)', textAlign:'center', paddingTop:8, borderTop:'1px solid var(--border)' }}>
              {sinTelefono.length} clientes sin teléfono registrado
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function ClientesClient({ clientes, periodo, totalesPorVendedor, stats, actividad, isAdmin, vendedoresScope, scoringCaido }: Props) {
  const isDesktop = useIsDesktop()
  const router    = useRouter()
  const { user }  = useUser()

  const [busqueda,    setBusqueda]    = useState(() => typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('q') ?? '' : '')
  const [vendFiltro,  setVendFiltro]  = useState<string>('all')
  const [estadoFiltro,setEstadoFiltro]= useState<string>('todos')
  const [sortBy,      setSortBy]      = useState<'recientes'|'score'|'nombre'|'deuda'>('recientes')
  const [pagina,      setPagina]      = useState(1)
  const [showWA,      setShowWA]      = useState(false)
  const [showSort,    setShowSort]    = useState(false)
  const [waTarget,    setWaTarget]    = useState<WATarget | null>(null)
  const [riesgoFiltro,setRiesgoFiltro]= useState<'todos'|'alto'|'medio'|'bajo'|'nuevo'>('todos')
  const [showFiltroSheet, setShowFiltroSheet] = useState(false)
  // "Última actualización" — se calcula en el cliente para no desfasar el SSR
  // (el server renderiza a la hora del build/revalidate, no la del visitante).
  const [horaActualizado, setHoraActualizado] = useState('')
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHoraActualizado(new Date().toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' }))
  }, [])

  // Si llegamos con ?q=NombreExacto (ej. desde "Clientes en riesgo" o un lead
  // del mapa) y hay un único match exacto, saltar directo a su ficha.
  useEffect(() => {
    if (!busqueda.trim()) return
    const b = busqueda.trim().toLowerCase()
    const exactos = clientes.filter(c => c.nombre_fantasia?.toLowerCase() === b)
    if (exactos.length === 1) router.replace(`/ventas/clientes/${exactos[0].id}`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Chips de filtro con conteos
  const FILTROS = [
    { key:'todos',       label:`Todos`,       count: stats.total,        color:'var(--cream)', icon: null },
    { key:'contactados', label:'Contactados', count: stats.contactados7d, color:'#5A8A4A',     icon:'✓'  },
    { key:'deuda',       label:'Deuda',       count: stats.deudaAlta,    color:'#B5543E',     icon:'⚠'  },
    { key:'pendientes',  label:'Pendientes',  count: stats.pendientes,    color:'#D4AF37',     icon:'⚠'  },
    { key:'sin_contacto',label:'Sin contacto',count: stats.sinContacto,   color:'#9CA3AF',     icon:'✕'  },
    { key:'riesgo',      label:'Riesgo compra',count:stats.riesgoCompra,  color:'#B5543E',     icon:'🔴' },
  ]

  // Filtrar y ordenar
  const clientesFiltrados = useMemo(() => {
    // vendedorCanonico (no VENDEDOR_DISPLAY/VENDEDOR_GRUPOS, que son para
    // ventas.vendedor_actual y no reconocen "Nicol Delgado"/"Marion Meza" como
    // claves): unifica clientes.vendedor ("Los Rios", "Los Lagos", nombres
    // viejos del ERP) con el nombre vigente de quien atiende esa cartera hoy.
    const vendEfectivo = isAdmin ? vendFiltro : vendedorCanonico(user?.nombre ?? '')
    let res = clientes.filter(c => c.estadoCliente !== 'inactivo')

    if (vendEfectivo !== 'all')
      res = res.filter(c => vendedorCanonico(c.vendedor ?? '') === vendEfectivo)

    if (busqueda.trim()) {
      const b = busqueda.toLowerCase()
      res = res.filter(c =>
        c.nombre_fantasia?.toLowerCase().includes(b) ||
        c.ruta_despacho?.toLowerCase().includes(b) ||
        c.localidad?.toLowerCase().includes(b) ||
        c.localidad_entrega?.toLowerCase().includes(b)
      )
    }

    if (estadoFiltro !== 'todos') {
      res = res.filter(c => {
        const estado = getEstado(c)
        const al = c.frecuencia?.alert_level
        const dc = diasDesde(c.ultimoContacto?.fecha)
        switch (estadoFiltro) {
          case 'contactados':  return dc !== null && dc <= 7
          case 'pendientes':   return ['critico','vencido','proximo'].includes(al??'') && (dc===null||dc>3)
          case 'sin_contacto': return !c.ultimoContacto || dc===null || dc > 7
          case 'riesgo':       return al==='critico'||al==='vencido'
          case 'deuda':        return (c.deuda?.deuda_vencida ?? 0) > 0
          default: return true
        }
      })
    }

    if (!isDesktop && riesgoFiltro === 'nuevo') {
      res = res.filter(c => esClienteNuevo(c.frecuencia))
    } else if (!isDesktop && riesgoFiltro !== 'todos') {
      res = res.filter(c => {
        const s = calcularStock(c.frecuencia)
        return riesgoDeBand(s?.band ?? null, s?.temporadaBaja) === riesgoFiltro
      })
    }

    res = [...res].sort((a, b) => {
      switch (sortBy) {
        case 'score':    return (b.frecuencia?.score??0) - (a.frecuencia?.score??0)
        case 'nombre':   return (a.nombre_fantasia??'').localeCompare(b.nombre_fantasia??'')
        case 'deuda':    return (b.deuda?.deuda_vencida??0) - (a.deuda?.deuda_vencida??0)
        default: {
          const da = diasDesde(a.ultimoPedido?.ultimaFecha) ?? 9999
          const db = diasDesde(b.ultimoPedido?.ultimaFecha) ?? 9999
          return da - db
        }
      }
    })

    return res
  }, [clientes, busqueda, vendFiltro, estadoFiltro, riesgoFiltro, sortBy, isAdmin, isDesktop, user])

  // Conteos de los chips de riesgo (móvil) — sobre búsqueda/vendedor aplicados,
  // pero SIN el propio filtro de riesgo, para que los conteos no cambien al elegir uno.
  const riesgoCounts = useMemo(() => {
    const vendEfectivo = isAdmin ? vendFiltro : vendedorCanonico(user?.nombre ?? '')
    let base = clientes.filter(c => c.estadoCliente !== 'inactivo')
    if (vendEfectivo !== 'all') base = base.filter(c => vendedorCanonico(c.vendedor ?? '') === vendEfectivo)
    if (busqueda.trim()) {
      const b = busqueda.toLowerCase()
      base = base.filter(c =>
        c.nombre_fantasia?.toLowerCase().includes(b) ||
        c.ruta_despacho?.toLowerCase().includes(b) ||
        c.localidad?.toLowerCase().includes(b) ||
        c.localidad_entrega?.toLowerCase().includes(b)
      )
    }
    const counts = { todos: base.length, alto: 0, medio: 0, bajo: 0, nuevo: 0 }
    for (const c of base) {
      if (esClienteNuevo(c.frecuencia)) counts.nuevo++
      const s = calcularStock(c.frecuencia)
      counts[riesgoDeBand(s?.band ?? null, s?.temporadaBaja)]++
    }
    return counts
  }, [clientes, busqueda, vendFiltro, isAdmin, user])

  // Paginación
  const totalPaginas = Math.ceil(clientesFiltrados.length / ROWS_PER_PAGE)
  const clientesPagina = clientesFiltrados.slice((pagina-1)*ROWS_PER_PAGE, pagina*ROWS_PER_PAGE)
  const irPagina = useCallback((p: number) => setPagina(Math.max(1, Math.min(p, totalPaginas))), [totalPaginas])

  // Reset página al cambiar filtros
  const handleFiltro = (f: string) => { setEstadoFiltro(f); setPagina(1) }
  const handleBusqueda = (v: string) => { setBusqueda(v); setPagina(1) }
  const handleVend = (v: string) => { setVendFiltro(v); setPagina(1) }

  const SORT_LABELS: Record<string, string> = { recientes:'Más recientes', score:'Mayor score', nombre:'A → Z', deuda:'Mayor deuda' }

  return (
    <div style={{ padding: isDesktop?'24px 28px 60px':'16px 16px 100px', maxWidth: isDesktop?1400:640, margin:'0 auto', width:'100%' }}>

      {/* ── Encabezado estándar ────────────────────────────────────────── */}
      <AppHeader eyebrow={`Cartera${periodo ? ` · ${periodo.nombre}` : ''}`} title="Clientes" />

      {/* Sin scoring, las columnas de ciclo y días sin comprar quedan vacías.
          Un vacío sin explicación se lee como "este cliente no compra hace
          nada", que es lo contrario de lo que pasa. */}
      {scoringCaido && (
        <div role="alert" style={{
          display:'flex', alignItems:'flex-start', gap:10, marginBottom:14,
          padding:'12px 14px', borderRadius:12,
          background:'rgba(248,113,113,0.10)', border:'1px solid rgba(248,113,113,0.28)',
        }}>
          <AlertTriangle size={16} color="#F87171" style={{ flexShrink:0, marginTop:1 }} />
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:13, fontWeight:800, color:'#F87171' }}>Sin datos de comportamiento de compra</p>
            <p style={{ fontSize:12, color:'var(--muted)', marginTop:2, lineHeight:1.45 }}>
              El cálculo de ciclo, días sin comprar y score superó el tiempo límite.
              Los clientes y sus ventas sí son correctos; lo que falta es el análisis.
            </p>
          </div>
        </div>
      )}

      {isDesktop && (
        <>
          <div style={{ display:'flex', justifyContent:'flex-end', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:10 }}>
            <div style={{ display:'flex', gap:10 }}>
              <button onClick={()=>setShowWA(true)}
                style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px',
                  background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.25)',
                  borderRadius:10, color:'#25D366', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                <Zap size={14}/> Campaña WA
              </button>
              {isAdmin && (
                <button onClick={()=>router.push('/ventas/admin')}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 16px',
                    background:'var(--gold)', border:'none',
                    borderRadius:10, color:'#080808', fontSize:12, fontWeight:800, cursor:'pointer' }}>
                  + Nuevo cliente
                </button>
              )}
            </div>
          </div>

          {/* ── KPI Cards ──────────────────────────────────────────────── */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:20 }}>
            {[
              { icon:Users,          label:'TOTAL CLIENTES',      val:stats.total,        sub:'100% cartera activa', color:'#D4AF37' },
              { icon:CheckCircle2,   label:'CONTACTADOS (7d)',     val:stats.contactados7d, sub:`${Math.round((stats.contactados7d/Math.max(stats.total,1))*100)}% del total`, color:'#5A8A4A' },
              { icon:Clock,          label:'PENDIENTES CONTACTO',  val:stats.pendientes,   sub:`${Math.round((stats.pendientes/Math.max(stats.total,1))*100)}% del total`, color:'#D4AF37' },
              { icon:PhoneOff,       label:'SIN CONTACTO',         val:stats.sinContacto,  sub:`${Math.round((stats.sinContacto/Math.max(stats.total,1))*100)}% del total`, color:'#9CA3AF' },
            ].map(k=>(
              <div key={k.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'14px 16px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
                  <k.icon size={13} color={k.color}/>
                  <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:'0.08em' }}>{k.label}</span>
                </div>
                <p style={{ fontSize:28, fontWeight:900, color:'var(--cream)', letterSpacing:'-1px', lineHeight:1, marginBottom:4 }}>{k.val}</p>
                <p style={{ fontSize:11, color:'var(--muted)' }}>{k.sub}</p>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── Cabecera CRM móvil (navy) ─────────────────────────────────────── */}
      {!isDesktop && (
        <div style={{ background:MC.bg, margin:'0 -16px', padding:'0 16px 4px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:2, gap:8 }}>
            <p style={{ fontSize:11, color:MC.muted, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', minWidth:0 }}>
              Actualizado: {horaActualizado ? `hoy ${horaActualizado}` : '—'}
            </p>
            <div style={{ display:'flex', gap:6, flexShrink:0 }}>
              <button onClick={()=>setShowFiltroSheet(true)}
                style={{ display:'flex', alignItems:'center', gap:4, padding:'8px 10px', whiteSpace:'nowrap',
                  background:MC.card, border:`1px solid ${MC.border}`, borderRadius:10,
                  color:MC.text, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                <Filter size={13}/> Filtrar
              </button>
              <button onClick={()=>setShowWA(true)} aria-label="Campaña WhatsApp"
                style={{ display:'flex', alignItems:'center', justifyContent:'center', width:36, height:36,
                  background:MC.card, border:`1px solid ${MC.border}`, borderRadius:10,
                  color:MC.whatsapp, cursor:'pointer', flexShrink:0 }}>
                <Zap size={15}/>
              </button>
              <div style={{ position:'relative' }}>
                <button onClick={()=>setShowSort(s=>!s)}
                  style={{ display:'flex', alignItems:'center', gap:4, padding:'8px 10px', whiteSpace:'nowrap',
                    background:MC.card, border:`1px solid ${MC.border}`, borderRadius:10,
                    color:MC.text, fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  <ChevronDown size={13}/> Ordenar
                </button>
                {showSort && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:50,
                    background:MC.card, border:`1px solid ${MC.border}`, borderRadius:12, overflow:'hidden', minWidth:150 }}>
                    {Object.entries(SORT_LABELS).map(([k,l])=>(
                      <button key={k} onClick={()=>{setSortBy(k as typeof sortBy);setShowSort(false)}}
                        style={{ display:'block', width:'100%', padding:'10px 14px', textAlign:'left',
                          background:sortBy===k?MC.blueBg:'transparent', border:'none',
                          color:sortBy===k?MC.blue:MC.text, fontSize:12, cursor:'pointer' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Buscador */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:12, marginBottom:12,
            background:MC.card, border:`1px solid ${MC.border}`, borderRadius:12, padding:'11px 14px' }}>
            <Search size={16} color={MC.muted}/>
            <input value={busqueda} onChange={e=>handleBusqueda(e.target.value)}
              placeholder="Buscar cliente…"
              style={{ border:'none', background:'transparent', color:MC.text, fontSize:14,
                outline:'none', flex:1, minWidth:0 }}/>
            {busqueda && <button onClick={()=>handleBusqueda('')} style={{ background:'none', border:'none', cursor:'pointer', color:MC.muted, padding:0 }}><X size={14}/></button>}
          </div>

          {/* Macros por vendedor (solo admin) — filtro rápido de cartera */}
          {isAdmin && (
            <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:10 }}>
              {[{ key:'all', label:'Todos los vendedores' }, ...VENDEDORES_CARTERA_ACTIVAS.map(v => ({ key:v, label:v.split(' ')[0] }))].map(v=>{
                const active = vendFiltro===v.key
                const vendColor = v.key==='all' ? MC.text : (VEND_COLOR[v.key] ?? MC.blue)
                return (
                  <button key={v.key} onClick={()=>handleVend(v.key)}
                    style={{ flexShrink:0, padding:'7px 13px', borderRadius:20, cursor:'pointer',
                      border:`1px solid ${active?vendColor:MC.border}`,
                      background: active ? `${vendColor}22` : MC.card,
                      color: active ? vendColor : MC.muted,
                      fontSize:12, fontWeight:active?800:600 }}>
                    {v.label}
                  </button>
                )
              })}
            </div>
          )}

          {/* Chips de riesgo */}
          <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:14, marginBottom:2 }}>
            {[
              { key:'todos' as const, label:'Todos', count:riesgoCounts.todos, color:MC.blue },
              { key:'nuevo' as const, label:'Nuevos', count:riesgoCounts.nuevo, color:MC.blue },
              { key:'alto'  as const, label:'Riesgo alto',  count:riesgoCounts.alto,  color:MC.red },
              { key:'medio' as const, label:'Riesgo medio', count:riesgoCounts.medio, color:MC.amber },
              { key:'bajo'  as const, label:'Sin riesgo',   count:riesgoCounts.bajo,  color:MC.green },
            ].map(f=>{
              const active = riesgoFiltro===f.key
              return (
                <button key={f.key} onClick={()=>{setRiesgoFiltro(f.key);setPagina(1)}}
                  style={{ flexShrink:0, display:'flex', alignItems:'center', gap:6, padding:'9px 14px', borderRadius:12,
                    cursor:'pointer', border:`1px solid ${active?f.color:MC.border}`,
                    background: active ? f.color : MC.card, color: active ? '#FFFFFF' : MC.text,
                    fontSize:13, fontWeight:active?800:600 }}>
                  {f.label}
                  <span style={{ fontSize:12, fontWeight:800, padding:'0 6px', borderRadius:8,
                    background: active ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.06)',
                    color: active ? '#FFFFFF' : MC.muted }}>
                    {f.count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Sheet de filtros adicionales */}
          {showFiltroSheet && (
            <div onClick={()=>setShowFiltroSheet(false)} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', zIndex:1000, display:'flex', alignItems:'flex-end' }}>
              <div onClick={e=>e.stopPropagation()} style={{ background:MC.card, borderRadius:'20px 20px 0 0', padding:'20px 16px calc(20px + env(safe-area-inset-bottom, 0px))', width:'100%', maxHeight:'70vh', overflow:'auto' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                  <p style={{ fontSize:15, fontWeight:800, color:MC.text }}>Filtros</p>
                  <button onClick={()=>setShowFiltroSheet(false)} style={{ background:'none', border:'none', cursor:'pointer', color:MC.muted }}><X size={18}/></button>
                </div>

                {/* El filtro por vendedor vive como macro siempre visible arriba
                    de los chips de riesgo, no acá — no duplicar el selector. */}

                <p style={{ fontSize:11, color:MC.muted, fontWeight:700, letterSpacing:'0.04em', marginBottom:8 }}>ESTADO DE CONTACTO</p>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:18 }}>
                  {FILTROS.map(f=>{
                    const active = estadoFiltro===f.key
                    return (
                      <button key={f.key} onClick={()=>handleFiltro(f.key)}
                        style={{ padding:'8px 14px', borderRadius:10, cursor:'pointer',
                          border:`1px solid ${active?MC.blue:MC.border}`,
                          background:active?MC.blueBg:'transparent', color:active?MC.blue:MC.text,
                          fontSize:13, fontWeight:active?700:500 }}>
                        {f.label} <span style={{ opacity:0.7 }}>{f.count}</span>
                      </button>
                    )
                  })}
                </div>

                <button onClick={()=>{setEstadoFiltro('todos');setVendFiltro('all');setRiesgoFiltro('todos');setPagina(1)}}
                  style={{ width:'100%', padding:'12px', borderRadius:12, border:`1px solid ${MC.border}`,
                    background:'transparent', color:MC.muted, fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  Limpiar todos los filtros
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Layout desktop: tabla + sidebar ────────────────────────────── */}
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

        {/* ── Columna principal ─────────────────────────────────────────── */}
        <div style={{ flex:1, minWidth:0 }}>

          {isDesktop && <>
          {/* Barra de filtros */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px', marginBottom:12 }}>
            <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
              {/* Búsqueda */}
              <div style={{ display:'flex', alignItems:'center', gap:8, flex:'1 1 200px', minWidth:160,
                background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', borderRadius:10, padding:'7px 12px' }}>
                <Search size={14} color="var(--muted)"/>
                <input value={busqueda} onChange={e=>{handleBusqueda(e.target.value)}}
                  placeholder="Buscar cliente, ciudad, ruta…"
                  style={{ border:'none', background:'transparent', color:'var(--cream)', fontSize:12,
                    outline:'none', flex:1, minWidth:0 }}/>
                {busqueda && <button onClick={()=>handleBusqueda('')} style={{ background:'none', border:'none', cursor:'pointer', color:'var(--muted)', padding:0 }}><X size={12}/></button>}
              </div>

              {/* Vendedor tabs (solo admin) */}
              {isAdmin && (
                <div style={{ display:'flex', gap:4, background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', borderRadius:10, padding:'3px' }}>
                  {['all', ...vendedoresScope].map(v=>{
                    const label = v==='all' ? 'Todos' : v
                    const active = vendFiltro===v
                    return (
                      <button key={v} onClick={()=>handleVend(v)}
                        style={{ padding:'5px 12px', borderRadius:8, cursor:'pointer', border:'none',
                          background:active?'var(--gold)':'transparent', color:active?'#080808':'var(--muted)',
                          fontSize:12, fontWeight:active?800:500 }}>
                        {label}
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Ordenar */}
              <div style={{ position:'relative' }}>
                <button onClick={()=>setShowSort(s=>!s)}
                  style={{ display:'flex', alignItems:'center', gap:6, padding:'7px 12px',
                    background:'rgba(255,255,255,0.04)', border:'1px solid var(--border)', borderRadius:10,
                    color:'var(--muted)', fontSize:11, cursor:'pointer', whiteSpace:'nowrap' }}>
                  <Filter size={12}/> {SORT_LABELS[sortBy]} <ChevronDown size={12}/>
                </button>
                {showSort && (
                  <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:50,
                    background:'#1a1a1a', border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', minWidth:160 }}>
                    {Object.entries(SORT_LABELS).map(([k,l])=>(
                      <button key={k} onClick={()=>{setSortBy(k as typeof sortBy);setShowSort(false)}}
                        style={{ display:'block', width:'100%', padding:'10px 14px', textAlign:'left',
                          background:sortBy===k?'rgba(212,175,55,0.1)':'transparent', border:'none',
                          color:sortBy===k?'var(--gold)':'var(--cream)', fontSize:12, cursor:'pointer' }}>
                        {l}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Chips de estado */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12, alignItems:'center' }}>
            {FILTROS.map(f=>{
              const active=estadoFiltro===f.key
              return (
                <button key={f.key} onClick={()=>handleFiltro(f.key)}
                  style={{ padding:'5px 12px', borderRadius:20, cursor:'pointer', border:'none',
                    background: active?`${f.color}22`:'var(--surface)',
                    color: active?f.color:'var(--muted)',
                    outline: active?`1px solid ${f.color}55`:'1px solid var(--border)',
                    fontSize:11, fontWeight:active?700:500, display:'flex', alignItems:'center', gap:5 }}>
                  {f.icon && <span style={{ fontSize:10 }}>{f.icon}</span>}
                  {f.label}
                  <span style={{ fontSize:11, fontWeight:800, color:active?f.color:'#555' }}>{f.count}</span>
                </button>
              )
            })}
            {(estadoFiltro!=='todos'||busqueda||vendFiltro!=='all') && (
              <button onClick={()=>{setEstadoFiltro('todos');setBusqueda('');setVendFiltro('all');setPagina(1)}}
                style={{ padding:'5px 10px', borderRadius:20, cursor:'pointer', border:'1px solid var(--border)',
                  background:'transparent', color:'var(--muted)', fontSize:11, display:'flex', alignItems:'center', gap:4 }}>
                <X size={10}/> Limpiar filtros
              </button>
            )}
            <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>
              {clientesFiltrados.length} resultados
            </span>
          </div>
          </>}

          {/* ── TABLA (desktop) ────────────────────────────────────────── */}
          {isDesktop ? (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:'1px solid var(--border)' }}>
                    {['CLIENTE','RUTA','ÚLTIMO PEDIDO','DEUDA ACTUAL','QUIEBRE STOCK','CONTACTO WHATSAPP','ESTADO',''].map(h=>(
                      <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:9, fontWeight:700,
                        color:'var(--muted)', letterSpacing:'0.08em', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {clientesPagina.length === 0 ? (
                    <tr><td colSpan={8} style={{ padding:'40px', textAlign:'center', color:'var(--muted)', fontSize:13 }}>
                      Sin resultados para los filtros aplicados
                    </td></tr>
                  ) : clientesPagina.map(c=>(
                    <ClienteRow key={c.id} c={c} onClick={()=>router.push(`/ventas/clientes/${c.id}`)} onWA={setWaTarget}/>
                  ))}
                </tbody>
              </table>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center',
                  padding:'12px 16px', borderTop:'1px solid var(--border)', background:'rgba(255,255,255,0.01)' }}>
                  <span style={{ fontSize:11, color:'var(--muted)' }}>
                    Mostrando {(pagina-1)*ROWS_PER_PAGE+1} a {Math.min(pagina*ROWS_PER_PAGE, clientesFiltrados.length)} de {clientesFiltrados.length} clientes
                  </span>
                  <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                    <button onClick={()=>irPagina(pagina-1)} disabled={pagina===1}
                      style={{ padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', background:'transparent',
                        color:pagina===1?'#333':'var(--cream)', cursor:pagina===1?'not-allowed':'pointer' }}>
                      <ChevronLeft size={14}/>
                    </button>
                    {Array.from({ length:Math.min(5, totalPaginas) }, (_,i)=>{
                      let p = i+1
                      if (totalPaginas > 5) {
                        if (pagina <= 3) p=i+1
                        else if (pagina >= totalPaginas-2) p=totalPaginas-4+i
                        else p=pagina-2+i
                      }
                      return (
                        <button key={p} onClick={()=>irPagina(p)}
                          style={{ width:30, height:30, borderRadius:8, border:'1px solid var(--border)', cursor:'pointer',
                            background:pagina===p?'var(--gold)':'transparent',
                            color:pagina===p?'#080808':'var(--cream)', fontSize:12, fontWeight:pagina===p?800:400 }}>
                          {p}
                        </button>
                      )
                    })}
                    {totalPaginas > 5 && <span style={{ color:'var(--muted)', fontSize:12 }}>…</span>}
                    {totalPaginas > 5 && (
                      <button onClick={()=>irPagina(totalPaginas)}
                        style={{ width:30, height:30, borderRadius:8, border:'1px solid var(--border)', cursor:'pointer',
                          background:pagina===totalPaginas?'var(--gold)':'transparent',
                          color:pagina===totalPaginas?'#080808':'var(--cream)', fontSize:12 }}>
                        {totalPaginas}
                      </button>
                    )}
                    <button onClick={()=>irPagina(pagina+1)} disabled={pagina===totalPaginas}
                      style={{ padding:'5px 8px', borderRadius:8, border:'1px solid var(--border)', background:'transparent',
                        color:pagina===totalPaginas?'#333':'var(--cream)', cursor:pagina===totalPaginas?'not-allowed':'pointer' }}>
                      <ChevronRight size={14}/>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── CARDS (móvil, CRM navy) ──────────────────────────────── */
            <div style={{ background:MC.bg, margin:'0 -16px', padding:'0 16px' }}>
              <p style={{ fontSize:11, color:MC.muted, marginBottom:10 }}>{clientesFiltrados.length} clientes</p>
              {clientesPagina.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', background:MC.card, border:`1px solid ${MC.border}`, borderRadius:16 }}>
                  <p style={{ fontSize:13, color:MC.muted }}>Sin resultados para este filtro</p>
                </div>
              ) : clientesPagina.map(c=>(
                <StockClienteCard key={c.id} c={c} onClick={()=>router.push(`/ventas/clientes/${c.id}`)} onWA={setWaTarget}/>
              ))}
              {totalPaginas > 1 && (
                <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:4, marginBottom:8 }}>
                  <button onClick={()=>irPagina(pagina-1)} disabled={pagina===1}
                    style={{ padding:'8px 14px', borderRadius:10, border:`1px solid ${MC.border}`, background:MC.card, color:MC.text, cursor:pagina===1?'not-allowed':'pointer' }}>
                    ← Anterior
                  </button>
                  <span style={{ padding:'8px 14px', fontSize:12, color:MC.muted }}>{pagina}/{totalPaginas}</span>
                  <button onClick={()=>irPagina(pagina+1)} disabled={pagina===totalPaginas}
                    style={{ padding:'8px 14px', borderRadius:10, border:`1px solid ${MC.border}`, background:MC.card, color:MC.text, cursor:pagina===totalPaginas?'not-allowed':'pointer' }}>
                    Siguiente →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar (solo desktop) ───────────────────────────────────── */}
        {isDesktop && (
          <Sidebar
            stats={stats}
            actividad={actividad}
            onAlertaClick={(filtro) => {
              setEstadoFiltro(filtro)
              setPagina(1)
              // scroll suave al inicio de la tabla
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
            onClienteClick={(nombre) => {
              setBusqueda(nombre)
              setPagina(1)
            }}
          />
        )}
      </div>

      {/* Banner Campaña WA activa — solo desktop: en móvil tapaba el bottom nav
          (quedaba fixed sin condicionar a isDesktop). La acción "Campaña WA"
          en móvil vive dentro del sheet de Filtros/config, no como banner fijo. */}
      {isDesktop && (
        <div style={{ position:'fixed', bottom:0, left:0, right:0, zIndex:40,
          background:'linear-gradient(90deg, #0a1a0a, #0d2010)', borderTop:'1px solid rgba(37,211,102,0.2)',
          padding:'12px 24px', display:'flex', justifyContent:'space-between', alignItems:'center',
          backdropFilter:'blur(10px)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:36, height:36, background:'rgba(37,211,102,0.15)', border:'1px solid rgba(37,211,102,0.3)', borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center' }}>
              <MessageCircle size={18} color="#25D366"/>
            </div>
            <div>
              <p style={{ fontSize:12, fontWeight:700, color:'var(--cream)' }}>Campaña WhatsApp activa</p>
              <p style={{ fontSize:10, color:'var(--muted)' }}>Envía mensajes masivos a tu cartera de clientes</p>
            </div>
          </div>
          <button onClick={()=>setShowWA(true)}
            style={{ padding:'9px 18px', background:'rgba(37,211,102,0.15)', border:'1px solid rgba(37,211,102,0.3)',
              borderRadius:10, color:'#25D366', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            Nueva campaña
          </button>
        </div>
      )}

      {/* Modal Campaña WA */}
      {showWA && <CampanaWAModal clientes={clientesFiltrados} onClose={()=>setShowWA(false)}/>}

      {/* Modal WA individual */}
      {waTarget && <WAModal target={waTarget} onClose={()=>setWaTarget(null)}/>}
    </div>
  )
}
