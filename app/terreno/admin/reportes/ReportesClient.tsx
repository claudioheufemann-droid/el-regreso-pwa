'use client'

import { useMemo, useState } from 'react'
import { FileSpreadsheet, FileText } from 'lucide-react'
import { C, cardStyle, TAP } from '../../theme'
import PeriodoFiltro from '../PeriodoFiltro'
import type { TipoPeriodo } from '@/lib/terreno/tiempoChile'
import { fmtPrecioCLP } from '@/lib/catalogo-productos'

export interface FilaReporte {
  id: string
  vendedor: string
  cliente: string
  direccion: string
  comuna: string
  llegada: string
  cierre: string | null
  presencia: string
  distanciaM: number | null
  precisionM: number | null
  contacto: string | null
  objetivo: string | null
  resultado: string | null
  proximoPaso: string | null
  proximoPasoFecha: string | null
  totalPedido: number
}

const PRESENCIA_VERIFICADA = new Set(['verificada_auto', 'aprobada_manual'])

function filaParaExport(f: FilaReporte) {
  return {
    ID: f.id,
    Vendedor: f.vendedor,
    Cliente: f.cliente,
    Dirección: f.direccion,
    Comuna: f.comuna,
    Llegada: new Date(f.llegada).toLocaleString('es-CL'),
    Cierre: f.cierre ? new Date(f.cierre).toLocaleString('es-CL') : '',
    Presencia: f.presencia,
    'Distancia (m)': f.distanciaM ?? '',
    'Precisión (m)': f.precisionM ?? '',
    Contacto: f.contacto ?? '',
    Objetivo: f.objetivo ?? '',
    Resultado: f.resultado ?? '',
    'Próximo paso': f.proximoPaso ?? '',
    'Fecha próximo paso': f.proximoPasoFecha ?? '',
    'Total pedido': f.totalPedido,
  }
}

