'use client'

import { useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { ChevronRight, MapPin, Ruler, Crosshair, Camera, Check, X, FileText, ExternalLink } from 'lucide-react'
import { C, cardStyle } from '../../../theme'
import PeriodoFiltro from '../../PeriodoFiltro'
import type { TipoPeriodo } from '@/lib/terreno/tiempoChile'

// Leaflet toca `window` al importarse — tiene que cargar sólo en el cliente
// o rompe el render de servidor de toda la página (ver ResumenClient.tsx).
const SecuenciaMapa = dynamic(() => import('../../SecuenciaMapa'), {
  ssr: false,
  loading: () => <div style={{ height: 600, borderRadius: 14, background: C.line }} />,
})
import { MOTIVO_LABEL, type MotivoRevision } from '@/lib/terreno/verificacion'

export interface ParadaDetalle {
  id: string
  clienteNombre: string
  direccion: string | null
  localidad: string | null
  lat: number | null
  lng: number | null
  iniciadaAt: string
  completadaAt: string | null
  estado: string
  estadoPresencia: string
  motivoRevision: string | null
  distanciaM: number | null
  precisionM: number | null
  fotoUrl: string | null
  fotoBytes: number | null
  contacto: string | null
  resultadoVisita: string | null
  proximoPaso: string | null
  proximoPasoFecha: string | null
}

interface Props {
  vendedorId: string
  vendedorNombre: string
  vendedorRegion: string | null
  todosVendedores: { id: string; nombre: string }[]
  tipo: TipoPeriodo
  fecha: string
  rangoTexto: string
  paradas: ParadaDetalle[]
}

const ESTADO_CHIP: Record<string, { l: string; color: string; bg: string }> = {
  verificada_auto: { l: 'Verificada', color: C.verdeLlegada, bg: C.verdeLlegadaSoft },
  aprobada_manual: { l: 'Aprobada', color: C.verdeLlegada, bg: C.verdeLlegadaSoft },
  pendiente_revision: { l: 'Por revisar', color: C.amber, bg: C.amberSoft },
  rechazada: { l: 'Rechazada', color: C.red, bg: C.redSoft },
  historica_sin_verificacion: { l: 'Sin verificar', color: C.muted, bg: C.line },
}

function fHora(iso: string) { return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) }

