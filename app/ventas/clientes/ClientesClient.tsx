'use client'

import { useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { useUser } from '@/lib/userContext'
import {
  Search, Filter, ChevronDown, ChevronLeft, ChevronRight,
  MessageCircle, MoreVertical, Users, CheckCircle2, Clock,
  PhoneOff, AlertTriangle, Zap, Bell, Activity, X, User,
} from 'lucide-react'
import type { ActividadItem } from './page'

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface FrequencyStat {
  dias_sin_compra: number; ciclo_promedio_dias: number | null; total_pedidos: number
  alert_level: string; siguiente_compra_estimada: string | null
  score: number; segmento: string; confianza_score: string
  litros_totales: number; revenue_total: number; pedidos_por_mes: number
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
}

// ── Paleta ────────────────────────────────────────────────────────────────────
const SEG_COLOR: Record<string, string> = { A:'#D4AF37', B:'#34D399', C:'#60A5FA', D:'#F59E0B', E:'#F87171' }
const VEND_COLOR: Record<string, string> = { 'Javier Badilla':'#60A5FA', 'Carlos Urrejola':'#D4AF37' }
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

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
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  if (n >= 1000) return `$${Math.round(n/1000)}k`
  return `$${Math.round(n).toLocaleString('es-CL')}`
}

type EstadoDisplay = { label: string; color: string; bg: string; border: string }

function getEstado(c: Cliente): EstadoDisplay {
  if (c.estadoCliente === 'inactivo')
    return { label:'Inactivo',      color:'#6B7280', bg:'rgba(107,114,128,0.1)', border:'rgba(107,114,128,0.2)' }
  if ((c.deuda?.deuda_vencida ?? 0) > 0)
    return { label:'Deuda alta',    color:'#EF4444', bg:'rgba(239,68,68,0.1)',   border:'rgba(239,68,68,0.2)'   }
  const al = c.frecuencia?.alert_level
  if (al === 'critico' || al === 'vencido')
    return { label:'Riesgo',        color:'#F59E0B', bg:'rgba(245,158,11,0.1)', border:'rgba(245,158,11,0.2)'  }
  const dc = diasDesde(c.ultimoContacto?.fecha)
  if (!c.ultimoContacto || dc === null || dc > 7)
    return { label:'Sin contacto',  color:'#9CA3AF', bg:'rgba(156,163,175,0.1)', border:'rgba(156,163,175,0.2)' }
  return { label:'Al día',          color:'#34D399', bg:'rgba(52,211,153,0.1)',  border:'rgba(52,211,153,0.2)'  }
}

function waUrl(nombre: string, tel?: string | null): string {
  const base = tel ? `https://wa.me/${tel.replace(/\D/g,'')}` : 'https://wa.me/'
  const msg  = encodeURIComponent(`Hola ${nombre}, te saluda El Regreso Beer Co. 🍺`)
  return `${base}?text=${msg}`
}

const ROWS_PER_PAGE = 10

