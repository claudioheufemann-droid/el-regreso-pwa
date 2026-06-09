'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import type { KpiData, EvoDia, CatRow, TopCliente, MixItem, InsightItem, AlertaItem, DivVend, EvoDetalle, CatClientes, MixDetalle, ClienteDet } from './page'
import type { Periodo } from '@/lib/types'
import { VENDEDOR_DISPLAY } from '@/lib/types'
const dspV = (v: string) => VENDEDOR_DISPLAY[v] ?? v
import { TrendingUp, TrendingDown, Users, Award, DollarSign, Droplets, Bell, Lightbulb, ChevronRight, ChevronDown, BarChart2, Target, X } from 'lucide-react'
import { VEND_COLOR } from '@/lib/theme'
import AppHeader from '@/components/ui/AppHeader'

// ── Paleta ────────────────────────────────────────────────────────────────────
// VEND_COLOR viene de lib/theme (fuente única de verdad)
const CAT_COLOR: Record<string,string> = {
  'Bar':'#D4AF37','Minimarket':'#D4AF37','Cafetería':'#5A8A4A','Botillería':'#8A6D1F',
  'Almacén':'#FB923C','Restaurante':'#F472B6','Supermercado':'#38BDF8','Distribuidor':'#7CA86A',
  'Cliente Directo':'#E879F9','Otros':'#6B7280',
}
const MIX_COLORS = ['#D4AF37','#D4AF37','#5A8A4A','#F472B6','#8A6D1F','#FB923C','#38BDF8','#6B7280']

// ── Helpers ───────────────────────────────────────────────────────────────────
const fL   = (n:number) => n>=1000?`${(n/1000).toFixed(1)}k`:n.toFixed(1)
const fLn  = (n:number) => n.toFixed(1)
const fP   = (n:number) => n>=1_000_000?`$${(n/1_000_000).toFixed(2)}M`:`$${Math.round(n).toLocaleString('es-CL')}`
const fPk  = (n:number) => `$${Math.round(n).toLocaleString('es-CL')}`
const dlt  = (a:number,b:number) => b>0?Math.round(((a-b)/b)*100):0
const MESES= ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
const fF   = (s:string) => { const [,m,d]=s.split('-'); return `${parseInt(d)} ${MESES[parseInt(m)-1]}` }

// ── Sparkline ─────────────────────────────────────────────────────────────────
function Spark({ values, color }: { values:number[]; color:string }) {
  if (values.length<2) return null
  const w=60; const h=24; const p=2
  const mn=Math.min(...values); const mx=Math.max(...values); const rng=mx-mn||1
  const xs=values.map((_,i)=>p+(i/(values.length-1))*(w-2*p))
  const ys=values.map(v=>h-p-((v-mn)/rng)*(h-2*p))
  let d=`M ${xs[0]} ${ys[0]}`
  for(let i=1;i<xs.length;i++){const cx=(xs[i]+xs[i-1])/2;d+=` C ${cx} ${ys[i-1]}, ${cx} ${ys[i]}, ${xs[i]} ${ys[i]}`}
  return (
    <svg width={w} height={h} style={{overflow:'visible'}}>
      <path d={`${d} L ${xs[xs.length-1]} ${h} L ${xs[0]} ${h} Z`} fill={`${color}30`} />
      <path d={d} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  )
}

