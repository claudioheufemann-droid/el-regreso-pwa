'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Truck, Plus, AlertTriangle, CheckCircle, Clock, ChevronLeft, ChevronRight, Wrench } from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'
import type { AppUser } from '@/lib/auth'

const F = '#F97316'
const F_DIM = 'rgba(249,115,22,0.12)'
const F_BORDER = 'rgba(249,115,22,0.28)'

/* ── SVG Cinematográfico por tipo de vehículo ── */
function TransitArt() {
  return (
    <svg viewBox="0 0 260 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
      {/* Carretera perspectiva */}
      <path d="M0,110 L260,80" stroke="#F97316" strokeOpacity="0.06" strokeWidth="28"/>
      <path d="M0,110 L260,82" stroke="#F97316" strokeOpacity="0.04" strokeWidth="45"/>
      {/* Cuerpo furgón — más ancho y alto */}
      <rect x="70" y="30" width="140" height="70" rx="6" fill="#F97316" fillOpacity="0.14" stroke="#F97316" strokeOpacity="0.3" strokeWidth="1.2"/>
      {/* Techo con curvatura */}
      <path d="M72,36 Q100,24 160,24 L208,24 L210,36Z" fill="#F97316" fillOpacity="0.22"/>
      {/* Cabina separada */}
      <rect x="195" y="34" width="52" height="56" rx="5" fill="#F97316" fillOpacity="0.28" stroke="#F97316" strokeOpacity="0.45" strokeWidth="1.2"/>
      {/* Parabrisas */}
      <path d="M198,38 L196,58 L218,58 L218,38Z" fill="#F97316" fillOpacity="0.35"/>
      {/* Ventanas laterales */}
      <rect x="80" y="38" width="30" height="20" rx="3" fill="#F97316" fillOpacity="0.2"/>
      <rect x="116" y="38" width="30" height="20" rx="3" fill="#F97316" fillOpacity="0.15"/>
      <rect x="152" y="38" width="30" height="20" rx="3" fill="#F97316" fillOpacity="0.1"/>
      {/* Puerta lateral */}
      <line x1="148" y1="30" x2="148" y2="100" stroke="#F97316" strokeOpacity="0.2" strokeWidth="1"/>
      {/* Ruedas */}
      <circle cx="108" cy="102" r="14" fill="#1a1a1a" stroke="#F97316" strokeOpacity="0.5" strokeWidth="2"/>
      <circle cx="108" cy="102" r="7" fill="#F97316" fillOpacity="0.25" stroke="#F97316" strokeOpacity="0.4" strokeWidth="1.5"/>
      <circle cx="108" cy="102" r="3" fill="#F97316" fillOpacity="0.5"/>
      <circle cx="218" cy="102" r="14" fill="#1a1a1a" stroke="#F97316" strokeOpacity="0.5" strokeWidth="2"/>
      <circle cx="218" cy="102" r="7" fill="#F97316" fillOpacity="0.25" stroke="#F97316" strokeOpacity="0.4" strokeWidth="1.5"/>
      <circle cx="218" cy="102" r="3" fill="#F97316" fillOpacity="0.5"/>
      {/* Luz trasera */}
      <rect x="70" y="40" width="6" height="22" rx="2" fill="#F97316" fillOpacity="0.6"/>
      <rect x="70" y="40" width="6" height="22" rx="2" fill="#F97316" fillOpacity="0.3"/>
      {/* Luz delantera */}
      <ellipse cx="256" cy="62" rx="14" ry="5" fill="#F97316" fillOpacity="0.2"/>
      <circle cx="248" cy="62" r="4" fill="#F97316" fillOpacity="0.9"/>
      {/* Highlight techo — iluminación lateral */}
      <path d="M72,25 Q160,20 210,26" stroke="#F97316" strokeOpacity="0.5" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Reflejo carrocería */}
      <path d="M72,55 L148,55" stroke="white" strokeOpacity="0.06" strokeWidth="1"/>
      {/* Motion streaks */}
      <line x1="0" y1="58" x2="62" y2="55" stroke="#F97316" strokeOpacity="0.18" strokeWidth="2" strokeLinecap="round"/>
      <line x1="0" y1="65" x2="60" y2="63" stroke="#F97316" strokeOpacity="0.1" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="0" y1="72" x2="58" y2="70" stroke="#F97316" strokeOpacity="0.06" strokeWidth="1" strokeLinecap="round"/>
      {/* Glow ambiental */}
      <ellipse cx="160" cy="70" rx="80" ry="40" fill="#F97316" fillOpacity="0.04"/>
    </svg>
  )
}