// ── Donut resumen ─────────────────────────────────────────────────────────────
function DonutResumen({ stats }: { stats: Stats }) {
  const total = stats.total || 1
  const items = [
    { label:'Al día',       count: stats.alDia,        color:'#34D399' },
    { label:'Riesgo',       count: stats.riesgoCompra, color:'#F59E0B' },
    { label:'Deuda alta',   count: stats.deudaAlta,    color:'#EF4444' },
    { label:'Sin contacto', count: stats.sinContacto,  color:'#6B7280' },
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
function Sidebar({ stats, actividad }: { stats: Stats; actividad: ActividadItem[] }) {
  const deudaAltaCount = stats.deudaAlta
  const sinContactoCount = stats.sinContacto

  return (
    <div style={{ width:260, flexShrink:0, display:'flex', flexDirection:'column', gap:12 }}>
      {/* Resumen rápido */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'14px 16px' }}>
        <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', marginBottom:12, letterSpacing:'0.04em' }}>RESUMEN RÁPIDO</p>
        <DonutResumen stats={stats}/>
      </div>

      {/* Actividad reciente */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'14px 16px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <Activity size={12} color="#D4AF37"/>
            <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', letterSpacing:'0.04em' }}>ACTIVIDAD RECIENTE</p>
          </div>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {actividad.slice(0,5).map((a,i)=>{
            const dc = diasDesde(a.fecha)
            const isContacto = a.tipo === 'contacto'
            return (
              <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                <div style={{ width:28, height:28, borderRadius:8, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
                  background: isContacto?'rgba(37,211,102,0.1)':'rgba(96,165,250,0.1)' }}>
                  {isContacto
                    ? <MessageCircle size={13} color="#25D366"/>
                    : <Zap size={13} color="#60A5FA"/>}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <p style={{ fontSize:11, fontWeight:600, color:'var(--cream)' }}>
                    {isContacto ? 'Contacto realizado' : 'Pedido confirmado'}
                  </p>
                  <p style={{ fontSize:10, color:'var(--muted)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {a.cliente}
                  </p>
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
          <Bell size={12} color="#F59E0B"/>
          <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', letterSpacing:'0.04em' }}>ALERTAS IMPORTANTES</p>
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {deudaAltaCount > 0 && (
            <div style={{ display:'flex', gap:10, alignItems:'center', background:'rgba(239,68,68,0.05)', border:'1px solid rgba(239,68,68,0.15)', borderRadius:10, padding:'10px 12px' }}>
              <AlertTriangle size={14} color="#EF4444"/>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:12, fontWeight:700, color:'var(--cream)' }}>{deudaAltaCount} clientes</p>
                <p style={{ fontSize:10, color:'var(--muted)' }}>con deuda mayor a 60 días</p>
              </div>
              <ChevronRight size={12} color="#555"/>
            </div>
          )}
          {sinContactoCount > 0 && (
            <div style={{ display:'flex', gap:10, alignItems:'center', background:'rgba(245,158,11,0.05)', border:'1px solid rgba(245,158,11,0.15)', borderRadius:10, padding:'10px 12px' }}>
              <PhoneOff size={14} color="#F59E0B"/>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:12, fontWeight:700, color:'var(--cream)' }}>{sinContactoCount} clientes</p>
                <p style={{ fontSize:10, color:'var(--muted)' }}>sin contacto hace más de 7 días</p>
              </div>
              <ChevronRight size={12} color="#555"/>
            </div>
          )}
          {stats.riesgoCompra > 0 && (
            <div style={{ display:'flex', gap:10, alignItems:'center', background:'rgba(96,165,250,0.05)', border:'1px solid rgba(96,165,250,0.15)', borderRadius:10, padding:'10px 12px' }}>
              <Clock size={14} color="#60A5FA"/>
              <div style={{ flex:1, minWidth:0 }}>
                <p style={{ fontSize:12, fontWeight:700, color:'var(--cream)' }}>{stats.riesgoCompra} clientes</p>
                <p style={{ fontSize:10, color:'var(--muted)' }}>con riesgo de compra</p>
              </div>
              <ChevronRight size={12} color="#555"/>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Fila de tabla ─────────────────────────────────────────────────────────────
function ClienteRow({ c, onClick }: { c: Cliente; onClick: () => void }) {
  const estado    = getEstado(c)
  const seg       = c.frecuencia?.segmento ?? 'E'
  const score     = c.frecuencia?.score ?? 0
  const segColor  = SEG_COLOR[seg] ?? '#888'
  const vendColor = VEND_COLOR[c.vendedor ?? ''] ?? '#888'
  const dcont     = diasDesde(c.ultimoContacto?.fecha)
  const dup       = diasDesde(c.ultimoPedido?.ultimaFecha)
  const siguComp  = c.frecuencia?.siguiente_compra_estimada
  const deuda     = c.deuda?.deuda_vencida ?? 0
  const saldo     = c.deuda?.saldo_total ?? 0

  return (
    <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer' }} onClick={onClick}>
      {/* Cliente */}
      <td style={{ padding:'10px 12px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:40, height:40, borderRadius:10, flexShrink:0,
            background:`${segColor}18`, border:`1.5px solid ${segColor}44`,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:0 }}>
            <span style={{ fontSize:14, fontWeight:900, color:segColor, lineHeight:1.1 }}>{seg}</span>
            <span style={{ fontSize:7, fontWeight:700, color:segColor, opacity:0.7 }}>{Math.round(score)}</span>
          </div>
          <div style={{ minWidth:0 }}>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--cream)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:160 }}>
              {c.nombre_fantasia}
            </p>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginTop:2 }}>
              <span style={{ fontSize:10, color:vendColor, fontWeight:600 }}>{(c.vendedor??'').split(' ')[0]}</span>
              {(c.localidad_entrega || c.localidad) && (
                <span style={{ fontSize:10, color:'var(--muted)' }}>· {c.localidad_entrega || c.localidad}</span>
              )}
            </div>
          </div>
        </div>
      </td>

      {/* Ruta */}
      <td style={{ padding:'10px 8px' }}>
        <span style={{ fontSize:11, color: c.ruta_despacho ? 'var(--cream)' : 'var(--muted)', fontWeight: c.ruta_despacho ? 600 : 400 }}>
          {c.ruta_despacho || 'Sin ruta'}
        </span>
      </td>

      {/* Último pedido */}
      <td style={{ padding:'10px 8px' }}>
        {c.ultimoPedido ? (
          <div>
            <p style={{ fontSize:11, color:'var(--cream)', fontWeight:600 }}>{fFecha(c.ultimoPedido.ultimaFecha)}</p>
            <p style={{ fontSize:10, color:'var(--muted)' }}>{c.ultimoPedido.litrosPeriodo.toFixed(0)} L período</p>
          </div>
        ) : <span style={{ fontSize:11, color:'var(--muted)' }}>Sin pedidos</span>}
      </td>

      {/* Deuda */}
      <td style={{ padding:'10px 8px', textAlign:'right' }}>
        {saldo > 0 ? (
          <div>
            <p style={{ fontSize:12, fontWeight:800, color: deuda>0 ? '#EF4444' : '#34D399' }}>{fPeso(saldo)}</p>
            {deuda > 0 && <p style={{ fontSize:10, color:'#F87171' }}>vencida {fPeso(deuda)}</p>}
          </div>
        ) : <span style={{ fontSize:11, color:'var(--muted)' }}>$0</span>}
      </td>

      {/* Próximo pedido */}
      <td style={{ padding:'10px 8px' }}>
        {siguComp ? (
          <div>
            <p style={{ fontSize:11, color:'var(--cream)', fontWeight:600 }}>{fFecha(siguComp)}</p>
            <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, background:'rgba(52,211,153,0.12)', color:'#34D399', fontWeight:700 }}>Programado</span>
          </div>
        ) : <span style={{ fontSize:11, color:'var(--muted)' }}>—</span>}
      </td>

      {/* WhatsApp */}
      <td style={{ padding:'10px 8px' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
          <a href={waUrl(c.nombre_fantasia??'', c.telefono)}
            target="_blank" rel="noreferrer"
            style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8,
              background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.2)',
              color:'#25D366', fontSize:11, fontWeight:700, textDecoration:'none', width:'fit-content' }}>
            <MessageCircle size={13}/> WhatsApp
          </a>
          <span style={{ fontSize:10, color: dcont !== null && dcont <= 7 ? '#34D399' : 'var(--muted)' }}>
            {c.ultimoContacto ? `Contactado ${fDias(dcont)}` : 'Sin contacto'}
          </span>
        </div>
      </td>

      {/* Estado */}
      <td style={{ padding:'10px 8px' }}>
        <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20,
          color:estado.color, background:estado.bg, border:`1px solid ${estado.border}`,
          whiteSpace:'nowrap' }}>
          {estado.label}
        </span>
      </td>

      {/* Acciones */}
      <td style={{ padding:'10px 8px', textAlign:'center' }} onClick={e=>e.stopPropagation()}>
        <button onClick={onClick}
          style={{ background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)',
            borderRadius:8, padding:'5px 8px', cursor:'pointer', color:'var(--muted)' }}>
          <MoreVertical size={14}/>
        </button>
      </td>
    </tr>
  )
}