export default function ReportesClient({ tipo, fecha, rangoTexto, filas }: {
  tipo: TipoPeriodo; fecha: string; rangoTexto: string; filas: FilaReporte[]
}) {
  const [exportando, setExportando] = useState<'xlsx' | 'csv' | null>(null)

  const resumenPorVendedor = useMemo(() => {
    const mapa = new Map<string, { vendedor: string; visitas: number; verificadas: number; finalizadas: number; total: number }>()
    for (const f of filas) {
      const actual = mapa.get(f.vendedor) ?? { vendedor: f.vendedor, visitas: 0, verificadas: 0, finalizadas: 0, total: 0 }
      actual.visitas += 1
      if (PRESENCIA_VERIFICADA.has(f.presencia)) actual.verificadas += 1
      if (f.cierre) actual.finalizadas += 1
      actual.total += f.totalPedido
      mapa.set(f.vendedor, actual)
    }
    return [...mapa.values()].sort((a, b) => b.visitas - a.visitas)
  }, [filas])

  async function exportar(tipoArchivo: 'xlsx' | 'csv') {
    setExportando(tipoArchivo)
    try {
      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      const hojaResumen = XLSX.utils.json_to_sheet(resumenPorVendedor.map(r => ({
        Vendedor: r.vendedor, Visitas: r.visitas, Verificadas: r.verificadas, Finalizadas: r.finalizadas, 'Total pedidos': r.total,
      })))
      XLSX.utils.book_append_sheet(wb, hojaResumen, 'Resumen por vendedor')
      const hojaDetalle = XLSX.utils.json_to_sheet(filas.map(filaParaExport))
      XLSX.utils.book_append_sheet(wb, hojaDetalle, 'Detalle de visitas')

      const nombreArchivo = `terreno_${fecha}_${tipo}.${tipoArchivo}`
      if (tipoArchivo === 'xlsx') {
        XLSX.writeFile(wb, nombreArchivo)
      } else {
        XLSX.writeFile(wb, nombreArchivo, { bookType: 'csv', sheet: 'Detalle de visitas' })
      }
    } finally {
      setExportando(null)
    }
  }

  return (
    <div style={{ padding: '28px 28px 60px', maxWidth: 1180 }}>
      <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>REPORTES</p>
      <h1 style={{ fontSize: 26, fontWeight: 900, color: C.text, letterSpacing: '-0.4px', marginBottom: 16 }}>
        Exportar período
      </h1>

      <PeriodoFiltro tipo={tipo} fecha={fecha} rangoTexto={rangoTexto} />

      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        <button
          onClick={() => exportar('xlsx')}
          disabled={exportando !== null || filas.length === 0}
          style={{
            minHeight: TAP, padding: '0 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: C.verdeLlegada, color: '#fff', fontSize: 13.5, fontWeight: 800,
            display: 'flex', alignItems: 'center', gap: 7, opacity: exportando || filas.length === 0 ? 0.6 : 1,
          }}
        >
          <FileSpreadsheet size={16} /> {exportando === 'xlsx' ? 'Generando…' : 'Exportar Excel'}
        </button>
        <button
          onClick={() => exportar('csv')}
          disabled={exportando !== null || filas.length === 0}
          style={{
            minHeight: TAP, padding: '0 16px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 13.5, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 7, opacity: exportando || filas.length === 0 ? 0.6 : 1,
          }}
        >
          <FileText size={16} /> {exportando === 'csv' ? 'Generando…' : 'Exportar CSV'}
        </button>
      </div>

      <div style={{ ...cardStyle, padding: 18, marginBottom: 20, overflowX: 'auto' }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>Resumen por vendedor</p>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
          <thead>
            <tr>
              {['Vendedor', 'Visitas', 'Verificadas', 'Finalizadas', 'Total pedidos'].map(h => (
                <th key={h} style={{ fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', padding: '0 10px 10px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {resumenPorVendedor.map(r => (
              <tr key={r.vendedor} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: '9px 10px', fontSize: 13.5, fontWeight: 700, color: C.text }}>{r.vendedor}</td>
                <td style={{ padding: '9px 10px', fontSize: 13 }}>{r.visitas}</td>
                <td style={{ padding: '9px 10px', fontSize: 13 }}>{r.verificadas}</td>
                <td style={{ padding: '9px 10px', fontSize: 13 }}>{r.finalizadas}</td>
                <td style={{ padding: '9px 10px', fontSize: 13, fontWeight: 700 }}>{fmtPrecioCLP(r.total)}</td>
              </tr>
            ))}
            {resumenPorVendedor.length === 0 && (
              <tr><td colSpan={5} style={{ padding: '18px 10px', textAlign: 'center', fontSize: 13, color: C.muted }}>Sin datos en este período.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ ...cardStyle, padding: 18, overflowX: 'auto' }}>
        <p style={{ fontSize: 13, fontWeight: 800, color: C.text, marginBottom: 12 }}>
          Detalle de visitas <span style={{ color: C.muted, fontWeight: 500 }}>({filas.length}{filas.length === 2000 ? '+' : ''})</span>
        </p>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr>
              {['Cliente', 'Vendedor', 'Llegada', 'Presencia', 'Resultado', 'Total'].map(h => (
                <th key={h} style={{ fontSize: 11, fontWeight: 700, color: C.muted, textAlign: 'left', padding: '0 10px 10px', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.slice(0, 30).map(f => (
              <tr key={f.id} style={{ borderTop: `1px solid ${C.line}` }}>
                <td style={{ padding: '8px 10px', fontSize: 13 }}>{f.cliente}</td>
                <td style={{ padding: '8px 10px', fontSize: 13, color: C.muted }}>{f.vendedor}</td>
                <td style={{ padding: '8px 10px', fontSize: 12.5, color: C.muted, whiteSpace: 'nowrap' }}>{new Date(f.llegada).toLocaleString('es-CL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td style={{ padding: '8px 10px', fontSize: 12.5 }}>{f.presencia}</td>
                <td style={{ padding: '8px 10px', fontSize: 12.5 }}>{f.resultado ?? '—'}</td>
                <td style={{ padding: '8px 10px', fontSize: 13, fontWeight: 700 }}>{f.totalPedido ? fmtPrecioCLP(f.totalPedido) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filas.length > 30 && (
          <p style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>Mostrando 30 de {filas.length} — el export trae el período completo.</p>
        )}
      </div>
    </div>
  )
}