function PorterArt() {
  return (
    <svg viewBox="0 0 260 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
      {/* Carretera */}
      <path d="M0,108 L260,85" stroke="#F97316" strokeOpacity="0.05" strokeWidth="35"/>
      {/* Plataforma/caja trasera */}
      <rect x="60" y="42" width="118" height="56" rx="3" fill="#F97316" fillOpacity="0.1" stroke="#F97316" strokeOpacity="0.22" strokeWidth="1"/>
      {/* Estructura interna caja */}
      <line x1="80" y1="42" x2="80" y2="98" stroke="#F97316" strokeOpacity="0.12" strokeWidth="1"/>
      <line x1="100" y1="42" x2="100" y2="98" stroke="#F97316" strokeOpacity="0.08" strokeWidth="1"/>
      <line x1="120" y1="42" x2="120" y2="98" stroke="#F97316" strokeOpacity="0.08" strokeWidth="1"/>
      <line x1="140" y1="42" x2="140" y2="98" stroke="#F97316" strokeOpacity="0.08" strokeWidth="1"/>
      <line x1="60" y1="68" x2="178" y2="68" stroke="#F97316" strokeOpacity="0.1" strokeWidth="1"/>
      {/* Cabina */}
      <rect x="178" y="34" width="64" height="64" rx="6" fill="#F97316" fillOpacity="0.22" stroke="#F97316" strokeOpacity="0.4" strokeWidth="1.5"/>
      {/* Techo cabina */}
      <path d="M180,40 Q196,22 224,22 L240,22 L242,40Z" fill="#F97316" fillOpacity="0.28"/>
      {/* Parabrisas */}
      <path d="M182,42 L180,64 L210,64 L210,42Z" fill="#F97316" fillOpacity="0.3"/>
      {/* Ventana lateral cabina */}
      <rect x="214" y="42" width="24" height="20" rx="3" fill="#F97316" fillOpacity="0.2"/>
      {/* Ruedas */}
      <circle cx="96" cy="103" r="13" fill="#111" stroke="#F97316" strokeOpacity="0.45" strokeWidth="2"/>
      <circle cx="96" cy="103" r="6" fill="#F97316" fillOpacity="0.2" stroke="#F97316" strokeOpacity="0.35" strokeWidth="1.5"/>
      <circle cx="96" cy="103" r="3" fill="#F97316" fillOpacity="0.55"/>
      <circle cx="145" cy="103" r="13" fill="#111" stroke="#F97316" strokeOpacity="0.45" strokeWidth="2"/>
      <circle cx="145" cy="103" r="6" fill="#F97316" fillOpacity="0.2" stroke="#F97316" strokeOpacity="0.35" strokeWidth="1.5"/>
      <circle cx="145" cy="103" r="3" fill="#F97316" fillOpacity="0.55"/>
      <circle cx="220" cy="103" r="13" fill="#111" stroke="#F97316" strokeOpacity="0.45" strokeWidth="2"/>
      <circle cx="220" cy="103" r="6" fill="#F97316" fillOpacity="0.2" stroke="#F97316" strokeOpacity="0.35" strokeWidth="1.5"/>
      <circle cx="220" cy="103" r="3" fill="#F97316" fillOpacity="0.55"/>
      {/* Luz delantera */}
      <ellipse cx="252" cy="66" rx="10" ry="4" fill="#F97316" fillOpacity="0.25"/>
      <circle cx="244" cy="66" r="4" fill="#F97316" fillOpacity="0.9"/>
      {/* Highlight techo */}
      <path d="M180,24 Q212,18 242,24" stroke="#F97316" strokeOpacity="0.5" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Motion streaks */}
      <line x1="0" y1="55" x2="52" y2="52" stroke="#F97316" strokeOpacity="0.16" strokeWidth="2" strokeLinecap="round"/>
      <line x1="0" y1="63" x2="50" y2="61" stroke="#F97316" strokeOpacity="0.1" strokeWidth="1.5" strokeLinecap="round"/>
      <line x1="0" y1="71" x2="48" y2="70" stroke="#F97316" strokeOpacity="0.06" strokeWidth="1" strokeLinecap="round"/>
      <ellipse cx="160" cy="72" rx="85" ry="35" fill="#F97316" fillOpacity="0.04"/>
    </svg>
  )
}

