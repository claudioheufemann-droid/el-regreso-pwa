'use client'

import Link from 'next/link'
import { CheckCircle2, Users, Clock3, Flag } from 'lucide-react'
import { C, cardStyle } from '../theme'
import PeriodoFiltro from './PeriodoFiltro'
import SecuenciaMapa from './SecuenciaMapa'
import type { TipoPeriodo } from '@/lib/terreno/tiempoChile'

export interface FilaVendedor {
  id: string
  nombre: string
  region: string | null
  verificadas: number
  clientesUnicos: number
  porCerrar: number
  seguimientosCumplidos: number
  seguimientosTotal: number
}

export interface VisitaResumen {
  id: string
  clienteNombre: string
  lat: number
  lng: number
  iniciadaAt: string
  estadoPresencia: string
  fotoUrl: string | null
}

interface Props {
  tipo: TipoPeriodo
  fecha: string
  rangoTexto: string
  kpis: { llegadasVerificadas: number; clientesUnicos: number; porRevisar: number; finalizadas: number }
  vendedores: FilaVendedor[]
  vendedorSeleccionadoId: string | null
  vendedorSeleccionadoNombre: string | null
  paradasVendedor: VisitaResumen[]
  ultimasVisitas: (VisitaResumen & { vendedorNombre: string })[]
}

const ESTADO_LABEL: Record<string, { l: string; color: string; bg: string }> = {
  verificada_auto: { l: 'Verificada', color: C.verdeLlegada, bg: C.verdeLlegadaSoft },
  aprobada_manual: { l: 'Aprobada', color: C.verdeLlegada, bg: C.verdeLlegadaSoft },
  pendiente_revision: { l: 'Revisión pendiente', color: C.amber, bg: C.amberSoft },
  rechazada: { l: 'Rechazada', color: C.red, bg: C.redSoft },
  historica_sin_verificacion: { l: 'Sin verificar', color: C.muted, bg: C.line },
}

function fHora(iso: string) {
  return new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })
}

export default function ResumenClient({
  tipo, fecha, rangoTexto, kpis, vendedores, vendedorSeleccionadoNombre, paradasVendedor, ultimasVisitas,
}: Props) {
  return (
    <div style={{ padding: '28px 28px 60px', maxWidth: 1240 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>PRESENCIA Y COBERTURA</p>
      <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-0.4px', marginBottom: 16 }}>
        Equipo en terreno
      </h1>

      <PeriodoFiltro tipo={tipo} fecha={fecha} rangoTexto={rangoTexto} />

      <div className="terreno-admin-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        <Kpi icon={CheckCircle2} label="Llegadas verificadas" valor={kpis.llegadasVerificadas} color={C.verdeLlegada} />
        <Kpi icon={Users} label="Clientes únicos" valor={kpis.clientesUnicos} color={C.blue} />
        <Kpi icon={Clock3} label="Por revisar" valor={kpis.porRevisar} color={C.amber} />
        <Kpi icon={Flag} label="Finalizadas" valor={kpis.finalizadas} color={C.text} />
      </div>

      <div style={{ ...cardStyle, padding: 18, marginBottom: 20, overflowX: 'auto' }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 14 }}>Vendedores</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
          <thead>
            <tr style={{ textAlign: 'left' }}>
              {['Vendedor', 'Verificadas', 'Clientes', 'Por cerrar', 'Seguimientos', ''].map(h => (
                <th key={h} style={{ fontSize: 11.5, fontWeight: 700, color: C.muted, padding: '0 10px 10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vendedores.map(v => (
              <tr key={v.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: '11px 10px' }}>
                  <Link href={`/terreno/admin/rutas/${v.id}?tipo=${tipo}&fecha=${fecha}`} style={{ textDecoration: 'none' }}>
                    <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>{v.nombre}</p>
                    {v.region && <p style={{ fontSize: 11.5, color: C.muted }}>{v.region}</p>}
                  </Link>
                </td>
                <td style={{ padding: '11px 10px', fontSize: 14, fontWeight: 700, color: C.text }}>{v.verificadas}</td>
                <td style={{ padding: '11px 10px', fontSize: 14, fontWeight: 700, color: C.text }}>{v.clientesUnicos}</td>
                <td style={{ padding: '11px 10px', fontSize: 14, fontWeight: 700, color: v.porCerrar > 0 ? C.amber : C.text }}>{v.porCerrar}</td>
                <td style={{ padding: '11px 10px', fontSize: 13.5, color: C.text }}>{v.seguimientosCumplidos} de {v.seguimientosTotal}</td>
                <td style={{ padding: '11px 10px' }}>
                  <Link href={`/terreno/admin/rutas/${v.id}?tipo=${tipo}&fecha=${fecha}`} style={{ fontSize: 12.5, fontWeight: 700, color: C.blue, textDecoration: 'none' }}>
                    Detalle →
                  </Link>
                </td>
              </tr>
            ))}
            {vendedores.length === 0 && (
              <tr><td colSpan={6} style={{ padding: '18px 10px', fontSize: 13, color: C.muted, textAlign: 'center' }}>Sin vendedores de terreno registrados.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="terreno-admin-grid" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 16 }}>
        <div style={{ ...cardStyle, padding: 18 }}>
          <p style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>
            Paradas del día{vendedorSeleccionadoNombre ? ` · ${vendedorSeleccionadoNombre}` : ''}
          </p>
          <SecuenciaMapa
            paradas={paradasVendedor.map((p, i) => ({
              id: p.id, lat: p.lat, lng: p.lng, nombre: p.clienteNombre, horaTexto: fHora(p.iniciadaAt),
              orden: i + 1, verificada: p.estadoPresencia === 'verificada_auto' || p.estadoPresencia === 'aprobada_manual',
            }))}
          />
        </div>

        <div style={{ ...cardStyle, padding: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <p style={{ fontSize: 13, fontWeight: 800, color: C.text }}>Últimas visitas</p>
            <Link href="/terreno/admin/visitas" style={{ fontSize: 12, fontWeight: 700, color: C.blue, textDecoration: 'none' }}>Ver todas</Link>
          </div>
          {ultimasVisitas.length === 0 && <p style={{ fontSize: 13, color: C.muted, padding: '10px 0' }}>Sin visitas en este período.</p>}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {ultimasVisitas.map(v => {
              const est = ESTADO_LABEL[v.estadoPresencia] ?? ESTADO_LABEL.historica_sin_verificacion
              return (
                <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 38, height: 38, borderRadius: 10, flexShrink: 0, overflow: 'hidden', background: C.line,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {v.fotoUrl
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={v.fotoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      : <Users size={16} color={C.faint} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.clienteNombre}</p>
                    <p style={{ fontSize: 11.5, color: C.muted }}>{v.vendedorNombre} · {fHora(v.iniciadaAt)}</p>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: est.color, background: est.bg, borderRadius: 100, padding: '3px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>
                    {est.l}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 900px) {
          .terreno-admin-kpis { grid-template-columns: repeat(2, 1fr) !important; }
          .terreno-admin-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}

function Kpi({ icon: Icon, label, valor, color }: { icon: typeof Users; label: string; valor: number; color: string }) {
  return (
    <div style={{ ...cardStyle, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ width: 30, height: 30, borderRadius: 9, background: `${color}1A`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={15} color={color} />
        </span>
      </div>
      <p style={{ fontSize: 24, fontWeight: 900, color: C.text, letterSpacing: '-0.5px' }}>{valor}</p>
      <p style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>{label}</p>
    </div>
  )
}
