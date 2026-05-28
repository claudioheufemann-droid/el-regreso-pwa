'use client'

import { useCallback, useState } from 'react'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { Upload, Filter, AlertTriangle, CheckCircle2, BarChart3, Mail, MapPin } from 'lucide-react'
import { formatCurrency } from '@/lib/utils'

interface Deudor {
  id: string
  nombre_fantasia: string
  razon_social?: string
  saldo_total: number
  deuda_vencida: number
  barriles_adeudados: number
  ultimo_pago: string | null
  vendedor: string | null
  categoria_cliente: string | null
  localidad: string | null
  email: string | null
  telefono: string | null
  deuda_menor_14_dias: number
  deuda_entre_15_29_dias: number
  deuda_entre_30_44_dias: number
  deuda_entre_45_59_dias: number
  deuda_entre_60_89_dias: number
  deuda_mas_90_dias: number
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
  const isDesktop = useIsDesktop()
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

  // Get unique vendors and categories
  const vendedores = Array.from(new Set(deudores.map(d => d.vendedor).filter((v): v is string => v !== null && v !== undefined)))
  const categorias = Array.from(new Set(deudores.map(d => d.categoria_cliente).filter((c): c is string => c !== null && c !== undefined)))

  // Filter deudores
  const filteredDeudores = deudores.filter(d => {
    if (filterVendedor && d.vendedor !== filterVendedor) return false
    if (filterCategoria && d.categoria_cliente !== filterCategoria) return false
    if (filterDeudaVencida === 'vencida' && d.deuda_vencida <= 0) return false
    if (filterDeudaVencida === 'sin-vencida' && d.deuda_vencida > 0) return false
    if (searchText && !d.nombre_fantasia.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  // Calculate totals
  const totals = {
    deudores: filteredDeudores.length,
    saldo_total: filteredDeudores.reduce((sum, d) => sum + d.saldo_total, 0),
    deuda_vencida: filteredDeudores.reduce((sum, d) => sum + d.deuda_vencida, 0),
    barriles_adeudados: filteredDeudores.reduce((sum, d) => sum + d.barriles_adeudados, 0),
  }

  // Handle file upload
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

      const response = await fetch('/api/deudores/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Error uploading file')
      }

      setUploadStats(data)
      // Refresh deudores list
      const listResponse = await fetch('/api/deudores/list')
      if (listResponse.ok) {
        const newDeudores = await listResponse.json()
        setDeudores(newDeudores)
      }
    } catch (error: unknown) {
      setUploadError(error instanceof Error ? error.message : 'Error uploading file')
    } finally {
      setUploading(false)
    }
  }, [])

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleUpload(files[0])
    }
  }

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files
    if (files && files[0]) {
      handleUpload(files[0])
    }
  }

  if (!isDesktop) {
    return (
      <div className="p-4 text-center text-gray-600">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
        <p>Esta sección está optimizada para pantalla de escritorio.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Gestión de Deudores</h1>
          <p className="text-slate-600">Carga y monitorea deuda vencida, barriles adeudados y últimos pagos</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-blue-500">
            <p className="text-slate-600 text-sm font-semibold mb-1">TOTAL DEUDORES</p>
            <p className="text-3xl font-bold text-slate-900">{totals.deudores}</p>
            <p className="text-xs text-slate-500 mt-2">Filtrados actualmente</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-red-500">
            <p className="text-slate-600 text-sm font-semibold mb-1">DEUDA VENCIDA</p>
            <p className="text-3xl font-bold text-red-600">{formatCurrency(totals.deuda_vencida)}</p>
            <p className="text-xs text-slate-500 mt-2">A cobrar urgente</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-amber-500">
            <p className="text-slate-600 text-sm font-semibold mb-1">SALDO TOTAL</p>
            <p className="text-3xl font-bold text-amber-600">{formatCurrency(totals.saldo_total)}</p>
            <p className="text-xs text-slate-500 mt-2">Toda deuda</p>
          </div>

          <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-purple-500">
            <p className="text-slate-600 text-sm font-semibold mb-1">BARRILES ADEUDADOS</p>
            <p className="text-3xl font-bold text-purple-600">{totals.barriles_adeudados}</p>
            <p className="text-xs text-slate-500 mt-2">Unidades pendientes</p>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8 mb-8">
          <h2 className="text-xl font-bold text-slate-900 mb-6 flex items-center gap-2">
            <Upload className="w-6 h-6 text-blue-600" />
            Cargar Informe de Deudores
          </h2>

          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
              dragActive
                ? 'border-blue-500 bg-blue-50'
                : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50'
            }`}
          >
            <Upload className={`w-12 h-12 mx-auto mb-4 ${dragActive ? 'text-blue-600' : 'text-slate-400'}`} />
            <p className="text-slate-900 font-semibold mb-1">Arrastra un archivo Excel aquí</p>
            <p className="text-slate-600 text-sm mb-4">o haz clic para seleccionar</p>

            <label className="inline-block">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileInput}
                disabled={uploading}
                className="hidden"
              />
              <span className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg font-semibold cursor-pointer hover:bg-blue-700 disabled:opacity-50">
                {uploading ? 'Cargando...' : 'Seleccionar archivo'}
              </span>
            </label>

            <p className="text-xs text-slate-500 mt-4">Solo archivos Excel (.xlsx, .xls)</p>
          </div>

          {uploadError && (
            <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-red-900">{uploadError}</p>
              </div>
            </div>
          )}

          {uploadStats && (
            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex gap-3 mb-3">
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-green-900">Carga exitosa</p>
                  <p className="text-sm text-green-700">Batch ID: {uploadStats.batch_id}</p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-4 mt-4 text-sm">
                <div>
                  <p className="text-green-600 font-semibold">{uploadStats.total_procesados}</p>
                  <p className="text-green-700">Procesados</p>
                </div>
                <div>
                  <p className="text-blue-600 font-semibold">{uploadStats.nuevos}</p>
                  <p className="text-blue-700">Nuevos</p>
                </div>
                <div>
                  <p className="text-amber-600 font-semibold">{uploadStats.actualizados}</p>
                  <p className="text-amber-700">Actualizados</p>
                </div>
                <div>
                  <p className="text-red-600 font-semibold">{uploadStats.duplicados_en_archivo}</p>
                  <p className="text-red-700">Duplicados</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 mb-8">
          <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
            <Filter className="w-5 h-5 text-blue-600" />
            Filtros
          </h2>

          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Buscar cliente</label>
              <input
                type="text"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                placeholder="Nombre de fantasía..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Vendedor</label>
              <select
                value={filterVendedor}
                onChange={e => setFilterVendedor(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todos</option>
                {vendedores.map(v => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Categoría</label>
              <select
                value={filterCategoria}
                onChange={e => setFilterCategoria(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Todas</option>
                {categorias.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Estado deuda</label>
              <select
                value={filterDeudaVencida}
                onChange={e => setFilterDeudaVencida(e.target.value as typeof filterDeudaVencida)}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="todos">Todos</option>
                <option value="vencida">Con deuda vencida</option>
                <option value="sin-vencida">Sin deuda vencida</option>
              </select>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-100 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">Cliente</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">Vendedor</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">Categoría</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-700">Deuda Vencida</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-700">Saldo Total</th>
                  <th className="px-6 py-3 text-right font-semibold text-slate-700">Barriles</th>
                  <th className="px-6 py-3 text-left font-semibold text-slate-700">Último Pago</th>
                  <th className="px-6 py-3 text-center font-semibold text-slate-700">Detalle</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredDeudores.map((deudor, idx) => (
                  <>
                    <tr
                      key={deudor.id}
                      className={`hover:bg-blue-50 transition-colors cursor-pointer ${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}
                      onClick={() => setExpandedRow(expandedRow === deudor.id ? null : deudor.id)}
                    >
                      <td className="px-6 py-4 font-semibold text-slate-900">{deudor.nombre_fantasia}</td>
                      <td className="px-6 py-4 text-slate-600">{deudor.vendedor || '-'}</td>
                      <td className="px-6 py-4 text-slate-600">{deudor.categoria_cliente || '-'}</td>
                      <td
                        className={`px-6 py-4 text-right font-semibold ${
                          deudor.deuda_vencida > 0 ? 'text-red-600' : 'text-green-600'
                        }`}
                      >
                        {formatCurrency(deudor.deuda_vencida)}
                      </td>
                      <td className="px-6 py-4 text-right text-slate-900 font-semibold">
                        {formatCurrency(deudor.saldo_total)}
                      </td>
                      <td className="px-6 py-4 text-right font-semibold text-slate-900">{deudor.barriles_adeudados}</td>
                      <td className="px-6 py-4 text-slate-600">
                        {deudor.ultimo_pago
                          ? new Date(deudor.ultimo_pago).toLocaleDateString('es-CL')
                          : 'Sin registros'}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-blue-600 font-semibold text-xs">
                          {expandedRow === deudor.id ? '▼' : '▶'}
                        </span>
                      </td>
                    </tr>

                    {expandedRow === deudor.id && (
                      <tr className={`${idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}>
                        <td colSpan={8} className="px-6 py-6 bg-blue-50 border-t border-blue-200">
                          <div className="grid grid-cols-3 gap-8">
                            {/* Contact Info */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <Mail className="w-4 h-4" />
                                Información de Contacto
                              </h3>
                              <div className="space-y-2 text-sm">
                                {deudor.email && (
                                  <p className="text-slate-700">
                                    <span className="font-semibold">Email:</span> {deudor.email}
                                  </p>
                                )}
                                {deudor.telefono && (
                                  <p className="text-slate-700">
                                    <span className="font-semibold">Teléfono:</span> {deudor.telefono}
                                  </p>
                                )}
                                {deudor.localidad && (
                                  <p className="text-slate-700">
                                    <span className="font-semibold">Localidad:</span> {deudor.localidad}
                                  </p>
                                )}
                                <p className="text-slate-600 text-xs mt-3 pt-3 border-t border-blue-200">
                                  Razón Social: {deudor.razon_social || '-'}
                                </p>
                              </div>
                            </div>

                            {/* Debt Aging */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4" />
                                Deuda por Antigüedad
                              </h3>
                              <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                  <span className="text-slate-700">Menor a 14 días:</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(deudor.deuda_menor_14_dias)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-700">15-29 días:</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(deudor.deuda_entre_15_29_dias)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-700">30-44 días:</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(deudor.deuda_entre_30_44_dias)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-700">45-59 días:</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(deudor.deuda_entre_45_59_dias)}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-slate-700">60-89 días:</span>
                                  <span className="font-semibold text-slate-900">{formatCurrency(deudor.deuda_entre_60_89_dias)}</span>
                                </div>
                                <div className="flex justify-between border-t border-blue-200 pt-2 mt-2">
                                  <span className="text-slate-700 font-semibold">Más de 90 días:</span>
                                  <span className="font-bold text-red-600">{formatCurrency(deudor.deuda_mas_90_dias)}</span>
                                </div>
                              </div>
                            </div>

                            {/* Account Info */}
                            <div>
                              <h3 className="text-sm font-bold text-slate-900 mb-4 flex items-center gap-2">
                                <MapPin className="w-4 h-4" />
                                Detalles de Cuenta
                              </h3>
                              <div className="space-y-2 text-sm">
                                <p className="text-slate-700">
                                  <span className="font-semibold">Tipo de Cliente:</span> {deudor.tipo_cliente || '-'}
                                </p>
                                <p className="text-slate-700">
                                  <span className="font-semibold">Límite Cta. Cte:</span> {formatCurrency(deudor.limite_cta_cte)}
                                </p>
                                <p className="text-slate-700">
                                  <span className="font-semibold">Última Compra:</span>{' '}
                                  {deudor.fecha_ultima_compra ? new Date(deudor.fecha_ultima_compra).toLocaleDateString('es-CL') : '-'}
                                </p>
                                <p className="text-slate-700">
                                  <span className="font-semibold">Días Promedio Pago:</span> {deudor.dias_pago ? `${deudor.dias_pago} días` : '-'}
                                </p>
                                <p className="text-slate-600 text-xs mt-3 pt-3 border-t border-blue-200">
                                  Fecha Alta: {new Date(deudor.fecha_alta).toLocaleDateString('es-CL')}
                                </p>
                              </div>
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

          {filteredDeudores.length === 0 && (
            <div className="p-8 text-center text-slate-600">
              <p className="font-semibold mb-2">No se encontraron deudores</p>
              <p className="text-sm">Ajusta los filtros e intenta nuevamente</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