function RangerArt() {
  return (
    <svg viewBox="0 0 260 120" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ width:'100%', height:'100%' }}>
      {/* Carretera */}
      <path d="M0,112 L260,88" stroke="#F97316" strokeOpacity="0.06" strokeWidth="32"/>
      {/* Caja pickup */}
      <rect x="62" y="44" width="90" height="52" rx="4" fill="#F97316" fillOpacity="0.1" stroke="#F97316" strokeOpacity="0.2" strokeWidth="1"/>
      {/* Detalle caja */}
      <line x1="62" y1="64" x2="152" y2="64" stroke="#F97316" strokeOpacity="0.12" strokeWidth="1"/>
      {/* Cabina doble */}
      <rect x="152" y="30" width="98" height="66" rx="7" fill="#F97316" fillOpacity="0.2" stroke="#F97316" strokeOpacity="0.38" strokeWidth="1.5"/>
      {/* Techo cabina con curvatura premium */}
      <path d="M155,36 Q176,16 218,16 Q240,16 248,28 L250,36Z" fill="#F97316" fillOpacity="0.3"/>
      {/* Parabrisas inclinado */}
      <path d="M158,38 L155,62 L196,62 L196,38Z" fill="#F97316" fillOpacity="0.28"/>
      {/* Ventanas laterales */}
      <rect x="200" y="38" width="24" height="20" rx="3" fill="#F97316" fillOpacity="0.22"/>
      <rect x="228" y="38" width="18" height="20" rx="3" fill="#F97316" fillOpacity="0.18"/>
      {/* Capó prominente */}
      <path d="M248,62 L250,52 L260,52 L260,62Z" fill="#F97316" fillOpacity="0.3"/>
      {/* Parrilla */}
      <rect x="248" y="62" width="12" height="18" rx="2" fill="#F97316" fillOpacity="0.4" stroke="#F97316" strokeOpacity="0.6" strokeWidth="1"/>
      <line x1="249" y1="66" x2="259" y2="66" stroke="#F97316" strokeOpacity="0.4" strokeWidth="0.8"/>
      <line x1="249" y1="70" x2="259" y2="70" stroke="#F97316" strokeOpacity="0.4" strokeWidth="0.8"/>
      <line x1="249" y1="74" x2="259" y2="74" stroke="#F97316" strokeOpacity="0.4" strokeWidth="0.8"/>
      {/* Luz delantera premium */}
      <ellipse cx="258" cy="58" rx="12" ry="4" fill="#F97316" fillOpacity="0.3"/>
      <rect x="248" y="54" width="4" height="10" rx="2" fill="#F97316" fillOpacity="0.9"/>
      {/* Estribo lateral */}
      <rect x="100" y="94" width="148" height="5" rx="2" fill="#F97316" fillOpacity="0.15"/>
      {/* Ruedas grandes — pickup */}
      <circle cx="108" cy="102" r="15" fill="#111" stroke="#F97316" strokeOpacity="0.5" strokeWidth="2.5"/>
      <circle cx="108" cy="102" r="8" fill="#F97316" fillOpacity="0.18" stroke="#F97316" strokeOpacity="0.4" strokeWidth="1.5"/>
      <circle cx="108" cy="102" r="3.5" fill="#F97316" fillOpacity="0.6"/>
      <circle cx="222" cy="102" r="15" fill="#111" stroke="#F97316" strokeOpacity="0.5" strokeWidth="2.5"/>
      <circle cx="222" cy="102" r="8" fill="#F97316" fillOpacity="0.18" stroke="#F97316" strokeOpacity="0.4" strokeWidth="1.5"/>
      <circle cx="222" cy="102" r="3.5" fill="#F97316" fillOpacity="0.6"/>
      {/* Highlight techo largo */}
      <path d="M156,18 Q200,14 248,20" stroke="#F97316" strokeOpacity="0.55" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
      {/* Highlight guardabarro */}
      <path d="M152,70 Q160,66 172,68" stroke="white" strokeOpacity="0.08" strokeWidth="1"/>
      {/* Motion streaks */}
      <line x1="0" y1="52" x2="54" y2="49" stroke="#F97316" strokeOpacity="0.2" strokeWidth="2.5" strokeLinecap="round"/>
      <line x1="0" y1="60" x2="52" y2="58" stroke="#F97316" strokeOpacity="0.12" strokeWidth="2" strokeLinecap="round"/>
      <line x1="0" y1="68" x2="50" y2="67" stroke="#F97316" strokeOpacity="0.07" strokeWidth="1.5" strokeLinecap="round"/>
      {/* Glow potente */}
      <ellipse cx="180" cy="72" rx="90" ry="38" fill="#F97316" fillOpacity="0.05"/>
    </svg>
  )
}

