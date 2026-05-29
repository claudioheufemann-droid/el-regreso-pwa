'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useIsDesktop } from '@/lib/useIsDesktop'
import {
  CheckCircle2, Circle, MessageCircle, Target, ChevronRight, ChevronDown,
  RefreshCw, Zap, User, Filter, Phone, Clock, PhoneOff, Calendar,
  Lightbulb, X, TrendingUp,
} from 'lucide-react'
import type { MisionEnriquecida, ProximaPreview, HistorialSemana } from './page'

// ── Paleta ────────────────────────────────────────────────────────────────────
const SEG_COLOR: Record<string, string> = { A:'#D4AF37', B:'#34D399', C:'#60A5FA', D:'#F59E0B', E:'#F87171' }
const VEND_COLOR: Record<string, string> = { 'Javier Badilla':'#60A5FA', 'Carlos Urrejola':'#34D399' }
const PRIO_CFG: Record<string, { color: string; bg: string; border: string }> = {
  Alta:  { color:'#EF4444', bg:'rgba(239,68,68,0.1)',  border:'rgba(239,68,68,0.25)'  },
  Media: { color:'#F59E0B', bg:'rgba(245,158,11,0.1)', border:'rgba(245,158,11,0.25)' },
  Baja:  { color:'#34D399', bg:'rgba(52,211,153,0.1)', border:'rgba(52,211,153,0.25)' },
}
const MESES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

type Tab = 'semana' | 'proxima' | 'historial'

// ── Helpers ───────────────────────────────────────────────────────────────────
function rangoSemana(lunes: string) {
  const d = new Date(lunes + 'T12:00:00')
  const fin = new Date(d); fin.setDate(fin.getDate() + 6)
  return `${d.getDate()} ${MESES[d.getMonth()]} — ${fin.getDate()} ${MESES[fin.getMonth()]} ${fin.getFullYear()}`
}
function fFecha(s: string | null): string {
  if (!s) return '—'
  const [y, m, d] = s.split('T')[0].split('-')
  return `${parseInt(d)} ${MESES[parseInt(m)-1]} ${y}`
}
function fPeso(n: number): string {
  if (!n) return '$0'
  if (n >= 1_000_000) return `$${(n/1_000_000).toFixed(1)}M`
  return `$${Math.round(n).toLocaleString('es-CL')}`
}
function waUrl(nombre: string, tel?: string | null): string {
  const base = tel ? `https://wa.me/${tel.replace(/\D/g,'')}` : 'https://wa.me/'
  return `${base}?text=${encodeURIComponent(`Hola ${nombre}, te saluda El Regreso Beer Co. 🍺`)}`
}