// ── Card móvil ────────────────────────────────────────────────────────────────
function ClienteCard({ c, onClick }: { c: Cliente; onClick: () => void }) {
  const estado   = getEstado(c)
  const seg      = c.frecuencia?.segmento ?? 'E'
  const score    = c.frecuencia?.score ?? 0
  const segColor = SEG_COLOR[seg] ?? '#888'
  const vendColor= VEND_COLOR[c.vendedor ?? ''] ?? '#888'
  const dcont    = diasDesde(c.ultimoContacto?.fecha)

  return (
    <div onClick={onClick} style={{ background:'var(--surface)', border:`1px solid var(--border)`,
      borderRadius:16, padding:'14px', cursor:'pointer', marginBottom:8 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
        <div style={{ width:44, height:44, borderRadius:12, flexShrink:0,
          background:`${segColor}18`, border:`1.5px solid ${segColor}44`,
          display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:16, fontWeight:900, color:segColor, lineHeight:1.1 }}>{seg}</span>
          <span style={{ fontSize:8, fontWeight:700, color:segColor, opacity:0.7 }}>{Math.round(score)}pts</span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontSize:13, fontWeight:700, color:'var(--cream)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {c.nombre_fantasia}
          </p>
          <div style={{ display:'flex', gap:6, marginTop:2 }}>
            <span style={{ fontSize:10, color:vendColor, fontWeight:600 }}>{(c.vendedor??'').split(' ')[0]}</span>
            {c.ruta_despacho && <span style={{ fontSize:10, color:'var(--muted)' }}>· {c.ruta_despacho}</span>}
          </div>
        </div>
        <span style={{ fontSize:11, fontWeight:700, padding:'3px 9px', borderRadius:20,
          color:estado.color, background:estado.bg, border:`1px solid ${estado.border}`, flexShrink:0 }}>
          {estado.label}
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
        {c.ultimoPedido && (
          <div style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 10px' }}>
            <p style={{ fontSize:9, color:'var(--muted)', fontWeight:700, marginBottom:2 }}>ÚLTIMO PEDIDO</p>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--cream)' }}>{fFecha(c.ultimoPedido.ultimaFecha)}</p>
          </div>
        )}
        {c.frecuencia?.siguiente_compra_estimada && (
          <div style={{ background:'rgba(52,211,153,0.05)', borderRadius:8, padding:'8px 10px', border:'1px solid rgba(52,211,153,0.15)' }}>
            <p style={{ fontSize:9, color:'#34D399', fontWeight:700, marginBottom:2 }}>PRÓXIMO</p>
            <p style={{ fontSize:12, fontWeight:700, color:'var(--cream)' }}>{fFecha(c.frecuencia.siguiente_compra_estimada)}</p>
          </div>
        )}
      </div>

      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
        <span style={{ fontSize:10, color: dcont !== null && dcont <= 7 ? '#34D399' : 'var(--muted)' }}>
          {c.ultimoContacto ? `Contactado ${fDias(dcont)}` : 'Sin contacto'}
        </span>
        <a href={waUrl(c.nombre_fantasia??'', c.telefono)} target="_blank" rel="noreferrer"
          onClick={e=>e.stopPropagation()}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8,
            background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.2)',
            color:'#25D366', fontSize:11, fontWeight:700, textDecoration:'none' }}>
          <MessageCircle size={12}/> WA
        </a>
      </div>
    </div>
  )
}