function VehiclePhoto({ nombre, tipo }: { nombre: string; tipo: string }) {
  const n = (nombre + tipo).toLowerCase()
  let src = '/vehicles/transit.jpg'
  if (n.includes('porter') || n.includes('camion') || n.includes('camión') || n.includes('nqr') || n.includes('npr')) src = '/vehicles/porter.jpg'
  if (n.includes('ranger') || n.includes('hilux') || n.includes('dmax') || n.includes('pickup') || n.includes('pick')) src = '/vehicles/ranger.jpg'

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none' }}
    />
  )
}

function getVehicleArt(nombre: string, tipo: string) {
  const n = (nombre + tipo).toLowerCase()
  if (n.includes('transit') || n.includes('furgon') || n.includes('furgón') || n.includes('van')) return <TransitArt />
  if (n.includes('porter') || n.includes('camion') || n.includes('camión') || n.includes('nqr') || n.includes('npr')) return <PorterArt />
  if (n.includes('ranger') || n.includes('hilux') || n.includes('dmax') || n.includes('pickup') || n.includes('pick')) return <RangerArt />
  return <TransitArt />
}

const NIVELES_COMB = [
  { value: 'lleno',        fill: 6, color: '#4ADE80' },
  { value: 'tres_cuartos', fill: 5, color: '#86EFAC' },
  { value: 'medio',        fill: 4, color: '#FBBF24' },
  { value: 'cuarto',       fill: 2, color: '#F97316' },
  { value: 'reserva',      fill: 1, color: '#EF4444' },
  { value: 'vacio',        fill: 0, color: '#6B0000' },
]

function CombustibleMini({ nivel }: { nivel: string | null }) {
  const n = NIVELES_COMB.find(x => x.value === nivel) ?? NIVELES_COMB[2]
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      <div style={{ display: 'flex', gap: 1.5, alignItems: 'flex-end', height: 14 }}>
        {[1,2,3,4,5,6].map(bar => (
          <div key={bar} style={{ width: 4, height: 2 + bar * 1.8, borderRadius: 1, background: bar <= n.fill ? n.color : 'rgba(255,255,255,0.12)' }} />
        ))}
      </div>
      <span style={{ fontSize: 10, color: n.color, fontWeight: 700 }}>{nivel === 'lleno' ? 'Lleno' : nivel === 'tres_cuartos' ? '3/4' : nivel === 'medio' ? '1/2' : nivel === 'cuarto' ? '1/4' : nivel === 'reserva' ? 'Reserva' : nivel === 'vacio' ? 'Vacío' : '—'}</span>
    </div>
  )
}

interface Vehiculo {
  id: string; nombre: string; tipo: string; patente: string | null
  anio: number | null; km_actual: number; estado: string
  marca: string | null; modelo: string | null; color: string | null
  combustible: string | null
}
interface ViajeActivo {
  id: string; vehiculo_id: string; tipo: string; motivo: string | null
  km_inicio: number | null; iniciado_at: string; conductor_id: string | null
  destino_declarado: string | null; llegada_confirmada_at: string | null
}

interface Props {
  user: AppUser
  vehiculos: Vehiculo[]
  viajesActivos: ViajeActivo[]
  conductores: { id: string; nombre: string }[]
}

const TIPO_LABEL: Record<string, string> = { camioneta: 'Camioneta', furgon: 'Furgón', camion_34: 'Camión 3/4' }

