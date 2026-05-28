'use client'

import { useCallback, useState } from 'react'
import { Upload, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Deudor {
  id: string
  nombre_fantasia: string
  razon_social?: string
  email?: string | null
  telefono?: string | null
  localidad?: string | null
  saldo_total: number
  deuda_vencida: number
  barriles_adeudados: number
  ultimo_pago?: string | null
  categoria_cliente?: string | null
  vendedor?: string | null
  tipo_cliente?: string | null
  fecha_ultima_compra?: string | null
  fecha_alta?: string | null
  limite_cta_cte?: number
  deuda_menor_14_dias: number
  deuda_entre_15_29_dias: number
  deuda_entre_30_44_dias: number
  deuda_entre_45_59_dias: number
  deuda_entre_60_89_dias: number
  deuda_mas_90_dias: number
  dias_pago?: number
  updated_at: string
}

interface UploadStats {
  total_procesados: number
  nuevos: number
  actualizados: number
  duplicados_en_archivo: number
  batch_id: string
}

export default function DeudoresClient({ initialDeudores }: { initialDeudores: Deudor[] }) {
  const [deudores, setDeudores] = useState<Deudor[]>(initialDeudores)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadStats, setUploadStats] = useState<UploadStats | null>(null)
  const [dragActive, setDragActive] = useState(false)
  const [filterVendedor, setFilterVendedor] = useState('')
  const [filterCategoria, setFilterCategoria] = useState('')
  const [filterDeudaVencida, setFilterDeudaVencida] = useState<'todos' | 'vencida' | 'sin-vencida'>('todos')
  const [searchText, setSearchText] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const vendedores = Array.from(new Set(deudores.map(d => d.vendedor).filter((v): v is string => v !== null && v !== undefined)))
  const categorias = Array.from(new Set(deudores.map(d => d.categoria_cliente).filter((c): c is string => c !== null && c !== undefined)))

  const filteredDeudores = deudores.filter(d => {
    if (filterVendedor && d.vendedor !== filterVendedor) return false
    if (filterCategoria && d.categoria_cliente !== filterCategoria) return false
    if (filterDeudaVencida === 'vencida' && d.deuda_vencida <= 0) return false
    if (filterDeudaVencida === 'sin-vencida' && d.deuda_vencida > 0) return false
    if (searchText && !d.nombre_fantasia.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  const totals = {
    deudores: filteredDeudores.length,
    saldo_total: filteredDeudores.reduce((sum, d) => sum + (d.saldo_total || 0), 0),
    deuda_vencida: filteredDeudores.reduce((sum, d) => sum + (d.deuda_vencida || 0), 0),
    barriles_adeudados: filteredDeudores.reduce((sum, d) => sum + (d.barriles_adeudados || 0), 0),
  }

  const handleUpload = useCallback(async (file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      setUploadError('Solo archivos Excel (.xlsx, .xls)')
      return
    }
    setUploading(true)
    setUploadError('')
    setUploadStats(null)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const response = await fetch('/api/deudores/upload', { method: 'POST', body: formData })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Error al subir')
      setUploadStats(data)
      const listResponse = await fetch('/api/deudores/list')
      if (listResponse.ok) setDeudores(await listResponse.json())
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : 'Error al subir')
    } finally {
      setUploading(false)
    }
  }, [])

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(e.type === 'dragenter' || e.type === 'dragover')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    const files = e.dataTransfer.files
    if (files?.[0]) handleUpload(files[0])
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--cream)', fontSize: 13,
    outline: 'none',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23888\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 32,
  }

  return (
    <div style={{ maxWidth: 1400 }}>

      {/* Upload zone */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, padding: '20px 24px', marginBottom: 20,
      }}>
        <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)', marginBottom: 12 }}>
          Cargar Informe de Deudores
        </p>

        <div
          onDragEnter={handleDrag} onDragLeave={handleDrag}
          onDragOver={handleDrag} onDrop={handleDrop}
          style={{
            border: `2px dashed ${dragActive ? 'var(--gold)' : 'var(--border)'}`,
            borderRadius: 10, padding: '24px 20px', textAlign: 'center',
            background: dragActive ? 'rgba(212,175,55,0.04)' : 'transparent',
            transition: 'all 0.15s', cursor: 'pointer',
          }}
        >
          <Upload size={28} style={{ margin: '0 auto 10px', color: dragActive ? 'var(--gold)' : 'var(--muted)' }} />
          <p style={{ fontSize: 13, color: 'var(--cream)', fontWeight: 600, marginBottom: 4 }}>
            Arrastra el Excel aquí
          </p>
          <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>
            o haz clic para seleccionar
          </p>
          <label>
            <input
              type="file" accept=".xlsx,.xls"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f) }}
              disabled={uploading} style={{ display: 'none' }}
            />
            <span style={{
              display: 'inline-block', padding: '7px 20px',
              background: 'var(--gold)', color: '#1a1200',
              borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              {uploading ? 'Cargando...' : 'Seleccionar archivo'}
            </span>
          </label>
          <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 10 }}>Solo .xlsx o .xls</p>
        </div>

        {uploadError && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
            display: 'flex', gap: 8, alignItems: 'flex-start',
          }}>
            <AlertTriangle size={15} style={{ color: '#F87171', flexShrink: 0, marginTop: 1 }} />
            <p style={{ fontSize: 13, color: '#F87171' }}>{uploadError}</p>
          </div>
        )}

        {uploadStats && (
          <div style={{
            marginTop: 12, padding: '12px 16px', borderRadius: 8,
            background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
          }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
              <CheckCircle2 size={15} style={{ color: '#4ade80' }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#4ade80' }}>
                Carga exitosa
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12 }}>
              {[
                { label: 'Procesados', value: uploadStats.total_procesados, color: 'var(--cream)' },
                { label: 'Nuevos', value: uploadStats.nuevos, color: '#60a5fa' },
                { label: 'Actualizados', value: uploadStats.actualizados, color: 'var(--gold)' },
                { label: 'Duplicados', value: uploadStats.duplicados_en_archivo, color: '#f87171' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <p style={{ fontSize: 20, fontWeight: 900, color }}>{value}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>{label}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Deudores', value: totals.deudores, format: 'n', color: '#60a5fa' },
          { label: 'Deuda Vencida', value: totals.deuda_vencida, format: '$', color: '#f87171' },
          { label: 'Saldo Total', value: totals.saldo_total, format: '$', color: 'var(--gold)' },
          { label: 'Barriles', value: totals.barriles_adeudados, format: 'n', color: '#c084fc' },
        ].map(({ label, value, format, color }) => (
          <div key={label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderTop: `3px solid ${color}`, borderRadius: 12, padding: '16px 20px',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>
              {label}
            </p>
            <p style={{ fontSize: 22, fontWeight: 900, color }}>
              {format === '$' ? formatCurrency(value) : value.toLocaleString('es-CL')}
            </p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 16,
        display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12,
      }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
            BUSCAR
          </label>
          <input
            type="text" value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Nombre cliente..."
            style={inputStyle}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
            VENDEDOR
          </label>
          <select value={filterVendedor} onChange={e => setFilterVendedor(e.target.value)} style={selectStyle}>
            <option value="">Todos</option>
            {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
            CATEGORÍA
          </label>
          <select value={filterCategoria} onChange={e => setFilterCategoria(e.target.value)} style={selectStyle}>
            <option value="">Todas</option>
            {categorias.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
            ESTADO
          </label>
          <select
            value={filterDeudaVencida}
            onChange={e => setFilterDeudaVencida(e.target.value as typeof filterDeudaVencida)}
            style={selectStyle}
          >
            <option value="todos">Todos</option>
            <option value="vencida">Con deuda vencida</option>
            <option value="sin-vencida">Sin deuda vencida</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {filteredDeudores.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              {deudores.length === 0
                ? 'Carga el informe de deudores para ver los datos'
                : 'No hay deudores que coincidan con los filtros'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Cliente', 'Vendedor', 'Categoría', 'Deuda Vencida', 'Saldo Total', 'Barriles', 'Último Pago', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: h === 'Deuda Vencida' || h === 'Saldo Total' || h === 'Barriles' ? 'right' : 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDeudores.map((deudor) => (
                  <>
                    <tr
                      key={deudor.id}
                      onClick={() => setExpandedRow(expandedRow === deudor.id ? null : deudor.id)}
                      style={{
                        borderBottom: '1px solid var(--border)', cursor: 'pointer',
                        background: expandedRow === deudor.id ? 'rgba(212,175,55,0.04)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (expandedRow !== deudor.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (expandedRow !== deudor.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--cream)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {deudor.nombre_fantasia}
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{deudor.vendedor || '—'}</td>
                      <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{deudor.categoria_cliente || '—'}</td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: deudor.deuda_vencida > 0 ? '#f87171' : '#4ade80' }}>
                        {formatCurrency(deudor.deuda_vencida)}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: 'var(--cream)', fontWeight: 600 }}>
                        {formatCurrency(deudor.saldo_total)}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: deudor.barriles_adeudados > 0 ? '#c084fc' : 'var(--muted)', fontWeight: 600 }}>
                        {deudor.barriles_adeudados}
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>
                        {deudor.ultimo_pago ? new Date(deudor.ultimo_pago).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        {expandedRow === deudor.id
                          ? <ChevronDown size={14} style={{ color: 'var(--gold)' }} />
                          : <ChevronRight size={14} style={{ color: 'var(--muted)' }} />}
                      </td>
                    </tr>

                    {expandedRow === deudor.id && (
                      <tr key={`${deudor.id}-detail`}>
                        <td colSpan={8} style={{
                          padding: '20px 24px',
                          background: 'rgba(212,175,55,0.03)',
                          borderBottom: '1px solid var(--border)',
                          borderLeft: '3px solid var(--gold)',
                        }}>
                          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>

                            {/* Contacto */}
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                                Contacto
                              </p>
                              {[
                                { label: 'Email', value: deudor.email },
                                { label: 'Teléfono', value: deudor.telefono },
                                { label: 'Localidad', value: deudor.localidad },
                                { label: 'Razón Social', value: deudor.razon_social },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}: </span>
                                  <span style={{ fontSize: 12, color: 'var(--cream)' }}>{value || '—'}</span>
                                </div>
                              ))}
                            </div>

                            {/* Deuda por antigüedad */}
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                                Deuda por Antigüedad
                              </p>
                              {[
                                { label: '0–14 días', value: deudor.deuda_menor_14_dias },
                                { label: '15–29 días', value: deudor.deuda_entre_15_29_dias },
                                { label: '30–44 días', value: deudor.deuda_entre_30_44_dias },
                                { label: '45–59 días', value: deudor.deuda_entre_45_59_dias },
                                { label: '60–89 días', value: deudor.deuda_entre_60_89_dias },
                                { label: '+90 días', value: deudor.deuda_mas_90_dias },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: (value || 0) > 0 ? '#f87171' : 'var(--muted)' }}>
                                    {formatCurrency(value || 0)}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* Cuenta */}
                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                                Cuenta
                              </p>
                              {[
                                { label: 'Tipo Cliente', value: deudor.tipo_cliente },
                                { label: 'Límite Cta Cte', value: deudor.limite_cta_cte ? formatCurrency(deudor.limite_cta_cte) : null },
                                { label: 'Días Pago', value: deudor.dias_pago ? `${deudor.dias_pago} días` : null },
                                { label: 'Última Compra', value: deudor.fecha_ultima_compra ? new Date(deudor.fecha_ultima_compra).toLocaleDateString('es-CL') : null },
                                { label: 'Fecha Alta', value: deudor.fecha_alta ? new Date(deudor.fecha_alta).toLocaleDateString('es-CL') : null },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}: </span>
                                  <span style={{ fontSize: 12, color: 'var(--cream)' }}>{value || '—'}</span>
                                </div>
                              ))}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'right' }}>
        Mostrando {filteredDeudores.length} de {deudores.length} deudores
      </p>
    </div>
  )
}
