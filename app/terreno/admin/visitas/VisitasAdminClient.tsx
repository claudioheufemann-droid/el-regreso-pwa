'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { C, cardStyle } from '../../theme'
import PeriodoFiltro from '../PeriodoFiltro'
import type { TipoPeriodo } from '@/lib/terreno/tiempoChile'
import { fmtPrecioCLP } from '@/lib/catalogo-productos'

export interface FilaVisita {
  id: string
  vendedorId: string
  vendedorNombre: string
  clienteNombre: string
  iniciadaAt: string
  estado: string
  estadoPresencia: string
  contacto: string | null
  resultadoVisita: string | null
  totalPedido: number | null
}

const ESTADO_CHIP: Record<string, { l: string; color: string; bg: string }> = {
  verificada_auto: { l: 'Verificada', color: C.verdeLlegada, bg: C.verdeLlegadaSoft },
  aprobada_manual: { l: 'Aprobada', color: C.verdeLlegada, bg: C.verdeLlegadaSoft },
  pendiente_revision: { l: 'Por revisar', color: C.amber, bg: C.amberSoft },
  rechazada: { l: 'Rechazada', color: C.red, bg: C.redSoft },
  historica_sin_verificacion: { l: 'Sin verificar', color: C.muted, bg: C.line },
}

const RESULTADO_LABEL: Record<string, string> = {
  tiene_stock: 'Tiene stock', pedido_confirmado: 'Pedido', cotizacion_solicitada: 'Cotización',
  evaluar_propuesta: 'Evaluando', precio: 'Precio', deuda: 'Deuda', no_interesado: 'No interesado',
  gestion_resuelta: 'Gestión resuelta', otro: 'Otro',
}

function fHora(iso: string) { return new Date(iso).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }

export default function VisitasAdminClient({ tipo, fecha, rangoTexto, filas }: {
  tipo: TipoPeriodo; fecha: string; rangoTexto: string; filas: FilaVisita[]
}) {
  const [busca, setBusca] = useState('')

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return filas
    return filas.filter(f => f.clienteNombre.toLowerCase().includes(q) || f.vendedorNombre.toLowerCase().includes(q))
  }, [filas, busca])

  return (
    <div style={{ padding: '28px 28px 60px', maxWidth: 1180 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>TODAS LAS VISITAS</p>
      <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-0.4px', marginBottom: 16 }}>Visitas</h1>

      <PeriodoFiltro tipo={tipo} fecha={fecha} rangoTexto={rangoTexto} />

      <div style={{ position: 'relative', marginBottom: 14, maxWidth: 320 }}>
        <Search size={15} color={C.faint} style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente o vendedor…"
          style={{ width: '100%', minHeight: 38, paddingLeft: 34, paddingRight: 12, borderRadius: 10, border: `1px solid ${C.line}`, background: C.card, fontSize: 13, outline: 'none' }}
        />
      </div>

      <div style={{ ...cardStyle, padding: 8, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              {['Cliente', 'Vendedor', 'Hora', 'Presencia', 'Contacto', 'Resultado', 'Total'].map(h => (
                <th key={h} style={{ fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', padding: '10px 12px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtradas.map(f => {
              const est = ESTADO_CHIP[f.estadoPresencia] ?? ESTADO_CHIP.historica_sin_verificacion
              return (
                <tr key={f.id} style={{ borderTop: `1px solid ${C.line}` }}>
                  <td style={{ padding: '10px 12px' }}>
                    <Link href={`/terreno/admin/rutas/${f.vendedorId}?tipo=${tipo}&fecha=${fecha}`} style={{ fontSize: 13.5, fontWeight: 700, color: C.text, textDecoration: 'none' }}>
                      {f.clienteNombre}
                    </Link>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: C.muted }}>{f.vendedorNombre}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: C.muted, whiteSpace: 'nowrap' }}>{fHora(f.iniciadaAt)}</td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: est.color, background: est.bg, borderRadius: 100, padding: '3px 9px', whiteSpace: 'nowrap' }}>{est.l}</span>
                  </td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: C.muted }}>{f.contacto ?? (f.estado === 'en_progreso' ? 'Por cerrar' : '—')}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, color: C.text }}>{f.resultadoVisita ? RESULTADO_LABEL[f.resultadoVisita] ?? f.resultadoVisita : '—'}</td>
                  <td style={{ padding: '10px 12px', fontSize: 13, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{f.totalPedido ? fmtPrecioCLP(f.totalPedido) : '—'}</td>
                </tr>
              )
            })}
            {filtradas.length === 0 && (
              <tr><td colSpan={7} style={{ padding: '24px 12px', textAlign: 'center', fontSize: 13, color: C.muted }}>Sin resultados.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