// ── Donut de progreso ──────────────────────────────────────────────────────────
function ProgressDonut({ done, total, size=120 }: { done: number; total: number; size?: number }) {
  const pct = total > 0 ? done / total : 0
  const r = (size - 16) / 2
  const cx = size / 2
  const circ = 2 * Math.PI * r
  const dash = circ * pct
  const color = pct >= 0.9 ? '#34D399' : pct >= 0.5 ? '#F59E0B' : '#D4AF37'
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="8"/>
      <circle cx={cx} cy={cx} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`} transform={`rotate(-90 ${cx} ${cx})`}
        style={{ transition:'stroke-dasharray 0.6s ease' }}/>
      <text x={cx} y={cx-2} textAnchor="middle" fontSize={size*0.2} fontWeight="900" fill="var(--cream)">{done}</text>
      <text x={cx} y={cx+size*0.15} textAnchor="middle" fontSize={size*0.11} fill="var(--muted)">/ {total}</text>
    </svg>
  )
}

// ── Donut multicolor (resumen) ──────────────────────────────────────────────────
function MultiDonut({ items, size=130, centerLabel }: {
  items: { label: string; value: number; color: string }[]
  size?: number; centerLabel?: string
}) {
  const total = items.reduce((s,i)=>s+i.value,0) || 1
  let cum = -Math.PI/2
  const R = (size-14)/2; const r = R*0.62; const c = size/2
  const arcs = items.map(it => {
    const angle = (it.value/total)*2*Math.PI
    if (angle < 0.001) return null
    const x1=c+R*Math.cos(cum), y1=c+R*Math.sin(cum)
    cum+=angle
    const x2=c+R*Math.cos(cum), y2=c+R*Math.sin(cum)
    const x3=c+r*Math.cos(cum), y3=c+r*Math.sin(cum)
    const x4=c+r*Math.cos(cum-angle), y4=c+r*Math.sin(cum-angle)
    const lg = angle>Math.PI?1:0
    return { d:`M ${x1} ${y1} A ${R} ${R} 0 ${lg} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${lg} 0 ${x4} ${y4} Z`, color:it.color }
  })
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink:0 }}>
      {arcs.map((a,i)=> a && <path key={i} d={a.d} fill={a.color}/>)}
      {centerLabel && (
        <>
          <text x={c} y={c-2} textAnchor="middle" fontSize={size*0.22} fontWeight="900" fill="var(--cream)">{centerLabel}</text>
          <text x={c} y={c+size*0.13} textAnchor="middle" fontSize={size*0.08} fill="var(--muted)">Completado</text>
        </>
      )}
    </svg>
  )
}

// ── KPI Card desktop ────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, icon:Icon, color, donut }: {
  label: string; value: React.ReactNode; sub: string
  icon: React.ElementType; color: string; donut?: React.ReactNode
}) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'16px 18px',
      display:'flex', justifyContent:'space-between', alignItems:'center', flex:'1 1 200px' }}>
      <div>
        <p style={{ fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:'0.08em', marginBottom:8 }}>{label}</p>
        <p style={{ fontSize:30, fontWeight:900, color:'var(--cream)', letterSpacing:'-1px', lineHeight:1 }}>{value}</p>
        <p style={{ fontSize:11, color:'var(--muted)', marginTop:4 }}>{sub}</p>
      </div>
      {donut ?? (
        <div style={{ width:48, height:48, borderRadius:12, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <Icon size={22} color={color}/>
        </div>
      )}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  misiones: MisionEnriquecida[]
  proxima: ProximaPreview[]
  historial: HistorialSemana[]
  semana: string
  semanaNext: string
  consejos: string[]
  isAdmin: boolean
  vendedorActual: string | null
  vendedorNombre: string | null
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function MisionesClient({
  misiones: misionesProp, proxima, historial, semana, semanaNext,
  consejos, isAdmin, vendedorActual, vendedorNombre,
}: Props) {
  const isDesktop = useIsDesktop()
  const router    = useRouter()

  const [misiones,  setMisiones]  = useState<MisionEnriquecida[]>(misionesProp)
  const [tab,       setTab]       = useState<Tab>('semana')
  const [toggling,  setToggling]  = useState<string | null>(null)
  const [generating,setGenerating]= useState(false)
  const [genError,  setGenError]  = useState<string | null>(null)
  const [verTodas,  setVerTodas]  = useState(false)
  const [prioFiltro,setPrioFiltro]= useState<'todas'|'Alta'|'Media'|'Baja'>('todas')
  const [showFiltro,setShowFiltro]= useState(false)

  useEffect(() => { setMisiones(misionesProp) }, [misionesProp])

  // ── Stats ───────────────────────────────────────────────────────────────────
  const total       = misiones.length
  const completadas  = misiones.filter(m=>m.estado==='completada')
  const pendientes   = misiones.filter(m=>m.estado==='pendiente')
  const done         = completadas.length
  const pct          = total>0 ? Math.round((done/total)*100) : 0
  const noContactar  = misiones.filter(m=>m.alert_level==='proximo' && m.estado==='pendiente').length

  const porPrioridad = {
    Alta:  misiones.filter(m=>m.prioridad==='Alta').length,
    Media: misiones.filter(m=>m.prioridad==='Media').length,
    Baja:  misiones.filter(m=>m.prioridad==='Baja').length,
  }

  // Desglose por vendedor (admin)
  const vendedores = useMemo(()=>[...new Set(misiones.map(m=>m.vendedor))], [misiones])
  const desglose = vendedores.map(v=>{
    const ms = misiones.filter(m=>m.vendedor===v)
    return { v, total:ms.length, done:ms.filter(m=>m.estado==='completada').length }
  })

  // ── Generar / actualizar (admin) ──────────────────────────────────────────────
  const handleGenerar = async () => {
    setGenerating(true); setGenError(null)
    try {
      const res = await fetch('/api/misiones?action=generar', { method:'POST' })
      const data = await res.json()
      if (!res.ok || data.error) { setGenError(data.error ?? 'Error al generar'); return }
      // recargar desde servidor para traer datos enriquecidos
      router.refresh()
    } catch { setGenError('Error de conexión') }
    finally { setGenerating(false) }
  }

  // ── Toggle completado ───────────────────────────────────────────────────────
  const handleToggle = useCallback(async (m: MisionEnriquecida) => {
    if (toggling) return
    setToggling(m.id)
    const isDone = m.estado === 'completada'
    setMisiones(prev => prev.map(it => it.id===m.id
      ? { ...it, estado: isDone?'pendiente':'completada', completado_at: isDone?null:new Date().toISOString() }
      : it))
    try {
      const res = await fetch(`/api/misiones?action=${isDone?'deshacer':'completar'}`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ mision_id:m.id }),
      })
      if (!res.ok) throw new Error()
    } catch {
      setMisiones(prev => prev.map(it => it.id===m.id ? m : it))
    } finally { setToggling(null) }
  }, [toggling])

  // ── Lista filtrada ──────────────────────────────────────────────────────────
  const misionesVista = useMemo(()=>{
    let res = misiones
    if (prioFiltro !== 'todas') res = res.filter(m=>m.prioridad===prioFiltro)
    return res
  }, [misiones, prioFiltro])

  const LIMITE = 7
  const misionesMostradas = verTodas ? misionesVista : misionesVista.slice(0, LIMITE)

  const sinMisiones = total === 0
  const puedeToggle = (m: MisionEnriquecida) => isAdmin || m.vendedor === vendedorActual

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER MÓVIL
  // ════════════════════════════════════════════════════════════════════════════
  if (!isDesktop) {
    return (
      <div style={{ padding:'14px 14px 90px', maxWidth:520, margin:'0 auto' }}>
        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
          <div>
            <h1 style={{ fontSize:22, fontWeight:900, color:'var(--cream)', letterSpacing:'-0.5px' }}>Misiones</h1>
            <p style={{ fontSize:12, color:'var(--muted)' }}>Esta semana ({rangoSemana(semana).replace(/ \d{4}$/,'')})</p>
          </div>
          {isAdmin && (
            <button onClick={handleGenerar} disabled={generating}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'7px 12px', borderRadius:10,
                background:'rgba(212,175,55,0.12)', border:'1px solid rgba(212,175,55,0.3)',
                color:'var(--gold)', fontSize:11, fontWeight:700, cursor:'pointer', opacity:generating?0.6:1 }}>
              <Zap size={13}/> {generating?'…':'Actualizar'}
            </button>
          )}
        </div>

        {genError && (
          <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:10, padding:'10px 14px', marginBottom:12 }}>
            <p style={{ fontSize:12, color:'#F87171' }}>{genError}</p>
          </div>
        )}

        {/* Progreso */}
        <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'16px', marginBottom:12,
          display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <p style={{ fontSize:11, fontWeight:700, color:'var(--muted)', letterSpacing:'0.05em', marginBottom:6 }}>PROGRESO SEMANAL</p>
            <p style={{ fontSize:26, fontWeight:900, color:'var(--cream)', lineHeight:1 }}>{done} <span style={{ fontSize:15, color:'var(--muted)', fontWeight:400 }}>/ {total}</span></p>
            <p style={{ fontSize:12, color:pct>=90?'#34D399':'var(--muted)', marginTop:4 }}>{pct}% completado</p>
          </div>
          <ProgressDonut done={done} total={total} size={90}/>
        </div>

        {/* Mini stats */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:14 }}>
          {[
            { icon:Target,      label:'Asignados',   val:total,           color:'#D4AF37' },
            { icon:Phone,       label:'Contactados', val:done,            color:'#34D399' },
            { icon:Clock,       label:'Pendientes',  val:pendientes.length,color:'#F59E0B' },
            { icon:PhoneOff,    label:'No contactar',val:0,               color:'#6B7280' },
          ].map(s=>(
            <div key={s.label} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'10px 4px', textAlign:'center' }}>
              <s.icon size={15} color={s.color} style={{ margin:'0 auto 4px' }}/>
              <p style={{ fontSize:18, fontWeight:900, color:'var(--cream)', lineHeight:1 }}>{s.val}</p>
              <p style={{ fontSize:9, color:'var(--muted)', marginTop:3 }}>{s.label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:6, marginBottom:14 }}>
          {([['semana','Misiones'],['proxima','Próxima semana'],['historial','Historial']] as [Tab,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)}
              style={{ flex:1, padding:'8px 6px', borderRadius:10, cursor:'pointer', border:'none',
                background: tab===k?'var(--gold)':'var(--surface)', color: tab===k?'#080808':'var(--muted)',
                fontSize:11, fontWeight: tab===k?800:500, whiteSpace:'nowrap' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Contenido */}
        {tab==='semana' && (
          sinMisiones ? <EmptyState isAdmin={isAdmin} onGenerar={handleGenerar} generating={generating}/> : (
            <>
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {misionesMostradas.map(m=>(
                  <MobileRow key={m.id} m={m} onToggle={handleToggle} toggling={toggling===m.id} canToggle={puedeToggle(m)} onOpen={()=>router.push('/ventas/clientes')}/>
                ))}
              </div>
              {misionesVista.length > LIMITE && (
                <button onClick={()=>setVerTodas(v=>!v)}
                  style={{ width:'100%', marginTop:12, padding:'12px', borderRadius:12, cursor:'pointer',
                    background:'var(--gold)', border:'none', color:'#080808', fontSize:13, fontWeight:800 }}>
                  {verTodas ? 'Ver menos' : `Ver todas las misiones (${misionesVista.length})`}
                </button>
              )}
            </>
          )
        )}
        {tab==='proxima' && <ProximaSemana proxima={proxima} semanaNext={semanaNext}/>}
        {tab==='historial' && <HistorialView historial={historial}/>}
      </div>
    )
  }

  // ════════════════════════════════════════════════════════════════════════════
  // RENDER DESKTOP
  // ════════════════════════════════════════════════════════════════════════════
  return (
    <div style={{ padding:'24px 28px 60px', maxWidth:1280, margin:'0 auto', width:'100%' }}>

      {/* Encabezado */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:24, fontWeight:900, color:'var(--cream)', letterSpacing:'-0.5px' }}>Misiones</h1>
          <p style={{ fontSize:13, color:'var(--muted)', marginTop:2 }}>Tus clientes objetivo para esta semana</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, padding:'8px 14px' }}>
            <Calendar size={14} color="var(--muted)"/>
            <span style={{ fontSize:12, color:'var(--cream)', fontWeight:600 }}>{rangoSemana(semana)}</span>
          </div>
          {isAdmin && (
            <button onClick={handleGenerar} disabled={generating}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 16px', borderRadius:10,
                background:'rgba(212,175,55,0.12)', border:'1px solid rgba(212,175,55,0.3)',
                color:'var(--gold)', fontSize:12, fontWeight:700, cursor:'pointer', opacity:generating?0.6:1 }}>
              <RefreshCw size={14} style={{ animation: generating?'spin 1s linear infinite':'none' }}/>
              {generating ? 'Generando…' : 'Actualizar'}
            </button>
          )}
        </div>
      </div>

      {genError && (
        <div style={{ background:'rgba(239,68,68,0.08)', border:'1px solid rgba(239,68,68,0.25)', borderRadius:12, padding:'12px 16px', marginBottom:16 }}>
          <p style={{ fontSize:12, color:'#F87171', fontWeight:600 }}>{genError}</p>
        </div>
      )}

      {/* KPI Cards */}
      <div style={{ display:'flex', gap:12, flexWrap:'wrap', marginBottom:20 }}>
        <KpiCard label="MISIÓN SEMANAL" value={total} sub="Asignados esta semana" icon={Target} color="#D4AF37"/>
        <KpiCard label="PROGRESO" value={`${done} / ${total}`} sub={`${pct}% completado`} icon={CheckCircle2} color="#F59E0B"
          donut={<ProgressDonut done={done} total={total} size={56}/>}/>
        <KpiCard label="CONTACTOS REALIZADOS" value={done} sub="Esta semana" icon={Phone} color="#34D399"/>
        <KpiCard label="PENDIENTES" value={pendientes.length} sub="Por contactar" icon={Clock} color="#F59E0B"/>
      </div>

      {/* Tabs + Filtrar */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
        <div style={{ display:'flex', gap:8 }}>
          {([['semana','Esta semana'],['proxima','Próxima semana'],['historial','Historial']] as [Tab,string][]).map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)}
              style={{ padding:'8px 18px', borderRadius:10, cursor:'pointer', border:'none',
                background: tab===k?'var(--gold)':'var(--surface)', color: tab===k?'#080808':'var(--muted)',
                fontSize:13, fontWeight: tab===k?800:500 }}>
              {l}
            </button>
          ))}
        </div>
        {tab==='semana' && (
          <div style={{ position:'relative' }}>
            <button onClick={()=>setShowFiltro(s=>!s)}
              style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 14px', borderRadius:10,
                background:'var(--surface)', border:'1px solid var(--border)', color:'var(--muted)', fontSize:12, cursor:'pointer' }}>
              <Filter size={13}/> {prioFiltro==='todas'?'Filtrar':`Prioridad ${prioFiltro}`} <ChevronDown size={12}/>
            </button>
            {showFiltro && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', right:0, zIndex:50, background:'#1a1a1a',
                border:'1px solid var(--border)', borderRadius:12, overflow:'hidden', minWidth:150 }}>
                {(['todas','Alta','Media','Baja'] as const).map(p=>(
                  <button key={p} onClick={()=>{setPrioFiltro(p);setShowFiltro(false);setVerTodas(false)}}
                    style={{ display:'block', width:'100%', padding:'10px 14px', textAlign:'left', border:'none',
                      background: prioFiltro===p?'rgba(212,175,55,0.1)':'transparent',
                      color: prioFiltro===p?'var(--gold)':'var(--cream)', fontSize:12, cursor:'pointer' }}>
                    {p==='todas'?'Todas las prioridades':`Prioridad ${p}`}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contenido por tab */}
      {tab==='semana' && (
        <>
          {/* Tabla principal */}
          <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'18px 20px', marginBottom:16 }}>
            <p style={{ fontSize:15, fontWeight:800, color:'var(--cream)', marginBottom:16 }}>Tus misiones de esta semana</p>

            {sinMisiones ? <EmptyState isAdmin={isAdmin} onGenerar={handleGenerar} generating={generating}/> : (
              <>
                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom:'1px solid var(--border)' }}>
                      {['CLIENTE','RUTA','PRIORIDAD','ÚLTIMO PEDIDO','FRECUENCIA','ESTADO',''].map(h=>(
                        <th key={h} style={{ padding:'8px 10px', textAlign:'left', fontSize:9, fontWeight:700, color:'var(--muted)', letterSpacing:'0.08em' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {misionesMostradas.map(m=>(
                      <DesktopRow key={m.id} m={m} onToggle={handleToggle} toggling={toggling===m.id} canToggle={puedeToggle(m)} onOpen={()=>router.push('/ventas/clientes')}/>
                    ))}
                  </tbody>
                </table>
                {misionesVista.length > LIMITE && (
                  <button onClick={()=>setVerTodas(v=>!v)}
                    style={{ width:'100%', marginTop:14, padding:'10px', borderRadius:10, cursor:'pointer',
                      background:'transparent', border:'none', color:'var(--muted)', fontSize:12, fontWeight:600,
                      display:'flex', alignItems:'center', justifyContent:'center', gap:6 }}>
                    <ChevronDown size={14} style={{ transform: verTodas?'rotate(180deg)':'none' }}/>
                    {verTodas ? 'Ver menos' : `Ver más misiones (${misionesVista.length - LIMITE})`}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Fila inferior: Resumen + Distribución + Consejos */}
          {!sinMisiones && (
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14 }}>
              {/* Resumen de la semana */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'18px 20px' }}>
                <p style={{ fontSize:14, fontWeight:800, color:'var(--cream)', marginBottom:14 }}>Resumen de la semana</p>
                <div style={{ display:'flex', alignItems:'center', gap:16 }}>
                  <MultiDonut size={120} centerLabel={`${pct}%`}
                    items={[
                      { label:'Completado', value:done, color:'#34D399' },
                      { label:'Pendiente', value:pendientes.length, color:'#F59E0B' },
                    ]}/>
                  <div style={{ flex:1, display:'flex', flexDirection:'column', gap:8 }}>
                    {[
                      { label:'Contactados', val:done, pct:pct, color:'#34D399' },
                      { label:'Pendientes', val:pendientes.length, pct:100-pct, color:'#F59E0B' },
                      { label:'No contactar', val:0, pct:0, color:'#F87171' },
                    ].map(it=>(
                      <div key={it.label} style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ width:8, height:8, borderRadius:'50%', background:it.color }}/>
                        <span style={{ fontSize:11, color:'var(--muted)', flex:1 }}>{it.label}</span>
                        <span style={{ fontSize:11, fontWeight:700, color:'var(--cream)' }}>{it.val} ({it.pct}%)</span>
                      </div>
                    ))}
                  </div>
                </div>
                <p style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:14, fontStyle:'italic' }}>
                  {pct>=70 ? '¡Vas por buen camino! 👏' : pct>=40 ? 'Sigue así, vas avanzando 💪' : '¡A contactar clientes! 🎯'}
                </p>
              </div>

              {/* Distribución por prioridad */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'18px 20px' }}>
                <p style={{ fontSize:14, fontWeight:800, color:'var(--cream)', marginBottom:18 }}>Distribución por prioridad</p>
                {([['Alta','#EF4444'],['Media','#F59E0B'],['Baja','#34D399']] as [keyof typeof porPrioridad,string][]).map(([p,color])=>{
                  const val = porPrioridad[p]
                  const max = Math.max(...Object.values(porPrioridad), 1)
                  return (
                    <div key={p} style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                      <span style={{ fontSize:12, color:'var(--muted)', width:48 }}>{p}</span>
                      <div style={{ flex:1, height:8, background:'rgba(255,255,255,0.06)', borderRadius:8, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${(val/max)*100}%`, background:color, borderRadius:8, transition:'width 0.5s' }}/>
                      </div>
                      <span style={{ fontSize:13, fontWeight:800, color:'var(--cream)', width:24, textAlign:'right' }}>{val}</span>
                    </div>
                  )
                })}
                <p style={{ fontSize:11, color:'var(--muted)', textAlign:'center', marginTop:8, fontStyle:'italic' }}>
                  Enfócate en las prioridades altas
                </p>
              </div>

              {/* Consejos del día */}
              <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'18px 20px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14 }}>
                  <Lightbulb size={15} color="#D4AF37"/>
                  <p style={{ fontSize:14, fontWeight:800, color:'var(--cream)' }}>Consejos del día</p>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  {consejos.slice(0,3).map((c,i)=>(
                    <div key={i} style={{ background:'rgba(212,175,55,0.05)', border:'1px solid rgba(212,175,55,0.12)', borderRadius:10, padding:'12px 14px' }}>
                      <p style={{ fontSize:12, color:'#ddd', lineHeight:1.5 }}>{c}</p>
                    </div>
                  ))}
                </div>
                <button onClick={()=>{ setTab('semana'); setPrioFiltro('Alta'); setVerTodas(true) }}
                  style={{ marginTop:14, width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                    background:'none', border:'none', color:'var(--gold)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                  Ver sugerencias de contacto <ChevronRight size={14}/>
                </button>
              </div>
            </div>
          )}

          {/* Desglose por vendedor (admin) */}
          {isAdmin && !sinMisiones && desglose.length>1 && (
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'16px 20px', marginTop:14 }}>
              <p style={{ fontSize:13, fontWeight:800, color:'var(--cream)', marginBottom:14 }}>Progreso por vendedor</p>
              <div style={{ display:'flex', gap:20 }}>
                {desglose.map(({v,total:vt,done:vd})=>{
                  const c = VEND_COLOR[v]??'#888'
                  const vpct = vt>0?Math.round((vd/vt)*100):0
                  return (
                    <div key={v} style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:6 }}>
                        <User size={12} color={c}/>
                        <span style={{ fontSize:12, color:c, fontWeight:700 }}>{v.split(' ')[0]}</span>
                        <span style={{ fontSize:11, color:'var(--muted)', marginLeft:'auto' }}>{vd}/{vt} · {vpct}%</span>
                      </div>
                      <div style={{ height:6, background:'rgba(255,255,255,0.06)', borderRadius:6, overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${vpct}%`, background:c, borderRadius:6 }}/>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab==='proxima'  && <ProximaSemana proxima={proxima} semanaNext={semanaNext}/>}
      {tab==='historial'&& <HistorialView historial={historial}/>}

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}

// ── Fila desktop ──────────────────────────────────────────────────────────────
function DesktopRow({ m, onToggle, toggling, canToggle, onOpen }: {
  m: MisionEnriquecida; onToggle: (m:MisionEnriquecida)=>void; toggling: boolean; canToggle: boolean; onOpen: ()=>void
}) {
  const seg = m.segmento ?? 'E'; const segColor = SEG_COLOR[seg]??'#888'
  const vendColor = VEND_COLOR[m.vendedor]??'#888'
  const prio = PRIO_CFG[m.prioridad]
  const done = m.estado==='completada'

  return (
    <tr style={{ borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
      {/* Cliente */}
      <td style={{ padding:'12px 10px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer' }} onClick={onOpen}>
          <div style={{ width:38, height:38, borderRadius:10, flexShrink:0, background:`${segColor}18`, border:`1.5px solid ${segColor}44`,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
            <span style={{ fontSize:13, fontWeight:900, color:segColor, lineHeight:1.1 }}>{seg}</span>
            <span style={{ fontSize:7, fontWeight:700, color:segColor, opacity:0.7 }}>{m.score}</span>
          </div>
          <div>
            <p style={{ fontSize:13, fontWeight:700, color: done?'var(--muted)':'var(--cream)', textDecoration: done?'line-through':'none' }}>{m.nombre_fantasia}</p>
            <p style={{ fontSize:10, color:vendColor }}>{m.vendedor.split(' ')[0]}{m.localidad?` · ${m.localidad}`:''}</p>
          </div>
        </div>
      </td>
      {/* Ruta */}
      <td style={{ padding:'12px 10px' }}>
        <span style={{ fontSize:11, padding:'4px 10px', borderRadius:8, background:'rgba(255,255,255,0.05)', border:'1px solid var(--border)', color:'var(--cream)', whiteSpace:'nowrap' }}>
          {m.ruta_despacho || 'Sin ruta'}
        </span>
      </td>
      {/* Prioridad */}
      <td style={{ padding:'12px 10px' }}>
        <span style={{ fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20, color:prio.color, background:prio.bg, border:`1px solid ${prio.border}` }}>
          {m.prioridad}
        </span>
      </td>
      {/* Último pedido */}
      <td style={{ padding:'12px 10px' }}>
        <p style={{ fontSize:12, color:'var(--cream)', fontWeight:600 }}>{fFecha(m.ultima_venta_fecha)}</p>
        {m.ultima_venta_monto>0 && <p style={{ fontSize:10, color:'var(--muted)' }}>{fPeso(m.ultima_venta_monto)}</p>}
      </td>
      {/* Frecuencia */}
      <td style={{ padding:'12px 10px' }}>
        <span style={{ fontSize:11, color:'var(--muted)' }}>{m.frecuencia_texto}</span>
      </td>
      {/* Estado */}
      <td style={{ padding:'12px 10px' }}>
        {canToggle ? (
          <button onClick={()=>onToggle(m)} disabled={toggling}
            style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:20, cursor:toggling?'wait':'pointer',
              background: done?'rgba(52,211,153,0.12)':'rgba(245,158,11,0.1)',
              border: done?'1px solid rgba(52,211,153,0.3)':'1px solid rgba(245,158,11,0.25)',
              color: done?'#34D399':'#F59E0B', fontSize:11, fontWeight:700, opacity:toggling?0.5:1 }}>
            {done ? <><CheckCircle2 size={12}/> Contactado</> : 'Pendiente'}
          </button>
        ) : (
          <span style={{ fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:20,
            background: done?'rgba(52,211,153,0.12)':'rgba(245,158,11,0.1)', color: done?'#34D399':'#F59E0B' }}>
            {done?'Contactado':'Pendiente'}
          </span>
        )}
      </td>
      {/* Acciones */}
      <td style={{ padding:'12px 10px', textAlign:'right' }}>
        <div style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
          <a href={waUrl(m.nombre_fantasia, m.telefono)} target="_blank" rel="noreferrer"
            style={{ width:30, height:30, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center',
              background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.2)', color:'#25D366' }}>
            <MessageCircle size={14}/>
          </a>
          {canToggle && (
            <button onClick={()=>onToggle(m)} disabled={toggling}
              style={{ width:30, height:30, borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
                background: done?'rgba(52,211,153,0.12)':'rgba(255,255,255,0.04)',
                border: done?'1px solid rgba(52,211,153,0.3)':'1px solid var(--border)',
                color: done?'#34D399':'var(--muted)' }}>
              {done ? <CheckCircle2 size={15}/> : <Circle size={15}/>}
            </button>
          )}
        </div>
      </td>
    </tr>
  )
}

// ── Fila móvil ────────────────────────────────────────────────────────────────
function MobileRow({ m, onToggle, toggling, canToggle, onOpen }: {
  m: MisionEnriquecida; onToggle:(m:MisionEnriquecida)=>void; toggling:boolean; canToggle:boolean; onOpen:()=>void
}) {
  const seg = m.segmento??'E'; const segColor = SEG_COLOR[seg]??'#888'
  const vendColor = VEND_COLOR[m.vendedor]??'#888'
  const done = m.estado==='completada'
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'12px 14px',
      display:'flex', alignItems:'center', gap:10, opacity:done?0.7:1 }}>
      <div onClick={onOpen} style={{ width:40, height:40, borderRadius:10, flexShrink:0, background:`${segColor}18`, border:`1.5px solid ${segColor}44`,
        display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
        <span style={{ fontSize:14, fontWeight:900, color:segColor, lineHeight:1.1 }}>{seg}</span>
        <span style={{ fontSize:7, fontWeight:700, color:segColor, opacity:0.7 }}>{m.score}</span>
      </div>
      <div style={{ flex:1, minWidth:0 }} onClick={onOpen}>
        <p style={{ fontSize:13, fontWeight:700, color: done?'var(--muted)':'var(--cream)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', textDecoration:done?'line-through':'none' }}>{m.nombre_fantasia}</p>
        <p style={{ fontSize:10, color:vendColor }}>{m.vendedor.split(' ')[0]}{m.localidad?` · ${m.localidad}`:''}</p>
      </div>
      {canToggle ? (
        <button onClick={()=>onToggle(m)} disabled={toggling}
          style={{ padding:'4px 10px', borderRadius:20, cursor:'pointer', flexShrink:0,
            background: done?'rgba(52,211,153,0.12)':'rgba(245,158,11,0.1)',
            border: done?'1px solid rgba(52,211,153,0.3)':'1px solid rgba(245,158,11,0.25)',
            color: done?'#34D399':'#F59E0B', fontSize:10, fontWeight:700, opacity:toggling?0.5:1 }}>
          {done?'Contactado':'Pendiente'}
        </button>
      ) : (
        <span style={{ padding:'4px 10px', borderRadius:20, flexShrink:0, fontSize:10, fontWeight:700,
          background: done?'rgba(52,211,153,0.12)':'rgba(245,158,11,0.1)', color: done?'#34D399':'#F59E0B' }}>
          {done?'Contactado':'Pendiente'}
        </span>
      )}
      <a href={waUrl(m.nombre_fantasia, m.telefono)} target="_blank" rel="noreferrer"
        style={{ width:34, height:34, borderRadius:9, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center',
          background:'rgba(37,211,102,0.1)', border:'1px solid rgba(37,211,102,0.2)', color:'#25D366' }}>
        <MessageCircle size={15}/>
      </a>
    </div>
  )
}

// ── Estado vacío ──────────────────────────────────────────────────────────────
function EmptyState({ isAdmin, onGenerar, generating }: { isAdmin:boolean; onGenerar:()=>void; generating:boolean }) {
  return (
    <div style={{ textAlign:'center', padding:'48px 24px' }}>
      <p style={{ fontSize:36, marginBottom:12 }}>🎯</p>
      <p style={{ fontSize:15, fontWeight:800, color:'var(--cream)', marginBottom:6 }}>
        {isAdmin ? 'No hay misiones para esta semana' : 'Sin misiones asignadas'}
      </p>
      <p style={{ fontSize:13, color:'var(--muted)', marginBottom:20 }}>
        {isAdmin ? 'Genera las misiones para asignar contactos a cada vendedor.' : 'El admin generará las misiones semanales pronto.'}
      </p>
      {isAdmin && (
        <button onClick={onGenerar} disabled={generating}
          style={{ display:'inline-flex', alignItems:'center', gap:6, padding:'12px 20px', borderRadius:12, cursor:'pointer',
            background:'rgba(212,175,55,0.15)', border:'1px solid rgba(212,175,55,0.4)', color:'var(--gold)', fontSize:13, fontWeight:700 }}>
          <Zap size={16}/> {generating?'Generando…':'Generar misiones esta semana'}
        </button>
      )}
    </div>
  )
}

// ── Próxima semana ────────────────────────────────────────────────────────────
function ProximaSemana({ proxima, semanaNext }: { proxima: ProximaPreview[]; semanaNext: string }) {
  const router = useRouter()
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'18px 20px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
        <Calendar size={15} color="#60A5FA"/>
        <p style={{ fontSize:15, fontWeight:800, color:'var(--cream)' }}>Preview próxima semana</p>
      </div>
      <p style={{ fontSize:12, color:'var(--muted)', marginBottom:16 }}>
        {proxima.length} clientes proyectados para contactar · {rangoSemana(semanaNext)}
      </p>
      {proxima.length===0 ? (
        <p style={{ fontSize:13, color:'var(--muted)', textAlign:'center', padding:'30px 0' }}>Sin proyecciones para la próxima semana</p>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {proxima.slice(0,15).map((p,i)=>{
            const segColor = SEG_COLOR[p.segmento]??'#888'
            const alertColor = p.alert_level==='critico'?'#EF4444':p.alert_level==='vencido'?'#F87171':'#F59E0B'
            return (
              <div key={i} onClick={()=>router.push('/ventas/clientes')}
                style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:'1px solid rgba(255,255,255,0.04)', cursor:'pointer' }}>
                <span style={{ fontSize:10, fontWeight:900, padding:'2px 7px', borderRadius:6, background:`${segColor}22`, color:segColor, border:`1px solid ${segColor}44`, flexShrink:0 }}>
                  {p.segmento} {p.score}
                </span>
                <span style={{ fontSize:12, fontWeight:600, color:'var(--cream)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.nombre_fantasia}</span>
                <span style={{ fontSize:10, color:'var(--muted)' }}>{p.vendedor_actual?.split(' ')[0]}</span>
                <span style={{ fontSize:11, fontWeight:700, color:alertColor, flexShrink:0 }}>{p.dias_sin_compra}d</span>
              </div>
            )
          })}
          {proxima.length>15 && <p style={{ fontSize:11, color:'var(--muted)', textAlign:'center', paddingTop:8 }}>+{proxima.length-15} más</p>}
        </div>
      )}
    </div>
  )
}

// ── Historial ─────────────────────────────────────────────────────────────────
function HistorialView({ historial }: { historial: HistorialSemana[] }) {
  if (historial.length===0)
    return (
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:18, padding:'48px 24px', textAlign:'center' }}>
        <p style={{ fontSize:32, marginBottom:10 }}>📅</p>
        <p style={{ fontSize:14, fontWeight:700, color:'var(--cream)' }}>Sin historial todavía</p>
        <p style={{ fontSize:12, color:'var(--muted)', marginTop:4 }}>Las semanas anteriores aparecerán aquí</p>
      </div>
    )
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {historial.map(h=>{
        const pct = h.total>0?Math.round((h.completadas/h.total)*100):0
        const color = pct>=80?'#34D399':pct>=50?'#F59E0B':'#F87171'
        return (
          <div key={h.semana} style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:16, padding:'16px 18px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <Calendar size={14} color="var(--muted)"/>
                <span style={{ fontSize:13, fontWeight:700, color:'var(--cream)' }}>{rangoSemana(h.semana)}</span>
              </div>
              <span style={{ fontSize:13, fontWeight:900, color }}>{pct}%</span>
            </div>
            <div style={{ height:8, background:'rgba(255,255,255,0.06)', borderRadius:8, overflow:'hidden', marginBottom:6 }}>
              <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:8 }}/>
            </div>
            <p style={{ fontSize:11, color:'var(--muted)' }}>
              {h.completadas} de {h.total} contactos completados
            </p>
          </div>
        )
      })}
    </div>
  )
}