// ── KPI Card compacta ─────────────────────────────────────────────────────────
function KpiCard({ icon:Icon, label, value, sub, deltaVal, spark, color, wide, progress }:{
  icon:React.ElementType; label:string; value:string; sub?:string
  deltaVal?:number; spark?:number[]; color:string; wide?:boolean; progress?:number
}) {
  const pos = (deltaVal ?? 0) >= 0
  const hasDelta = deltaVal !== undefined

  if (wide) {
    // ── Tarjeta ancha: Categoría Líder ──
    return (
      <div style={{
        background:'var(--surface)', border:'1px solid var(--border)',
        borderTop:`2px solid ${color}`, borderRadius:14,
        padding:'10px 14px', width:'100%',
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          {/* Icono */}
          <div style={{ width:28, height:28, borderRadius:8, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <Icon size={13} color={color} />
          </div>
          {/* Contenido */}
          <div style={{ flex:1, minWidth:0 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
              <span style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.35)', letterSpacing:'0.8px', textTransform:'uppercase' }}>{label}</span>
              {hasDelta && (
                <span style={{ fontSize:10, fontWeight:700, color:pos?'#4ADE80':'#F87171' }}>
                  {pos?'↗+':'↘'}{hasDelta&&deltaVal!==0?Math.abs(deltaVal??0)+'%':'0%'}
                  <span style={{ fontSize:9, color:'rgba(255,255,255,0.25)', marginLeft:4 }}>vs ant.</span>
                </span>
              )}
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <p style={{ fontSize:16, fontWeight:900, color:'var(--cream)', letterSpacing:'-0.05em', whiteSpace:'nowrap', fontVariantNumeric:'tabular-nums' }}>{value}</p>
              {sub&&<p style={{ fontSize:10, color:'rgba(255,255,255,0.35)', flexShrink:0 }}>{sub}</p>}
              {/* Barra de progreso */}
              {progress!==undefined&&(
                <div style={{ flex:1, height:4, background:'rgba(255,255,255,0.06)', borderRadius:2, overflow:'hidden', minWidth:60 }}>
                  <div style={{ height:'100%', width:`${Math.min(progress,100)}%`, background:color, borderRadius:2, transition:'width 0.5s ease' }}/>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Tarjeta normal ──
  return (
    <div style={{
      background:'var(--surface)', border:'1px solid var(--border)',
      borderTop:`2px solid ${color}80`, borderRadius:14,
      padding:'11px 13px', minWidth:0, flex:'1 1 140px',
    }}>
      {/* Fila 1: icono + label + delta */}
      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:7 }}>
        <div style={{ width:22, height:22, borderRadius:7, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon size={11} color={color} />
        </div>
        <span style={{ fontSize:9, fontWeight:700, color:'rgba(255,255,255,0.32)', letterSpacing:'0.7px', textTransform:'uppercase', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
          {label}
        </span>
        {hasDelta&&spark&&<Spark values={spark} color={color}/>}
      </div>
      {/* Fila 2: valor grande */}
      <p style={{ fontSize:24, fontWeight:900, color:'var(--cream)', letterSpacing:'-0.05em', lineHeight:1, marginBottom: hasDelta ? 5 : (sub ? 3 : 0), fontVariantNumeric:'tabular-nums' }}>
        {value}
      </p>
      {sub&&!hasDelta&&<p style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:3 }}>{sub}</p>}
      {/* Fila 3: delta + vs ant */}
      {hasDelta&&(
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ fontSize:11, fontWeight:800, color:pos?'var(--green)':'var(--red)' }}>
            {pos?'↗+':'↘'}{Math.abs(deltaVal??0)}%
          </span>
          <span style={{ fontSize:9, color:'rgba(255,255,255,0.25)' }}>vs ant.</span>
        </div>
      )}
      {sub&&hasDelta&&<p style={{ fontSize:9, color:'rgba(255,255,255,0.25)', marginTop:2 }}>{sub}</p>}
    </div>
  )
}

// ── Gráfico interactivo ───────────────────────────────────────────────────────
function LineChart({ data, vendedores, evoDetalle }: {
  data: EvoDia[]; vendedores: string[]; evoDetalle: EvoDetalle
}) {
  const [selIdx, setSelIdx] = useState<number|null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const W=680; const H=190; const PL=38; const PR=8; const PT=8; const PB=28
  const iW=W-PL-PR; const iH=H-PT-PB

  if (!data.length) return <div style={{ height:H, display:'flex', alignItems:'center', justifyContent:'center' }}><p style={{ color:'var(--muted)', fontSize:12 }}>Sin datos</p></div>

  const allVals = data.flatMap(d=>vendedores.map(v=>(d[v] as number)??0))
  const maxV = Math.max(...allVals,1)
  const ticks = [0,0.25,0.5,0.75,1].map(f=>Math.round(f*maxV))
  const x = (i:number)=>PL+(i/Math.max(data.length-1,1))*iW
  const y = (v:number)=>PT+iH-(v/maxV)*iH

  const makePath = (vend:string) => {
    const pts=data.map((d,i)=>({ x:x(i), y:y((d[vend] as number)??0) }))
    if (!pts.length) return ''
    let p=`M ${pts[0].x} ${pts[0].y}`
    for(let i=1;i<pts.length;i++){const cx=(pts[i].x+pts[i-1].x)/2;p+=` C ${cx} ${pts[i-1].y}, ${cx} ${pts[i].y}, ${pts[i].x} ${pts[i].y}`}
    return p
  }

  const handleMouseMove = (e:React.MouseEvent) => {
    const el=containerRef.current; if(!el||!data.length) return
    const rect=el.getBoundingClientRect()
    const relX=(e.clientX-rect.left)/rect.width
    setSelIdx(Math.max(0,Math.min(data.length-1,Math.round(relX*(data.length-1)))))
  }

  const labelIdx = data.length<=8 ? data.map((_,i)=>i) : [0,Math.floor(data.length*0.2),Math.floor(data.length*0.4),Math.floor(data.length*0.6),Math.floor(data.length*0.8),data.length-1]
  const selData  = selIdx!==null ? data[selIdx] : null
  const selDet   = selData ? (evoDetalle[selData.fecha as string] ?? {}) : {}

  return (
    <div>
      <div ref={containerRef} style={{ position:'relative', cursor:'crosshair' }}
        onMouseMove={handleMouseMove} onMouseLeave={()=>setSelIdx(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width:'100%', height:H }}>
          {/* Grid */}
          {ticks.map((t,i)=>(
            <g key={i}>
              <line x1={PL} y1={y(t)} x2={W-PR} y2={y(t)} stroke="rgba(255,255,255,0.05)" strokeWidth="1"/>
              <text x={PL-4} y={y(t)+4} textAnchor="end" fontSize="8" fill="#555">{fL(t)}</text>
            </g>
          ))}
          {labelIdx.map(i=>(
            <text key={i} x={x(i)} y={H-4} textAnchor="middle" fontSize="8" fill="#555">{fF(data[i].fecha)}</text>
          ))}
          {/* Líneas por vendedor */}
          {vendedores.map(vend=>{
            const color=VEND_COLOR[vend]??'#888'
            const p=makePath(vend)
            const pts=data.map((d,i)=>({ x:x(i), y:y((d[vend] as number)??0) }))
            const area=pts.length ? p+` L ${pts[pts.length-1].x} ${PT+iH} L ${pts[0].x} ${PT+iH} Z` : ''
            return (
              <g key={vend}>
                <defs><linearGradient id={`a${vend.replace(/ /g,'')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={color} stopOpacity="0.2"/>
                  <stop offset="100%" stopColor={color} stopOpacity="0"/>
                </linearGradient></defs>
                <path d={area} fill={`url(#a${vend.replace(/ /g,'')})`}/>
                <path d={p} stroke={color} strokeWidth="2" fill="none"/>
              </g>
            )
          })}
          {/* Indicador día seleccionado */}
          {selIdx!==null&&(
            <g>
              <line x1={x(selIdx)} y1={PT} x2={x(selIdx)} y2={PT+iH}
                stroke="rgba(255,255,255,0.35)" strokeWidth="1" strokeDasharray="3,3"/>
              {vendedores.map(vend=>(
                <circle key={vend} cx={x(selIdx)} cy={y((data[selIdx][vend] as number)??0)}
                  r="4" fill={VEND_COLOR[vend]??'#888'} stroke="#0a0a0a" strokeWidth="2"/>
              ))}
            </g>
          )}
        </svg>
      </div>

      {/* Panel de detalle del día seleccionado */}
      {selData && (
        <div style={{
          background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.08)',
          borderRadius:12, padding:'12px 14px', marginTop:10,
        }}>
          <p style={{ fontSize:12, fontWeight:800, color:'var(--cream)', marginBottom:10 }}>
            📅 {fF(selData.fecha as string)}
            <span style={{ fontSize:11, color:'var(--muted)', fontWeight:400, marginLeft:8 }}>
              Total: {fLn(vendedores.reduce((s,v)=>s+((selData[v] as number)??0),0))} L
            </span>
          </p>
          <div style={{ display:'grid', gridTemplateColumns:`repeat(${vendedores.length},1fr)`, gap:12 }}>
            {vendedores.map(vend=>{
              const litrosDia=(selData[vend] as number)??0
              const clientes=selDet[vend]??[]
              const color=VEND_COLOR[vend]??'#888'
              return (
                <div key={vend}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:11, fontWeight:800, color }}>{vend.split(' ')[0]}</span>
                    <span style={{ fontSize:12, fontWeight:900, color:'var(--cream)' }}>{fLn(litrosDia)} L</span>
                  </div>
                  {clientes.length===0
                    ? <p style={{ fontSize:10, color:'var(--muted)', fontStyle:'italic' }}>Sin pedidos</p>
                    : clientes.slice(0,6).map(c=>(
                      <div key={c.nombre} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                        <span style={{ fontSize:10, color:'#bbb', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:130 }}>{c.nombre}</span>
                        <span style={{ fontSize:10, fontWeight:700, color:'var(--cream)', flexShrink:0, marginLeft:8 }}>{fLn(c.litros)} L</span>
                      </div>
                    ))
                  }
                  {clientes.length>6&&<p style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>+{clientes.length-6} más</p>}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Donut interactivo ─────────────────────────────────────────────────────────
function DonutInteractivo({ items, mixDetalle }: {
  items: {label:string;value:number;color:string}[]
  mixDetalle: MixDetalle
}) {
  const [sel, setSel] = useState<string|null>(null)
  const total=items.reduce((s,i)=>s+i.value,0)
  if (!total) return null

  let cumAngle=-Math.PI/2
  const R=55; const r=32; const cx=70; const cy=70
  const arcs=items.map(item=>{
    const angle=(item.value/total)*2*Math.PI
    const x1=cx+R*Math.cos(cumAngle); const y1=cy+R*Math.sin(cumAngle)
    cumAngle+=angle
    const x2=cx+R*Math.cos(cumAngle); const y2=cy+R*Math.sin(cumAngle)
    const x3=cx+r*Math.cos(cumAngle); const y3=cy+r*Math.sin(cumAngle)
    const x4=cx+r*Math.cos(cumAngle-angle); const y4=cy+r*Math.sin(cumAngle-angle)
    const large=angle>Math.PI?1:0
    return { d:`M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`, color:item.color, label:item.label }
  })

  const selDet = sel ? (mixDetalle[sel]??[]) : []

  return (
    <div>
      <div style={{ display:'flex', gap:16, alignItems:'flex-start' }}>
        {/* Donut */}
        <svg width={140} height={140} viewBox="0 0 140 140" style={{ flexShrink:0 }}>
          {arcs.map((arc,i)=>(
            <path key={i} d={arc.d} fill={arc.color}
              onClick={()=>setSel(sel===arc.label?null:arc.label)}
              style={{
                cursor:'pointer', opacity:sel&&sel!==arc.label?0.35:1,
                transform:sel===arc.label?`scale(1.04)`:'scale(1)',
                transformOrigin:`${cx}px ${cy}px`, transition:'all 0.15s'
              }}/>
          ))}
          {sel&&(
            <text x={cx} y={cy} textAnchor="middle" dominantBaseline="middle" fontSize="10" fontWeight="700" fill="#fff">
              {Math.round((items.find(i=>i.label===sel)?.value??0)/total*100)}%
            </text>
          )}
        </svg>

        {/* Leyenda */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
          {items.slice(0,6).map((item,i)=>{
            const pct=Math.round((item.value/total)*100)
            const active=sel===item.label
            return (
              <div key={item.label} onClick={()=>setSel(sel===item.label?null:item.label)}
                style={{ display:'flex', alignItems:'center', gap:7, cursor:'pointer',
                  padding:'3px 6px', borderRadius:6,
                  background:active?`${item.color}18`:'transparent',
                  border:active?`1px solid ${item.color}40`:'1px solid transparent' }}>
                <div style={{ width:8, height:8, borderRadius:'50%', background:item.color, flexShrink:0 }}/>
                <span style={{ fontSize:10, color:active?item.color:'var(--cream)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{item.label}</span>
                <span style={{ fontSize:9, color:'var(--muted)', flexShrink:0 }}>{pct}%</span>
                <span style={{ fontSize:9, color:'var(--muted)', flexShrink:0, minWidth:36, textAlign:'right' }}>{fLn(item.value)}L</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Detalle clientes del estilo seleccionado */}
      {sel&&selDet.length>0&&(
        <div style={{ marginTop:12, paddingTop:12, borderTop:'1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--cream)' }}>Clientes · {sel}</p>
            <button onClick={()=>setSel(null)} style={{ background:'none', border:'none', color:'var(--muted)', cursor:'pointer', padding:0 }}>
              <X size={13}/>
            </button>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:3 }}>
            {selDet.slice(0,8).map(c=>(
              <div key={c.nombre} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'4px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                <span style={{ fontSize:11, color:'#bbb', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>{c.nombre}</span>
                <div style={{ display:'flex', gap:12, flexShrink:0 }}>
                  <span style={{ fontSize:11, fontWeight:700, color:'var(--cream)' }}>{fLn(c.litros)} L</span>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{fP(c.venta)}</span>
                </div>
              </div>
            ))}
            {selDet.length>8&&<p style={{ fontSize:10, color:'var(--muted)', marginTop:4, textAlign:'center' }}>+{selDet.length-8} clientes más</p>}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Tabla de categorías expandible ────────────────────────────────────────────
function CatTable({ vendedor, cats, catClientes, color }: {
  vendedor:string; cats:Record<string,CatRow>
  catClientes:Record<string,ClienteDet[]>; color:string
}) {
  const [selCat, setSelCat] = useState<string|null>(null)
  const totalLitros = Object.values(cats).reduce((s,c)=>s+c.litros,0)
  const sorted = Object.entries(cats).sort((a,b)=>b[1].litros-a[1].litros)

  return (
    <div style={{ flex:1, minWidth:0 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginBottom:12 }}>
        <div>
          <p style={{ fontSize:13, fontWeight:900, color, letterSpacing:'0.03em' }}>{dspV(vendedor).toUpperCase()}</p>
          <p style={{ fontSize:10, color:'var(--muted)' }}>{totalLitros>0?Math.round((totalLitros/totalLitros)*100):0}% del total</p>
        </div>
        <p style={{ fontSize:22, fontWeight:900, color:'var(--cream)', letterSpacing:'-0.5px' }}>{fLn(totalLitros)} L</p>
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
        <thead>
          <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
            {['Categoría','Litros','% Mix','vs Ant.',''].map(h=>(
              <th key={h} style={{ textAlign:h==='Litros'||h==='% Mix'||h==='vs Ant.'?'right':'left', color:'var(--muted)', fontWeight:600, paddingBottom:6, fontSize:10 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(([cat,d])=>{
            const pct=totalLitros>0?(d.litros/totalLitros)*100:0
            const d2=dlt(d.litros,d.litrosAnterior)
            const catColor=CAT_COLOR[cat]??'#888'
            const isOpen=selCat===cat
            const clientes=catClientes[cat]??[]
            return [
              <tr key={cat} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)', cursor:clientes.length?'pointer':'default' }}
                onClick={()=>clientes.length&&setSelCat(isOpen?null:cat)}>
                <td style={{ padding:'8px 0' }}>
                  <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                    <div style={{ width:20, height:3, borderRadius:2, background:catColor, flexShrink:0 }}/>
                    <span style={{ color:'var(--cream)' }}>{cat}</span>
                    {clientes.length>0&&<span style={{ fontSize:8, color:catColor, marginLeft:2 }}>{isOpen?'▲':'▼'}</span>}
                  </div>
                </td>
                <td style={{ textAlign:'right', color:'var(--cream)', fontWeight:700, padding:'8px 0' }}>{fLn(d.litros)} L</td>
                <td style={{ textAlign:'right', color:'var(--muted)', padding:'8px 4px' }}>{pct.toFixed(1)}%</td>
                <td style={{ textAlign:'right', padding:'8px 0' }}>
                  {d.litrosAnterior>0
                    ? <span style={{ color:d2>=0?'#5A8A4A':'#B5543E', fontWeight:700 }}>{d2>=0?'↑':'↓'}{Math.abs(d2)}%</span>
                    : <span style={{ color:'#555' }}>—</span>}
                </td>
                <td style={{ width:16 }}/>
              </tr>,
              isOpen&&(
                <tr key={`${cat}-det`}>
                  <td colSpan={5} style={{ padding:'0 0 8px 28px', background:'rgba(255,255,255,0.015)' }}>
                    <div style={{ paddingTop:6 }}>
                      {clientes.slice(0,8).map(c=>(
                        <div key={c.nombre} style={{ display:'flex', justifyContent:'space-between', padding:'3px 0', borderBottom:'1px solid rgba(255,255,255,0.03)' }}>
                          <span style={{ fontSize:10, color:'#aaa', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:180 }}>{c.nombre}</span>
                          <div style={{ display:'flex', gap:12, flexShrink:0 }}>
                            <span style={{ fontSize:10, fontWeight:700, color:'var(--cream)' }}>{fLn(c.litros)} L</span>
                            <span style={{ fontSize:10, color:'var(--muted)' }}>{fP(c.venta)}</span>
                          </div>
                        </div>
                      ))}
                      {clientes.length>8&&<p style={{ fontSize:10, color:'var(--muted)', marginTop:4 }}>+{clientes.length-8} clientes más</p>}
                    </div>
                  </td>
                </tr>
              )
            ].filter(Boolean)
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Diversificación ───────────────────────────────────────────────────────────
function DivBar({ vendedor, div, color }: { vendedor:string; div:DivVend; color:string }) {
  const total=Object.values(div.categorias).reduce((s,v)=>s+v,0)
  const sorted=Object.entries(div.categorias).sort((a,b)=>b[1]-a[1])
  const sc=div.score; const scColor=sc>=65?'#5A8A4A':sc>=45?'#D4AF37':'#B5543E'
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <p style={{ fontSize:12, fontWeight:800, color }}>{dspV(vendedor).toUpperCase()}</p>
        <div style={{ background:`${scColor}20`, border:`1px solid ${scColor}40`, borderRadius:8, padding:'2px 10px' }}>
          <span style={{ fontSize:12, fontWeight:900, color:scColor }}>Score {sc}/100</span>
        </div>
      </div>
      <div style={{ height:12, borderRadius:8, overflow:'hidden', display:'flex', marginBottom:6 }}>
        {sorted.map(([cat,lit],i)=>{
          const pct=total>0?(lit/total)*100:0
          return <div key={cat} style={{ width:`${pct}%`, background:CAT_COLOR[cat]??MIX_COLORS[i%MIX_COLORS.length] }}/>
        })}
      </div>
      <div style={{ display:'flex', flexWrap:'wrap', gap:'4px 12px', marginBottom:6 }}>
        {sorted.slice(0,5).map(([cat,lit])=>{
          const pct=total>0?Math.round((lit/total)*100):0
          const c=CAT_COLOR[cat]??'#888'
          return (
            <span key={cat} style={{ fontSize:10, color:'var(--muted)', display:'flex', alignItems:'center', gap:3 }}>
              <span style={{ width:6, height:6, borderRadius:'50%', background:c, display:'inline-block' }}/>
              {cat} {pct}%
            </span>
          )
        })}
      </div>
      <p style={{ fontSize:10, color:sc<50?'#D4AF37':'var(--muted)', fontStyle:'italic' }}>{div.descripcion}</p>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  periodo: Periodo|null; periodoAnteriorNombre: string
  kpis: KpiData; evolucion: EvoDia[]; evoDetalle: EvoDetalle
  promedioDiario: number; proyeccionFin: number
  diasTranscurridos: number; diasTotales: number
  mejorDia: {fecha:string;total:number}|null
  catPorVendedor: Record<string,Record<string,CatRow>>
  catClientes: CatClientes
  mixEstilos: MixItem[]; mixDetalle: MixDetalle
  topClientes: TopCliente[]
  metasPorVendedor: Record<string,number>; metaTotal: number
  diversificacion: Record<string,DivVend>
  insights: InsightItem[]; alertas: AlertaItem[]
  vendedoresScope: string[]; isAdmin: boolean
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function AcumuladoClient({
  periodo, periodoAnteriorNombre, kpis, evolucion, evoDetalle,
  promedioDiario, proyeccionFin, diasTranscurridos, diasTotales,
  mejorDia, catPorVendedor, catClientes, mixEstilos, mixDetalle,
  topClientes, metasPorVendedor, metaTotal, diversificacion,
  insights, alertas, vendedoresScope, isAdmin,
}: Props) {
  const isDesktop = useIsDesktop()
  const router    = useRouter()

  const metaTotal2 = Object.values(metasPorVendedor).reduce((s,v)=>s+v,0)||metaTotal
  const pctMeta    = metaTotal2>0?Math.round((kpis.litros/metaTotal2)*100):0
  const metaColor  = pctMeta>=90?'#5A8A4A':pctMeta>=70?'#D4AF37':'#B5543E'

  const insightColor = (t:string) => t==='positive'?'#5A8A4A':t==='negative'?'#B5543E':t==='warning'?'#D4AF37':'#D4AF37'
  const insightIcon  = (t:string) => t==='positive'?'↗':t==='negative'?'↘':t==='warning'?'⚡':'●'

  return (
    <div style={{ padding:isDesktop?'24px 28px 60px':'16px 16px 100px', maxWidth:1280, margin:'0 auto', width:'100%' }}>

      {/* Encabezado estándar */}
      <AppHeader eyebrow={periodo?.nombre ?? 'Período'} title="Período Acumulado" />

      {/* Selector período compacto */}
      <div style={{
        display:'flex', alignItems:'center', gap:8,
        marginBottom: isDesktop ? 16 : 12,
        padding:'8px 12px',
        background:'var(--surface)', border:'1px solid var(--border)',
        borderRadius:12, flexWrap:'wrap',
      }}>
        <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, fontWeight:700, color:'rgba(212,175,55,0.8)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M7 16L12 7l5 9M3 21h18"/></svg>
          VS {periodoAnteriorNombre}
        </span>
        {periodo&&(
          <>
            <div style={{ width:1, height:14, background:'rgba(255,255,255,0.1)' }}/>
            <span style={{ display:'flex', alignItems:'center', gap:5, fontSize:11, color:'rgba(255,255,255,0.35)' }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              {periodo.fecha_inicio} — {periodo.fecha_fin}
            </span>
          </>
        )}
      </div>

      {/* KPIs — grid 2×2 + fila categoría líder */}
      <div style={{ display:'flex', flexDirection:'column', gap: isDesktop ? 10 : 8, marginBottom: isDesktop ? 16 : 12 }}>
        {/* Grilla 2×2 */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(2, 1fr)', gap: isDesktop ? 10 : 8 }}>
          <KpiCard icon={Droplets}   label="Litros Vendidos"  value={`${fL(kpis.litros)} L`}     deltaVal={dlt(kpis.litros,kpis.litrosAnterior)}   color="#D4AF37" spark={evolucion.map(d=>vendedoresScope.reduce((s,v)=>s+((d[v] as number)??0),0))}/>
          <KpiCard icon={DollarSign} label="Facturación"      value={fP(kpis.venta)}               deltaVal={dlt(kpis.venta,kpis.ventaAnterior)}     color="#4ADE80"/>
          <KpiCard icon={BarChart2}  label="Ticket Promedio"  value={fPk(kpis.ticketPromedio)}     deltaVal={dlt(kpis.ticketPromedio,kpis.ticketPromedioAnterior)} color="#D4AF37"/>
          <KpiCard icon={Users}      label="Clientes Activos" value={String(kpis.clientesActivos)} sub={`${kpis.clientesActivos-kpis.clientesActivosAnterior>=0?'+':''}${kpis.clientesActivos-kpis.clientesActivosAnterior} vs ant.`} color="#60A5FA"/>
        </div>
        {/* Categoría Líder — fila completa */}
        <KpiCard icon={Award} label="Categoría Líder" value={kpis.categoriaLider}
          sub={`${kpis.categoriaLiderPct}% del total`}
          deltaVal={kpis.categoriaLiderPct-kpis.categoriaLiderPctAnterior}
          progress={kpis.categoriaLiderPct}
          color="#D4AF37" wide/>
      </div>

      {/* Evolución + Insights/Alertas */}
      <div style={{ display:isDesktop?'grid':'flex', gridTemplateColumns:'1fr 280px', flexDirection:'column', gap:10, marginBottom:10 }}>

        {/* Evolución */}
        <div style={{
          background:'var(--surface)', border:'1px solid var(--border)',
          borderTop:'2px solid rgba(212,175,55,0.4)', borderRadius:16,
          padding: isDesktop ? '14px 18px 12px' : '12px 14px',
        }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
            <p style={{ fontSize:11, fontWeight:800, color:'rgba(255,255,255,0.7)', letterSpacing:'0.5px' }}>EVOLUCIÓN DE LITROS VENDIDOS</p>
            <div style={{ display:'flex', gap:8 }}>
              {vendedoresScope.map(v=>(
                <div key={v} style={{ display:'flex', alignItems:'center', gap:4 }}>
                  <div style={{ width:16, height:2, background:VEND_COLOR[v]??'#888', borderRadius:2 }}/>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)' }}>{dspV(v)}</span>
                </div>
              ))}
            </div>
          </div>
          <p style={{ fontSize:9, color:'rgba(255,255,255,0.25)', marginBottom:8 }}>Toca el gráfico para ver el detalle del día</p>
          <LineChart data={evolucion} vendedores={vendedoresScope} evoDetalle={evoDetalle}/>
          <div className="kpi-grid-3" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:10, paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            {[
              { label:'PROMEDIO DIARIO',   value:`${fLn(promedioDiario)} L` },
              { label:'MEJOR DÍA',         value:mejorDia?`${fF(mejorDia.fecha)} — ${fLn(mejorDia.total)} L`:'—' },
              { label:'PROYECCIÓN',        value:`${fL(proyeccionFin)} L`, extra:metaTotal2>0?dlt(proyeccionFin,metaTotal2):null },
            ].map(s=>(
              <div key={s.label}>
                <p style={{ fontSize:8, fontWeight:700, color:'rgba(255,255,255,0.3)', letterSpacing:'0.6px', textTransform:'uppercase', marginBottom:3 }}>{s.label}</p>
                <p style={{ fontSize:13, fontWeight:800, color:'var(--cream)' }}>{s.value}</p>
                {s.extra!==undefined&&s.extra!==null&&(
                  <p style={{ fontSize:9, color:s.extra>=0?'#4ADE80':'#F87171', marginTop:2 }}>
                    {s.extra>=0?'↑':'↓'}{Math.abs(s.extra)}% vs meta
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Insights + Alertas */}
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'14px 16px', flex:'1' }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:12 }}>
              <Lightbulb size={13} color="#D4AF37"/>
              <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', letterSpacing:'0.04em' }}>INSIGHTS DEL PERÍODO</p>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {insights.length===0
                ? <p style={{ fontSize:11, color:'var(--muted)' }}>Acumulando datos…</p>
                : insights.slice(0,5).map((ins,i)=>(
                  <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                    <span style={{ fontSize:12, color:insightColor(ins.tipo), flexShrink:0, marginTop:1 }}>{insightIcon(ins.tipo)}</span>
                    <p style={{ fontSize:11, color:'#aaa', lineHeight:1.4 }}>{ins.texto}</p>
                  </div>
                ))
              }
            </div>
          </div>

          {alertas.length>0&&(
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'14px 16px' }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <Bell size={13} color="#D4AF37"/>
                  <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', letterSpacing:'0.04em' }}>ALERTAS</p>
                </div>
                <span style={{ fontSize:10, color:'var(--gold)', fontWeight:700 }}>{alertas.length} alertas</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {alertas.map((a,i)=>{
                  const bc=a.tipo==='danger'?'#B5543E':a.tipo==='warning'?'#D4AF37':a.tipo==='success'?'#5A8A4A':'#D4AF37'
                  return (
                    <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start', borderLeft:`2px solid ${bc}`, paddingLeft:8 }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:11, fontWeight:700, color:'var(--cream)', lineHeight:1.3 }}>{a.titulo}</p>
                        <p style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>{a.subtexto}</p>
                      </div>
                      <span style={{ fontSize:9, color:'#555', flexShrink:0 }}>{a.hace}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Comparación por categoría */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'16px 20px', marginBottom:14 }}>
        <p style={{ fontSize:11, fontWeight:800, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:6 }}>COMPARACIÓN POR CATEGORÍA</p>
        <p style={{ fontSize:10, color:'var(--muted)', marginBottom:16 }}>Haz clic en una fila para ver los clientes de esa categoría</p>
        <div style={{ display:isDesktop?'grid':'flex', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', flexDirection:'column', gap:32 }}>
          {vendedoresScope.map(v=>(
            <CatTable key={v} vendedor={v} cats={catPorVendedor[v]??{}} catClientes={catClientes[v]??{}} color={VEND_COLOR[v]??'#888'}/>
          ))}
        </div>
      </div>

      {/* Mix + Top clientes + Metas */}
      <div style={{ display:isDesktop?'grid':'flex', gridTemplateColumns:'280px 1fr 260px', flexDirection:'column', gap:14, marginBottom:14 }}>

        {/* Mix de estilos */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'16px 18px' }}>
          <p style={{ fontSize:11, fontWeight:800, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:14 }}>MIX DE ESTILOS (LITROS)</p>
          <p style={{ fontSize:10, color:'var(--muted)', marginBottom:10 }}>Clic en un segmento para ver clientes</p>
          <DonutInteractivo
            items={mixEstilos.slice(0,7).map((m,i)=>({ label:m.categoria, value:m.litros, color:MIX_COLORS[i%MIX_COLORS.length] }))}
            mixDetalle={mixDetalle}
          />
        </div>

        {/* Top clientes */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'16px 18px' }}>
          <p style={{ fontSize:11, fontWeight:800, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:14 }}>TOP CLIENTES DEL PERÍODO</p>
          <table style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.06)' }}>
                {['Cliente','Categoría','Litros','vs Ant.'].map(h=>(
                  <th key={h} style={{ textAlign:h==='Litros'||h==='vs Ant.'?'right':'left', fontSize:10, color:'var(--muted)', fontWeight:600, paddingBottom:8 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topClientes.slice(0,6).map((c,i)=>{
                const d2=c.litrosAnterior>0?dlt(c.litros,c.litrosAnterior):null
                return (
                  <tr key={i} style={{ borderBottom:'1px solid rgba(255,255,255,0.03)', cursor:'pointer' }} onClick={()=>router.push('/ventas/clientes')}>
                    <td style={{ padding:'8px 0', fontSize:12, fontWeight:600, color:'var(--cream)', maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.nombre}</td>
                    <td style={{ padding:'8px 4px', fontSize:10, color:'var(--muted)' }}>{c.categoria}</td>
                    <td style={{ padding:'8px 0', textAlign:'right', fontSize:12, fontWeight:700, color:'var(--cream)' }}>{fLn(c.litros)} L</td>
                    <td style={{ padding:'8px 0', textAlign:'right', fontSize:11, fontWeight:700, color:d2===null?'#555':d2>=0?'#5A8A4A':'#B5543E' }}>
                      {d2!==null?`${d2>=0?'↑':'↓'}${Math.abs(d2)}%`:'—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          <button onClick={()=>router.push('/ventas/clientes')} style={{ marginTop:10, background:'none', border:'none', color:'var(--gold)', fontSize:11, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:4, padding:0 }}>
            Ver todos los clientes <ChevronRight size={12}/>
          </button>
        </div>

        {/* Metas */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'16px 18px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <p style={{ fontSize:11, fontWeight:800, color:'var(--muted)', letterSpacing:'0.08em' }}>METAS Y PROYECCIÓN</p>
            <Target size={13} color="var(--gold)"/>
          </div>
          {metaTotal2>0?(
            <>
              <p style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>PROGRESO ACTUAL</p>
              <p style={{ fontSize:32, fontWeight:900, color:metaColor, letterSpacing:'-1px', lineHeight:1, marginBottom:8 }}>{pctMeta}%</p>
              <div style={{ height:8, background:'rgba(255,255,255,0.06)', borderRadius:8, overflow:'hidden', marginBottom:6 }}>
                <div style={{ height:'100%', width:`${Math.min(100,pctMeta)}%`, background:metaColor, borderRadius:8, transition:'width 0.5s' }}/>
              </div>
              <p style={{ fontSize:11, color:'var(--muted)', marginBottom:14 }}>{fLn(kpis.litros)} L / {fLn(metaTotal2)} L</p>
              {vendedoresScope.map(v=>{
                const meta=metasPorVendedor[v]??0
                const lts=Object.values(catPorVendedor[v]??{}).reduce((s,c)=>s+c.litros,0)
                const pct2=meta>0?Math.round((lts/meta)*100):0
                const c2=VEND_COLOR[v]??'#888'
                return (
                  <div key={v} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:10, color:c2, fontWeight:700 }}>{v.split(' ')[0]}</span>
                      <span style={{ fontSize:10, color:'var(--muted)' }}>{fLn(lts)} / {fLn(meta)} L</span>
                    </div>
                    <div style={{ height:4, background:'rgba(255,255,255,0.06)', borderRadius:4, overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${Math.min(100,pct2)}%`, background:c2, borderRadius:4 }}/>
                    </div>
                  </div>
                )
              })}
              <div style={{ paddingTop:10, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
                <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)' }}>
                  {fL(proyeccionFin)} L{' '}
                  <span style={{ fontSize:10, color:dlt(proyeccionFin,metaTotal2)>=0?'#5A8A4A':'#B5543E', fontWeight:700 }}>
                    {dlt(proyeccionFin,metaTotal2)>=0?'↑':'↓'}{Math.abs(dlt(proyeccionFin,metaTotal2))}% vs meta
                  </span>
                </p>
                <p style={{ fontSize:10, color:'var(--muted)', marginTop:2 }}>
                  {kpis.litros<metaTotal2?`Faltan ${fLn(metaTotal2-kpis.litros)} L para la meta`:'¡Meta superada! 🎉'}
                </p>
              </div>
            </>
          ):<p style={{ fontSize:12, color:'var(--muted)' }}>Sin metas configuradas</p>}
        </div>
      </div>

      {/* Diversificación */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'16px 20px' }}>
        <p style={{ fontSize:11, fontWeight:800, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:16 }}>DIVERSIFICACIÓN DE CANALES</p>
        <div style={{ display:isDesktop?'grid':'flex', gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))', flexDirection:'column', gap:24 }}>
          {vendedoresScope.map(v=>diversificacion[v]&&(
            <DivBar key={v} vendedor={v} div={diversificacion[v]} color={VEND_COLOR[v]??'#888'}/>
          ))}
        </div>
      </div>
    </div>
  )
}