export default function RutaVendedorClient({
  vendedorId, vendedorNombre, vendedorRegion, todosVendedores, tipo, fecha, rangoTexto, paradas,
}: Props) {
  const router = useRouter()
  const [seleccionadaId, setSeleccionadaId] = useState<string | null>(paradas[0]?.id ?? null)
  const [procesando, setProcesando] = useState(false)
  const [paradasLocal, setParadasLocal] = useState(paradas)

  const seleccionada = paradasLocal.find(p => p.id === seleccionadaId) ?? null
  const conUbicacion = paradasLocal.filter(p => p.lat != null && p.lng != null)
  const porCerrar = paradasLocal.filter(p => p.estado === 'en_progreso').length

  async function revisar(accion: 'aprobar' | 'rechazar') {
    if (!seleccionada) return
    if (accion === 'rechazar' && !window.confirm('¿Rechazar esta evidencia?')) return
    setProcesando(true)
    try {
      const r = await fetch(`/api/terreno/visitas/${seleccionada.id}/revision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accion, motivo: accion === 'rechazar' ? 'Rechazada desde el panel de administrador' : undefined }),
      })
      if (r.ok) {
        const d = await r.json() as { estado_presencia: string }
        setParadasLocal(prev => prev.map(p => p.id === seleccionada.id ? { ...p, estadoPresencia: d.estado_presencia } : p))
      }
    } finally {
      setProcesando(false)
    }
  }

  return (
    <div style={{ padding: '28px 28px 60px', maxWidth: 1360 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.muted, marginBottom: 6 }}>
        <Link href="/terreno/admin" style={{ color: C.muted, textDecoration: 'none' }}>Equipo</Link>
        <ChevronRight size={12} />
        <span style={{ color: C.text, fontWeight: 700 }}>{vendedorNombre}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: C.text, letterSpacing: '-0.4px' }}>Visitas de {vendedorNombre}</h1>
          {vendedorRegion && <p style={{ fontSize: 13, color: C.muted }}>{vendedorRegion}</p>}
        </div>
        <select
          value={vendedorId}
          onChange={e => router.push(`/terreno/admin/rutas/${e.target.value}?tipo=${tipo}&fecha=${fecha}`)}
          style={{ minHeight: 38, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, fontSize: 13, fontWeight: 600, color: C.text }}
        >
          {todosVendedores.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
        </select>
      </div>

      <PeriodoFiltro tipo={tipo} fecha={fecha} rangoTexto={rangoTexto} extraParams={{}} />

      <div className="terreno-ruta-grid" style={{ display: 'grid', gridTemplateColumns: '300px 1fr 320px', gap: 14 }}>
        {/* Columna 1 — lista de paradas */}
        <div style={{ ...cardStyle, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 2 }}>Paradas registradas</p>
          <p style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
            {paradasLocal.filter(p => p.estadoPresencia === 'verificada_auto' || p.estadoPresencia === 'aprobada_manual').length} verificadas
            {porCerrar > 0 ? ` · ${porCerrar} por cerrar` : ''}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 560, overflowY: 'auto' }}>
            {paradasLocal.map((p, i) => {
              const est = ESTADO_CHIP[p.estadoPresencia] ?? ESTADO_CHIP.historica_sin_verificacion
              const activa = p.id === seleccionadaId
              return (
                <button
                  key={p.id}
                  onClick={() => setSeleccionadaId(p.id)}
                  style={{
                    textAlign: 'left', width: '100%', cursor: 'pointer', borderRadius: 12, padding: '10px 11px',
                    border: `1.5px solid ${activa ? C.verdeLlegada : C.line}`, background: activa ? C.verdeLlegadaSoft : C.card,
                    display: 'flex', flexDirection: 'column', gap: 6,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{
                      width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: activa ? C.verdeLlegada : C.faint,
                      color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {i + 1}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.clienteNombre}
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: C.muted, marginLeft: 30 }}>{fHora(p.iniciadaAt)}</p>
                  <span style={{
                    marginLeft: 30, fontSize: 10.5, fontWeight: 700, color: est.color, background: est.bg,
                    borderRadius: 100, padding: '2px 8px', width: 'fit-content',
                  }}>
                    {est.l}
                  </span>
                </button>
              )
            })}
            {paradasLocal.length === 0 && <p style={{ fontSize: 13, color: C.muted, textAlign: 'center', padding: '20px 0' }}>Sin visitas en este período.</p>}
          </div>
        </div>

        {/* Columna 2 — mapa */}
        <div style={{ ...cardStyle, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>Secuencia de visitas</p>
          <SecuenciaMapa
            alto={600}
            paradas={conUbicacion.map(p => ({
              id: p.id, lat: p.lat!, lng: p.lng!, nombre: p.clienteNombre, horaTexto: fHora(p.iniciadaAt),
              orden: paradasLocal.indexOf(p) + 1, verificada: p.estadoPresencia === 'verificada_auto' || p.estadoPresencia === 'aprobada_manual',
            }))}
          />
        </div>

        {/* Columna 3 — evidencia de la parada seleccionada */}
        <div style={{ ...cardStyle, padding: 16 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>Evidencia de llegada</p>
          {!seleccionada ? (
            <p style={{ fontSize: 13, color: C.muted }}>Elige una parada de la lista.</p>
          ) : (
            <>
              <p style={{ fontSize: 14, fontWeight: 800, color: C.text, marginBottom: 8 }}>{seleccionada.clienteNombre}</p>
              <div style={{ borderRadius: 14, overflow: 'hidden', background: C.line, marginBottom: 10, aspectRatio: '4/3' }}>
                {seleccionada.fotoUrl
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={seleccionada.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Camera size={26} color={C.faint} /></div>}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                <FilaEv icon={MapPin} label="Llegada" valor={fHora(seleccionada.iniciadaAt)} />
                <FilaEv icon={Ruler} label="Distancia" valor={seleccionada.distanciaM != null ? `${seleccionada.distanciaM} m` : '—'} />
                <FilaEv icon={Crosshair} label="Precisión" valor={seleccionada.precisionM != null ? `${Math.round(seleccionada.precisionM)} m` : '—'} />
                <FilaEv icon={FileText} label="Foto" valor={seleccionada.fotoBytes != null ? `${Math.round(seleccionada.fotoBytes / 1024)} KB` : '—'} />
              </div>

              <div style={{
                borderRadius: 12, padding: 12, marginBottom: 12,
                background: (ESTADO_CHIP[seleccionada.estadoPresencia] ?? ESTADO_CHIP.historica_sin_verificacion).bg,
              }}>
                <p style={{ fontSize: 12.5, fontWeight: 800, color: (ESTADO_CHIP[seleccionada.estadoPresencia] ?? ESTADO_CHIP.historica_sin_verificacion).color, marginBottom: 4 }}>
                  {(ESTADO_CHIP[seleccionada.estadoPresencia] ?? ESTADO_CHIP.historica_sin_verificacion).l}
                </p>
                {seleccionada.motivoRevision && (
                  <p style={{ fontSize: 12, color: C.text }}>
                    {MOTIVO_LABEL[seleccionada.motivoRevision as MotivoRevision] ?? seleccionada.motivoRevision}
                  </p>
                )}
                {seleccionada.estado === 'en_progreso' && (
                  <p style={{ fontSize: 12, color: C.text, marginTop: 4 }}>El vendedor aún no finaliza la visita.</p>
                )}
              </div>

              {seleccionada.estadoPresencia === 'pendiente_revision' && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={() => revisar('aprobar')}
                    disabled={procesando}
                    style={{
                      flex: 1, minHeight: 42, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: C.verdeLlegada, color: '#fff', fontSize: 13, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: procesando ? 0.6 : 1,
                    }}
                  >
                    <Check size={15} /> Aprobar
                  </button>
                  <button
                    onClick={() => revisar('rechazar')}
                    disabled={procesando}
                    style={{
                      flex: 1, minHeight: 42, borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${C.red}`, background: C.redSoft, color: C.red, fontSize: 13, fontWeight: 800,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: procesando ? 0.6 : 1,
                    }}
                  >
                    <X size={15} /> Rechazar
                  </button>
                </div>
              )}

              <Link
                href={`/ventas/clientes?nombre=${encodeURIComponent(seleccionada.clienteNombre)}`}
                style={{
                  minHeight: 42, borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, color: C.text,
                  fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, textDecoration: 'none',
                }}
              >
                <ExternalLink size={14} /> Abrir ficha del cliente
              </Link>
            </>
          )}
        </div>
      </div>

      <style>{`
        @media (max-width: 1100px) {
          .terreno-ruta-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function FilaEv({ icon: Icon, label, valor }: { icon: typeof MapPin; label: string; valor: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Icon size={14} color={C.muted} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 12.5, color: C.muted, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 12.5, fontWeight: 800, color: C.text }}>{valor}</span>
    </div>
  )
}
