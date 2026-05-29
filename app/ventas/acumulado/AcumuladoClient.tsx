'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import type { KpiData, EvoDia, CatRow, TopCliente, MixItem, InsightItem, AlertaItem, DivVend, EvoDetalle, CatClientes, MixDetalle, ClienteDet } from './page'
import type { Periodo } from '@/lib/types'
import { TrendingUp, TrendingDown, Users, Award, DollarSign, Droplets, Bell, Lightbulb, ChevronRight, ChevronDown, BarChart2, Target, X } from 'lucide-react'

// ── Paleta ────────────────────────────────────────────────────────────────────
const VEND_COLOR: Record<string,string> = { 'Javier Badilla':'#60A5FA', 'Carlos Urrejola':'#D4AF37' }
const CAT_COLOR: Record<string,string> = {
  'Bar':'#D4AF37','Minimarket':'#60A5FA','Cafetería':'#4ADE80','Botillería':'#A78BFA',
  'Almacén':'#FB923C','Restaurante':'#F472B6','Supermercado':'#38BDF8','Distribuidor':'#86EFAC',
  'Cliente Directo':'#E879F9','Otros':'#6B7280',
}
const MIX_COLORS = ['#60A5FA','#D4AF37','#34D399','#F472B6','#A78BFA','#FB923C','#38BDF8','#6B7280']

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

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ icon:Icon, label, value, sub, deltaVal, spark, color, wide }:{
  icon:React.ElementType; label:string; value:string; sub?:string
  deltaVal?:number; spark?:number[]; color:string; wide?:boolean
}) {
  const pos=(deltaVal??0)>=0
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'16px 18px', flex:`1 1 ${wide?220:150}px` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <Icon size={13} color={color} />
          <span style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:'0.08em', textTransform:'uppercase' }}>{label}</span>
        </div>
        {spark&&<Spark values={spark} color={color}/>}
      </div>
      <p style={{ fontSize:26, fontWeight:900, color:'var(--cream)', letterSpacing:'-0.8px', lineHeight:1, marginBottom:4 }}>{value}</p>
      {sub&&<p style={{ fontSize:11, color:'var(--muted)', marginBottom:4 }}>{sub}</p>}
      {deltaVal!==undefined&&(
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          {pos?<TrendingUp size={11} color="#34D399"/>:<TrendingDown size={11} color="#F87171"/>}
          <span style={{ fontSize:11, fontWeight:700, color:pos?'#34D399':'#F87171' }}>{pos?'+':''}{deltaVal}%</span>
          <span style={{ fontSize:10, color:'var(--muted)' }}>vs ant.</span>
        </div>
      )}
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
          <p style={{ fontSize:13, fontWeight:900, color, letterSpacing:'0.03em' }}>{vendedor.toUpperCase()}</p>
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
                    ? <span style={{ color:d2>=0?'#34D399':'#F87171', fontWeight:700 }}>{d2>=0?'↑':'↓'}{Math.abs(d2)}%</span>
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
  const sc=div.score; const scColor=sc>=65?'#34D399':sc>=45?'#F59E0B':'#F87171'
  return (
    <div style={{ marginBottom:20 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
        <p style={{ fontSize:12, fontWeight:800, color }}>{vendedor.toUpperCase()}</p>
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
      <p style={{ fontSize:10, color:sc<50?'#F59E0B':'var(--muted)', fontStyle:'italic' }}>{div.descripcion}</p>
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
  const metaColor  = pctMeta>=90?'#34D399':pctMeta>=70?'#F59E0B':'#F87171'

  const insightColor = (t:string) => t==='positive'?'#34D399':t==='negative'?'#F87171':t==='warning'?'#F59E0B':'#60A5FA'
  const insightIcon  = (t:string) => t==='positive'?'↗':t==='negative'?'↘':t==='warning'?'⚡':'●'

  return (
    <div style={{ padding:isDesktop?'24px 28px 60px':'14px 14px 80px', maxWidth:1280, margin:'0 auto', width:'100%' }}>

      {/* Encabezado */}
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20, flexWrap:'wrap' }}>
        <h1 style={{ fontSize:isDesktop?22:18, fontWeight:900, color:'var(--cream)', letterSpacing:'-0.5px' }}>Período Acumulado</h1>
        <span style={{ fontSize:13, color:'var(--gold)', fontWeight:700 }}>{periodo?.nombre??'Período'}</span>
        <span style={{ background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', borderRadius:8, padding:'4px 10px', fontSize:11, color:'var(--muted)', fontWeight:600 }}>
          VS {periodoAnteriorNombre}
        </span>
        {periodo&&<span style={{ fontSize:11, color:'var(--muted)' }}>{periodo.fecha_inicio} — {periodo.fecha_fin}</span>}
      </div>

      {/* KPIs */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20 }}>
        <KpiCard icon={Droplets}   label="Litros Vendidos"   value={`${fL(kpis.litros)} L`}        deltaVal={dlt(kpis.litros,kpis.litrosAnterior)} color="#60A5FA" spark={evolucion.map(d=>vendedoresScope.reduce((s,v)=>s+((d[v] as number)??0),0))}/>
        <KpiCard icon={DollarSign} label="Facturación"       value={fP(kpis.venta)}                  deltaVal={dlt(kpis.venta,kpis.ventaAnterior)}   color="#34D399"/>
        <KpiCard icon={BarChart2}  label="Ticket Promedio"   value={fPk(kpis.ticketPromedio)}        deltaVal={dlt(kpis.ticketPromedio,kpis.ticketPromedioAnterior)} color="#F59E0B"/>
        <KpiCard icon={Users}      label="Clientes Activos"  value={String(kpis.clientesActivos)}    sub={`${kpis.clientesActivos-kpis.clientesActivosAnterior>=0?'+':''}${kpis.clientesActivos-kpis.clientesActivosAnterior} vs ant.`} color="#A78BFA"/>
        <KpiCard icon={Award}      label="Categoría Líder"   value={kpis.categoriaLider}             sub={`${kpis.categoriaLiderPct}% del total`} deltaVal={kpis.categoriaLiderPct-kpis.categoriaLiderPctAnterior} color="#D4AF37" wide/>
      </div>

      {/* Evolución + Insights/Alertas */}
      <div style={{ display:isDesktop?'grid':'flex', gridTemplateColumns:'1fr 280px', flexDirection:'column', gap:14, marginBottom:14 }}>

        {/* Evolución */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:20, padding:'16px 18px 14px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
            <div>
              <p style={{ fontSize:13, fontWeight:800, color:'var(--cream)' }}>EVOLUCIÓN DE LITROS VENDIDOS</p>
              <p style={{ fontSize:10, color:'var(--muted)' }}>Pasa el cursor sobre el gráfico para ver el detalle del día</p>
            </div>
            <div style={{ display:'flex', gap:10 }}>
              {vendedoresScope.map(v=>(
                <div key={v} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:18, height:2, background:VEND_COLOR[v]??'#888', borderRadius:2 }}/>
                  <span style={{ fontSize:10, color:'var(--muted)' }}>{v.split(' ')[0]}</span>
                </div>
              ))}
            </div>
          </div>
          <LineChart data={evolucion} vendedores={vendedoresScope} evoDetalle={evoDetalle}/>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:14, paddingTop:14, borderTop:'1px solid rgba(255,255,255,0.05)' }}>
            {[
              { label:'PROMEDIO DIARIO',       value:`${fLn(promedioDiario)} L` },
              { label:'MEJOR DÍA',             value:mejorDia?`${fF(mejorDia.fecha)} — ${fLn(mejorDia.total)} L`:'—' },
              { label:'PROYECCIÓN FIN DE MES', value:`${fL(proyeccionFin)} L`, extra:metaTotal2>0?dlt(proyeccionFin,metaTotal2):null },
            ].map(s=>(
              <div key={s.label}>
                <p style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:4 }}>{s.label}</p>
                <p style={{ fontSize:14, fontWeight:800, color:'var(--cream)' }}>{s.value}</p>
                {s.extra!==undefined&&s.extra!==null&&(
                  <p style={{ fontSize:10, color:s.extra>=0?'#34D399':'#F87171', marginTop:2 }}>
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
                  <Bell size={13} color="#F59E0B"/>
                  <p style={{ fontSize:11, fontWeight:800, color:'var(--cream)', letterSpacing:'0.04em' }}>ALERTAS</p>
                </div>
                <span style={{ fontSize:10, color:'var(--gold)', fontWeight:700 }}>{alertas.length} alertas</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {alertas.map((a,i)=>{
                  const bc=a.tipo==='danger'?'#EF4444':a.tipo==='warning'?'#F59E0B':a.tipo==='success'?'#34D399':'#60A5FA'
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
                    <td style={{ padding:'8px 0', textAlign:'right', fontSize:11, fontWeight:700, color:d2===null?'#555':d2>=0?'#34D399':'#F87171' }}>
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
                  <span style={{ fontSize:10, color:dlt(proyeccionFin,metaTotal2)>=0?'#34D399':'#F87171', fontWeight:700 }}>
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