function tiempoTranscurrido(iso: string) {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

function EstadoChip({ estado }: { estado: string }) {
  const cfg = {
    disponible:    { color: '#4ADE80', bg: 'rgba(74,222,128,0.1)',  label: 'Disponible',    icon: CheckCircle },
    en_uso:        { color: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  label: 'En uso',        icon: Clock },
    mantenimiento: { color: '#FF5555', bg: 'rgba(255,85,85,0.1)',   label: 'Mantención',    icon: Wrench },
  }[estado] ?? { color: 'var(--muted)', bg: 'rgba(255,255,255,0.05)', label: estado, icon: AlertTriangle }

  const Icon = cfg.icon
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 20, background: cfg.bg, border: `1px solid ${cfg.color}30`, flexShrink: 0, whiteSpace: 'nowrap' }}>
      <Icon size={11} color={cfg.color} />
      <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color }}>{cfg.label}</span>
    </div>
  )
}

export default function FlotaHubClient({ user, vehiculos, viajesActivos, conductores }: Props) {
  const isDesktop = useIsDesktop()
  const router = useRouter()
  const disponibles = vehiculos.filter(v => v.estado === 'disponible').length
  const enUso = vehiculos.filter(v => v.estado === 'en_uso').length

  return (
    <div style={{ padding: isDesktop ? 'var(--sp-3)' : '16px 14px', maxWidth: 800, margin: '0 auto', width: '100%' }}>
      {/* Botón volver al inicio — solo mobile */}
      {!isDesktop && (
        <button
          onClick={() => router.push('/')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#F97316', display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 13, fontWeight: 600, padding: '0 0 12px 0',
          }}
        >
          <ChevronLeft size={18} strokeWidth={2.5} />
          Inicio
        </button>
      )}
      {/* Header */}
      <div style={{ marginBottom: isDesktop ? 28 : 16 }}>
        <p style={{ fontSize: isDesktop ? 11 : 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.2px', textTransform: 'uppercase', marginBottom: isDesktop ? 4 : 3 }}>
          {new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h1 style={{ fontSize: isDesktop ? 'var(--fs-title)' : 20, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px', marginBottom: 0 }}>
          Bitácora de Flota
        </h1>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 16 }}>
        {[
          { label: 'Vehículos',   sub: 'Totales',          value: vehiculos.length, color: F,         rgb: '249,115,22',  icon: <Truck size={18} color={F} />,           img: '/vehicles/transit.jpg' },
          { label: 'Disponibles', sub: 'Listos para salir', value: disponibles,      color: '#4ADE80',  rgb: '74,222,128',  icon: <CheckCircle size={18} color="#4ADE80"/>, img: '/vehicles/ranger.jpg' },
          { label: 'En uso',      sub: 'En operación',      value: enUso,            color: '#F59E0B',  rgb: '245,158,11',  icon: <Clock size={18} color="#F59E0B" />,      img: '/vehicles/porter.jpg' },
        ].map(k => (
          <div key={k.label} style={{
            position: 'relative', overflow: 'hidden',
            background: `linear-gradient(160deg, rgba(${k.rgb},0.10) 0%, rgba(${k.rgb},0.04) 60%, transparent 100%)`,
            border: `1px solid rgba(${k.rgb},0.22)`,
            borderRadius: 16, padding: '14px 10px 12px',
            textAlign: 'center',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            backdropFilter: 'blur(6px)',
          }}>
            {/* Imagen de fondo si aplica */}
            {k.img && (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={k.img} alt="" style={{ position:'absolute', inset:0, width:'100%', height:'100%', objectFit:'cover', objectPosition:'center', opacity:0.12 }} />
                <div style={{ position:'absolute', inset:0, background:`linear-gradient(160deg, rgba(${k.rgb},0.35), rgba(0,0,0,0.6))` }} />
              </>
            )}
            {/* Glow esquina superior */}
            <div style={{ position:'absolute', top:-20, left:'50%', transform:'translateX(-50%)', width:60, height:60, borderRadius:'50%', background:`radial-gradient(circle, rgba(${k.rgb},0.18), transparent 70%)`, pointerEvents:'none' }} />
            {/* Ícono */}
            <div style={{ position:'relative', width:36, height:36, borderRadius:'50%', background:`rgba(${k.rgb},0.14)`, border:`1px solid rgba(${k.rgb},0.25)`, display:'flex', alignItems:'center', justifyContent:'center', marginBottom:2 }}>
              {k.icon}
            </div>
            {/* Número */}
            <p style={{ position:'relative', fontSize: 36, fontWeight: 900, color: k.color, lineHeight: 1, letterSpacing: '-1.5px', margin: 0, textShadow:`0 0 20px rgba(${k.rgb},0.4)` }}>{k.value}</p>
            {/* Etiqueta */}
            <p style={{ position:'relative', fontSize: 8, color: k.color, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', margin: 0, opacity: 0.9 }}>{k.label}</p>
            <p style={{ position:'relative', fontSize: 9, color: 'var(--muted)', margin: 0 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* CTA nueva salida */}
      <Link href="/flota/checkin" style={{ textDecoration: 'none' }}>
        <div style={{ background: F_DIM, border: `1px solid ${F_BORDER}`, borderRadius: 14, padding: isDesktop ? '14px 18px' : '12px 14px', marginBottom: isDesktop ? 28 : 16, display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: 'rgba(249,115,22,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <Plus size={18} color={F} />
          </div>
          <div style={{ flex: 1 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF' }}>Registrar salida</p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Tomar llaves · Check-in obligatorio</p>
          </div>
          <ChevronRight size={16} color={F} />
        </div>
      </Link>

      {/* Grid vehículos */}
      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
        Estado de la flota
      </p>
      {/* paddingBottom extra para que el último card no quede bajo el bottom nav */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 100 }}>
        {vehiculos.map(v => {
          const viaje = viajesActivos.find(va => va.vehiculo_id === v.id)
          const conductor = conductores.find(c => c.id === viaje?.conductor_id)
          const n = (v.nombre + v.tipo).toLowerCase()
          let vehicleSrc = '/vehicles/transit.jpg'
          if (n.includes('porter') || n.includes('nqr') || n.includes('npr') || n.includes('camion') || n.includes('camión')) vehicleSrc = '/vehicles/porter.jpg'
          if (n.includes('ranger') || n.includes('hilux') || n.includes('dmax') || n.includes('pickup') || n.includes('camioneta')) vehicleSrc = '/vehicles/ranger.jpg'
          return (
            <div key={v.id}
              onClick={() => v.estado === 'en_uso' && router.push(`/flota/vehiculo/${v.id}`)}
              style={{
                background: 'var(--surface2)',
                border: `1px solid ${v.estado === 'en_uso' ? 'rgba(245,158,11,0.3)' : v.estado === 'mantenimiento' ? 'rgba(255,85,85,0.2)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 18, overflow: 'hidden',
                display: 'flex', alignItems: 'stretch',
                cursor: v.estado === 'en_uso' ? 'pointer' : 'default',
              }}>
              {/* ── FOTO IZQUIERDA — vehiculo completo ── */}
              <div style={{ width: 140, flexShrink: 0, position: 'relative', background: '#04040a' }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={vehicleSrc}
                  alt={v.nombre}
                  style={{
                    position: 'absolute', top: 0, left: 0,
                    width: '100%', height: '100%',
                    objectFit: 'contain',   /* muestra el vehiculo COMPLETO sin cortar */
                    objectPosition: 'center',
                  }}
                />
                {/* fade derecha suave */}
                <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 36, background: 'linear-gradient(to right, transparent, #04040a)' }} />
              </div>

              {/* ── CONTENIDO DERECHA ── */}
              <div style={{ flex: 1, minWidth: 0, padding: '14px 14px 14px 10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF', marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.nombre}</p>
                    {v.modelo && <p style={{ fontSize: 11, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.modelo}{v.color ? ` · ${v.color}` : ''}</p>}
                  </div>
                  <EstadoChip estado={v.estado} />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  {v.patente && (
                    <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 7, padding: '3px 9px', display: 'inline-flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: 7, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>Patente</span>
                      <span style={{ fontSize: 13, fontWeight: 900, color: '#F4EEDF', letterSpacing: '1.5px' }}>{v.patente}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{v.anio ?? ''} · {TIPO_LABEL[v.tipo] ?? v.tipo}</span>
                    <span style={{ fontSize: 10, color: 'var(--muted)' }}>{v.km_actual.toLocaleString('es-CL')} km</span>
                  </div>
                </div>

                <CombustibleMini nivel={v.combustible} />

                {viaje && (
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                    <p style={{ fontSize: 11, color: '#F59E0B' }}>
                      {conductor?.nombre?.split(' ')[0] ?? 'En uso'} · {viaje.tipo === 'reparto' ? 'Reparto' : 'Trámite'} · {tiempoTranscurrido(viaje.iniciado_at)}
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>
                      Ver viaje <ChevronRight size={13} color={F} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
