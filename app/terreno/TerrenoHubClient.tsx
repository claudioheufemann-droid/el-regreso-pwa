'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import {
  CheckCircle, XCircle, ChevronRight, Plus, Search, CreditCard,
  Navigation, Clock3, History, MapPin, X, Fuel,
} from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import BuscarClienteSheet from '@/components/ui/BuscarClienteSheet'
import NotificationsBell from '@/components/ui/NotificationsBell'
import SettingsPanel from '@/components/ui/SettingsPanel'
import { createClient } from '@/lib/supabase/client'
import { C, TAP, fPeso, fHora, cardStyle } from './theme'
import MiComisionVendedor from './MiComisionVendedor'

/**
 * Hub de Terreno — tema claro, igual que Ventas.
 *
 * Rediseñado por pedido de Claudio: antes era oscuro, con un hero
 * isométrico decorativo, tarjetas grandes y varios bloques que repetían el
 * mismo dato. Ahora el orden sigue lo que el vendedor necesita en la calle,
 * de arriba abajo: retomar lo que dejó a medias → registrar una visita
 * nueva → cuánto lleva hoy → a quién tiene que cobrar → qué hizo hoy.
 */

interface Visita {
  id: string
  cliente_nombre: string
  tiene_venta: boolean | null
  motivo_sin_venta: string | null
  total_pedido: number | null
  estado: string
  iniciada_at: string
  completada_at: string | null
}

interface CobroPendiente {
  id: string
  cliente_nombre: string
  total_pedido: number | null
  fecha_pago_estimada: string
}

interface Props {
  vendedor: AppUser
  visitas: Visita[]
  kpis: { totalHoy: number; conVenta: number; sinVenta: number; canceladas?: number }
  visitaEnProgreso: Visita | null
  cobrosPendientes: CobroPendiente[]
  veComisionVendedor: boolean
  periodo: { desde: string; hasta: string; nombre: string }
}