// ── Modal Campaña WA ──────────────────────────────────────────────────────────
function CampanaWAModal({ clientes, onClose }: { clientes: Cliente[]; onClose: () => void }) {
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
            <a key={c.id} href={waUrl(c.nombre_fantasia??'', c.telefono)} target="_blank" rel="noreferrer"
              style={{ display:'flex', alignItems:'center', justifyContent:'space-between',
                padding:'10px 14px', background:'rgba(255,255,255,0.03)',
                border:'1px solid var(--border)', borderRadius:10, textDecoration:'none', color:'inherit' }}>
              <div>
                <p style={{ fontSize:12, fontWeight:600, color:'var(--cream)' }}>{c.nombre_fantasia}</p>
                <p style={{ fontSize:10, color:'var(--muted)' }}>{c.telefono}</p>
              </div>
              <div style={{ display:'flex', alignItems:'center', gap:5, color:'#25D366', fontSize:11, fontWeight:700 }}>
                <MessageCircle size={14}/> Abrir WA
              </div>
            </a>
          ))}
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
export default function ClientesClient({ clientes, periodo, totalesPorVendedor, stats, actividad, isAdmin, vendedoresScope }: Props) {
  const isDesktop = useIsDesktop()
  const router    = useRouter()
  const { user }  = useUser()

  const [busqueda,    setBusqueda]    = useState('')
  const [vendFiltro,  setVendFiltro]  = useState<string>('all')
  const [estadoFiltro,setEstadoFiltro]= useState<string>('todos')
  const [sortBy,      setSortBy]      = useState<'recientes'|'score'|'nombre'|'deuda'>('recientes')
  const [pagina,      setPagina]      = useState(1)
  const [showWA,      setShowWA]      = useState(false)
  const [showSort,    setShowSort]    = useState(false)

  // Chips de filtro con conteos
  const FILTROS = [
    { key:'todos',       label:`Todos`,       count: stats.total,        color:'var(--cream)', icon: null },
    { key:'contactados', label:'Contactados', count: stats.contactados7d, color:'#34D399',     icon:'✓'  },
    { key:'pendientes',  label:'Pendientes',  count: stats.pendientes,    color:'#F59E0B',     icon:'⚠'  },
    { key:'sin_contacto',label:'Sin contacto',count: stats.sinContacto,   color:'#9CA3AF',     icon:'✕'  },
    { key:'riesgo',      label:'Riesgo compra',count:stats.riesgoCompra,  color:'#EF4444',     icon:'🔴' },
  ]

  // Filtrar y ordenar
  const clientesFiltrados = useMemo(() => {
    const vendEfectivo = isAdmin ? vendFiltro : (user?.nombre ?? 'all')
    let res = clientes.filter(c => c.estadoCliente !== 'inactivo')

    if (vendEfectivo !== 'all')
      res = res.filter(c => c.vendedor === vendEfectivo)

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
          default: return true
        }
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
  }, [clientes, busqueda, vendFiltro, estadoFiltro, sortBy, isAdmin, user])

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
    <div style={{ padding: isDesktop?'24px 28px 60px':'14px 14px 80px', maxWidth: isDesktop?1400:640, margin:'0 auto', width:'100%' }}>

      {/* ── Encabezado ─────────────────────────────────────────────────── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:900, color:'var(--cream)', letterSpacing:'-0.5px', marginBottom:2 }}>Clientes</h1>
          <p style={{ fontSize:12, color:'var(--muted)' }}>Cartera{periodo ? ` · ${periodo.nombre}` : ''}</p>
        </div>
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

      {/* ── KPI Cards ──────────────────────────────────────────────────── */}
      <div style={{ display:'grid', gridTemplateColumns:isDesktop?'repeat(4,1fr)':'repeat(2,1fr)', gap:10, marginBottom:20 }}>
        {[
          { icon:Users,          label:'TOTAL CLIENTES',      val:stats.total,        sub:'100% cartera activa', color:'#60A5FA' },
          { icon:CheckCircle2,   label:'CONTACTADOS (7d)',     val:stats.contactados7d, sub:`${Math.round((stats.contactados7d/Math.max(stats.total,1))*100)}% del total`, color:'#34D399' },
          { icon:Clock,          label:'PENDIENTES CONTACTO',  val:stats.pendientes,   sub:`${Math.round((stats.pendientes/Math.max(stats.total,1))*100)}% del total`, color:'#F59E0B' },
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

      {/* ── Layout desktop: tabla + sidebar ────────────────────────────── */}
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>

        {/* ── Columna principal ─────────────────────────────────────────── */}
        <div style={{ flex:1, minWidth:0 }}>

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
                    const label = v==='all' ? 'Todos' : v.split(' ')[0]
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

          {/* ── TABLA (desktop) ────────────────────────────────────────── */}
          {isDesktop ? (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, overflow:'hidden' }}>
              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr style={{ background:'rgba(255,255,255,0.02)', borderBottom:'1px solid var(--border)' }}>
                    {['CLIENTE','RUTA','ÚLTIMO PEDIDO','DEUDA ACTUAL','PRÓXIMO PEDIDO','CONTACTO WHATSAPP','ESTADO',''].map(h=>(
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
                    <ClienteRow key={c.id} c={c} onClick={()=>router.push(`/ventas/clientes/${c.id}`)}/>
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
            /* ── CARDS (móvil) ──────────────────────────────────────── */
            <div>
              {clientesPagina.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px 20px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16 }}>
                  <p style={{ fontSize:13, color:'var(--muted)' }}>Sin resultados</p>
                </div>
              ) : clientesPagina.map(c=>(
                <ClienteCard key={c.id} c={c} onClick={()=>router.push(`/ventas/clientes/${c.id}`)}/>
              ))}
              {totalPaginas > 1 && (
                <div style={{ display:'flex', justifyContent:'center', gap:6, marginTop:12 }}>
                  <button onClick={()=>irPagina(pagina-1)} disabled={pagina===1}
                    style={{ padding:'8px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--cream)', cursor:pagina===1?'not-allowed':'pointer' }}>
                    ← Anterior
                  </button>
                  <span style={{ padding:'8px 14px', fontSize:12, color:'var(--muted)' }}>{pagina}/{totalPaginas}</span>
                  <button onClick={()=>irPagina(pagina+1)} disabled={pagina===totalPaginas}
                    style={{ padding:'8px 14px', borderRadius:10, border:'1px solid var(--border)', background:'var(--surface)', color:'var(--cream)', cursor:pagina===totalPaginas?'not-allowed':'pointer' }}>
                    Siguiente →
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Sidebar (solo desktop) ───────────────────────────────────── */}
        {isDesktop && <Sidebar stats={stats} actividad={actividad}/>}
      </div>

      {/* Banner Campaña WA activa */}
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

      {/* Modal Campaña WA */}
      {showWA && <CampanaWAModal clientes={clientesFiltrados} onClose={()=>setShowWA(false)}/>}
    </div>
  )
}