export default function TerrenoHubClient({
  vendedor, visitas, kpis, visitaEnProgreso, cobrosPendientes, veComisionVendedor, periodo,
}: Props) {
  const router = useRouter()
  const [cobros, setCobros] = useState(cobrosPendientes)
  const [marcandoId, setMarcandoId] = useState<string | null>(null)
  const [showBuscar, setShowBuscar] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showCierre, setShowCierre] = useState(false)
  const [jornada, setJornada] = useState<{ id: string } | null | undefined>(undefined)

  useEffect(() => {
    fetch('/api/terreno/jornada').then(r => r.json()).then(j => setJornada(j ?? null)).catch(() => setJornada(null))
  }, [])

  // Resumen del día al volver de cerrar una visita (?cierre=1). Se lee de
  // window.location en vez de useSearchParams para no exigir un Suspense
  // boundary extra en esta pantalla.
  //
  // El setState va dentro del efecto a propósito: la URL es un sistema
  // externo y sólo existe en el cliente. Leerla en el inicializador del
  // useState daría un desajuste de hidratación (el servidor renderiza sin
  // modal y el cliente con modal).
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (new URLSearchParams(window.location.search).get('cierre') === '1') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowCierre(true)
      window.history.replaceState({}, '', '/terreno')
    }
  }, [])

  async function marcarPagado(id: string) {
    setMarcandoId(id)
    const supabase = createClient()
    const { error } = await supabase.from('visitas_terreno').update({ pagado: true }).eq('id', id)
    if (!error) setCobros(prev => prev.filter(c => c.id !== id))
    setMarcandoId(null)
  }

  const nombre = vendedor.nombre.split(' ')[0]
  const hoyStr = new Date().toISOString().split('T')[0]
  const totalVendidoHoy = visitas
    .filter(v => v.estado === 'completada')
    .reduce((s, v) => s + (v.total_pedido ?? 0), 0)
  const fecha = new Date().toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>

        {/* Encabezado */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em', textTransform: 'capitalize' }}>
              {fecha}
            </p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>
              Hola, {nombre}
            </h1>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
            <button
              onClick={() => setShowBuscar(true)}
              aria-label="Buscar cliente"
              style={{
                width: 40, height: 40, borderRadius: '50%', cursor: 'pointer',
                border: `1px solid ${C.line}`, background: C.card,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Search size={17} color={C.text} />
            </button>
            <NotificationsBell inline variant="light" />
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Cuenta"
              style={{
                width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', padding: 0, cursor: 'pointer',
                border: `1px solid ${C.line}`, background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, flexShrink: 0,
              }}
            >
              {vendedor.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={vendedor.avatarUrl} alt={vendedor.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (vendedor.iniciales || '··')}
            </button>
          </div>
        </div>

        {/* Remuneración variable propia (cláusula TERCERA del contrato).
            Sólo se monta para quien tiene ese contrato — ver terreno/page.tsx.
            Va arriba de todo, mismo criterio que "Lo que gano yo" en Ventas. */}
        {veComisionVendedor && (
          <div style={{ marginBottom: 12 }}>
            <MiComisionVendedor desde={periodo.desde} hasta={periodo.hasta} nombrePeriodo={periodo.nombre} />
          </div>
        )}

        {/* Visita a medias — lo primero, es lo que hay que terminar */}
        {visitaEnProgreso && (
          <button
            onClick={() => router.push(`/terreno/nueva-visita?retomar=${visitaEnProgreso.id}`)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 11, cursor: 'pointer',
              background: C.amberSoft, border: '1px solid #FDE68A', borderRadius: 16,
              padding: '14px 15px', marginBottom: 12, textAlign: 'left',
            }}
          >
            <span style={{ width: 40, height: 40, borderRadius: 12, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Clock3 size={19} color={C.amber} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11.5, fontWeight: 800, color: C.amber, letterSpacing: '0.03em' }}>VISITA SIN TERMINAR</p>
              <p style={{ fontSize: 15, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{visitaEnProgreso.cliente_nombre}</p>
              <p style={{ fontSize: 11.5, color: C.muted }}>Desde las {fHora(visitaEnProgreso.iniciada_at)}</p>
            </div>
            <ChevronRight size={18} color={C.amber} style={{ flexShrink: 0 }} />
          </button>
        )}

        {/* Acción principal */}
        <Link href="/terreno/nueva-visita" style={{ textDecoration: 'none', display: 'block', marginBottom: 14 }}>
          <div style={{
            background: C.hero, borderRadius: 18, padding: '18px 16px',
            display: 'flex', alignItems: 'center', gap: 13,
          }}>
            <span style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Plus size={22} color="#F59E0B" />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>Nueva visita</p>
              <p style={{ fontSize: 12.5, color: '#94A3B8' }}>Elige el cliente y toma el pedido</p>
            </div>
            <ChevronRight size={19} color="#94A3B8" style={{ flexShrink: 0 }} />
          </div>
        </Link>

        {/* Cómo va el día */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
          <Kpi label="Visitas" valor={String(kpis.totalHoy)} color={C.text} />
          <Kpi label="Con venta" valor={String(kpis.conVenta)} color={C.green} />
          <Kpi label="Vendido" valor={totalVendidoHoy > 0 ? fPeso(totalVendidoHoy) : '$0'} color={C.blue} chico />
        </div>

        {/* Cobros pendientes */}
        {cobros.length > 0 && (
          <div style={{ ...cardStyle, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CreditCard size={16} color={C.amber} />
              <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em' }}>POR COBRAR</p>
              <span style={{ marginLeft: 'auto', fontSize: 11.5, color: C.muted }}>{cobros.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {cobros.map(c => {
                const vencido = c.fecha_pago_estimada < hoyStr
                return (
                  <div key={c.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px', borderRadius: 12,
                    background: vencido ? C.redSoft : C.bg,
                    border: `1px solid ${vencido ? '#FECACA' : C.line}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>{c.cliente_nombre}</p>
                      <p style={{ fontSize: 11.5, color: vencido ? C.red : C.muted, fontWeight: vencido ? 700 : 500 }}>
                        {vencido ? 'Vencido · ' : 'Cobrar '}
                        {new Date(c.fecha_pago_estimada + 'T12:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })}
                        {c.total_pedido ? ` · ${fPeso(c.total_pedido)}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => marcarPagado(c.id)}
                      disabled={marcandoId === c.id}
                      style={{
                        minHeight: 36, padding: '0 12px', borderRadius: 10, flexShrink: 0, cursor: 'pointer',
                        border: 'none', background: C.green, color: '#fff', fontSize: 12.5, fontWeight: 800,
                        opacity: marcandoId === c.id ? 0.5 : 1,
                      }}
                    >
                      {marcandoId === c.id ? '…' : 'Pagado'}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Accesos */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
          <Acceso href="/terreno/jornada" Icon={Fuel} label="Jornada" nota={jornada === undefined ? '…' : jornada ? 'En curso' : 'Sin iniciar'} destacado={jornada === null} />
          <Acceso href="/terreno/ruta" Icon={Navigation} label="Mi ruta" nota="Clientes del día" />
          <Acceso href="/terreno/cercanos" Icon={MapPin} label="Cercanos" nota="Cerca de mí" />
          <Acceso href="/terreno/historial" Icon={History} label="Historial" nota="Visitas anteriores" />
        </div>

        {/* Lo de hoy */}
        <div style={{ ...cardStyle, padding: '14px 14px 6px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <p style={{ fontSize: 12, fontWeight: 800, color: C.text, letterSpacing: '0.04em' }}>VISITAS DE HOY</p>
            <Link href="/terreno/historial" style={{ textDecoration: 'none', fontSize: 12, fontWeight: 700, color: C.blue }}>
              Ver todas
            </Link>
          </div>

          {visitas.length === 0 ? (
            <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '20px 0 26px' }}>
              Todavía no registras visitas hoy.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 8 }}>
              {visitas.map(v => {
                const enCurso = v.estado === 'en_progreso'
                const vendio = v.tiene_venta === true
                return (
                  <Link
                    key={v.id}
                    href={enCurso ? `/terreno/nueva-visita?retomar=${v.id}` : '/terreno/historial'}
                    style={{ textDecoration: 'none' }}
                  >
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '10px 11px',
                      borderRadius: 12, background: C.bg, border: `1px solid ${C.line}`,
                    }}>
                      <span style={{
                        width: 32, height: 32, borderRadius: 10, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: enCurso ? '#FEF3C7' : vendio ? C.greenSoft : '#F1F5F9',
                      }}>
                        {enCurso ? <Clock3 size={16} color={C.amber} />
                          : vendio ? <CheckCircle size={16} color={C.green} />
                          : <XCircle size={16} color={C.faint} />}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>
                          {v.cliente_nombre}
                        </p>
                        <p style={{ fontSize: 11.5, color: C.muted }}>
                          {fHora(v.iniciada_at)}
                          {enCurso ? ' · sin terminar' : v.motivo_sin_venta ? ` · ${v.motivo_sin_venta}` : ''}
                        </p>
                      </div>
                      {vendio && v.total_pedido ? (
                        <span style={{ fontSize: 13.5, fontWeight: 800, color: C.green, flexShrink: 0, whiteSpace: 'nowrap' }}>
                          {fPeso(v.total_pedido)}
                        </span>
                      ) : null}
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {showBuscar && <BuscarClienteSheet onClose={() => setShowBuscar(false)} />}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          userName={vendedor.nombre}
          userEmail={vendedor.email}
          avatarUrl={vendedor.avatarUrl ?? undefined}
        />
      )}

      {showCierre && (
        <div
          onClick={e => { if (e.target === e.currentTarget) setShowCierre(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
        >
          <div style={{ background: C.card, borderRadius: 20, padding: 22, width: '100%', maxWidth: 360, position: 'relative' }}>
            <button
              onClick={() => setShowCierre(false)}
              aria-label="Cerrar"
              style={{ position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', background: '#E2E8F0', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <X size={15} color={C.muted} />
            </button>

            <span style={{ width: 52, height: 52, borderRadius: 16, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <CheckCircle size={26} color={C.green} />
            </span>
            <p style={{ fontSize: 17, fontWeight: 800, color: C.text, textAlign: 'center' }}>Visita registrada</p>
            <p style={{ fontSize: 12.5, color: C.muted, textAlign: 'center', marginBottom: 16 }}>Así va tu día, {nombre}</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
              <Kpi label="Visitas" valor={String(kpis.totalHoy)} color={C.text} />
              <Kpi label="Con venta" valor={String(kpis.conVenta)} color={C.green} />
              <Kpi label="Vendido" valor={totalVendidoHoy > 0 ? fPeso(totalVendidoHoy) : '$0'} color={C.blue} chico />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({ label, valor, color, chico = false }: { label: string; valor: string; color: string; chico?: boolean }) {
  return (
    <div style={{ ...cardStyle, padding: '11px 8px', textAlign: 'center' }}>
      <p style={{ fontSize: chico ? 15 : 21, fontWeight: 800, color, letterSpacing: '-0.5px', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
        {valor}
      </p>
      <p style={{ fontSize: 10.5, color: C.muted, fontWeight: 600, marginTop: 2 }}>{label}</p>
    </div>
  )
}

function Acceso({ href, Icon, label, nota, destacado = false }: {
  href: string; Icon: typeof Navigation; label: string; nota: string; destacado?: boolean
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        ...cardStyle,
        border: `1px solid ${destacado ? '#FDE68A' : C.line}`,
        background: destacado ? C.amberSoft : C.card,
        padding: '12px 13px', display: 'flex', alignItems: 'center', gap: 10, minHeight: TAP + 16,
      }}>
        <Icon size={18} color={destacado ? C.amber : C.muted} style={{ flexShrink: 0 }} />
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>{label}</p>
          <p style={{ fontSize: 11, color: destacado ? C.amber : C.muted, fontWeight: destacado ? 700 : 500 }}>{nota}</p>
        </div>
      </div>
    </Link>
  )
}
