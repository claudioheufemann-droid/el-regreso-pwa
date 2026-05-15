'use client'

import { useState } from 'react'
import { Plus, Trash2, Loader2, CheckCircle } from 'lucide-react'
import { Meta, Periodo } from '@/lib/types'

const CATEGORIAS = [
  'Total', 'Bar', 'Minimarket', 'Cafetería', 'Botillería',
  'Almacén', 'Restaurante', 'Supermercado', 'Distribuidor',
  'Actividades Turísticas', 'Cliente Directo', 'Otros',
]

interface Props {
  periodos: Periodo[]
  metas: Meta[]
  vendedores: string[]
}

interface FormMeta {
  vendedor: string
  tipo: 'mensual' | 'semanal'
  categoria_negocio: string
  meta_litros: string
  fecha_inicio: string
  fecha_fin: string
}

export default function MetasAdminClient({ periodos, metas: initialMetas, vendedores }: Props) {
  const [metas, setMetas] = useState<Meta[]>(initialMetas)
  const [periodoSeleccionado, setPeriodoSeleccionado] = useState(periodos.find(p => p.activo)?.id?.toString() ?? '')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const periodoActivo = periodos.find(p => p.id.toString() === periodoSeleccionado)

  const [form, setForm] = useState<FormMeta>({
    vendedor: vendedores[0],
    tipo: 'mensual',
    categoria_negocio: 'Total',
    meta_litros: '',
    fecha_inicio: periodoActivo?.fecha_inicio ?? '',
    fecha_fin: periodoActivo?.fecha_fin ?? '',
  })

  async function handleGuardar() {
    if (!form.meta_litros || !periodoSeleccionado) return
    setLoading(true)
    setError('')
    setSuccess('')

    const res = await fetch('/api/metas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, periodo_id: parseInt(periodoSeleccionado), meta_litros: parseFloat(form.meta_litros) }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Error al guardar')
    } else {
      setMetas(prev => [...prev, data])
      setSuccess('Meta guardada')
      setShowForm(false)
      setForm(f => ({ ...f, meta_litros: '' }))
      setTimeout(() => setSuccess(''), 3000)
    }
    setLoading(false)
  }

  async function handleEliminar(id: number) {
    const res = await fetch(`/api/metas?id=${id}`, { method: 'DELETE' })
    if (res.ok) setMetas(prev => prev.filter(m => m.id !== id))
  }

  const metasFiltradas = metas.filter(m => m.periodo_id === parseInt(periodoSeleccionado))

  const selectClass = "w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
  const selectStyle = { background: '#2A2A2A', border: '1px solid #3A3A3A' }

  return (
    <div className="px-4 pt-6 pb-4 max-w-5xl mx-auto lg:max-w-2xl">
      <div className="mb-5">
        <h1 className="text-2xl font-black text-white">Gestionar Metas</h1>
        <p className="text-sm mt-1" style={{ color: '#888' }}>Define metas por vendedor y categoría</p>
      </div>

      {/* Selector de período */}
      <div className="mb-5">
        <label className="block text-xs font-medium mb-1.5" style={{ color: '#888' }}>Período</label>
        <select
          value={periodoSeleccionado}
          onChange={e => setPeriodoSeleccionado(e.target.value)}
          className={selectClass}
          style={selectStyle}
        >
          {periodos.map(p => (
            <option key={p.id} value={p.id}>{p.nombre} {p.activo ? '(activo)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 rounded-xl p-3 mb-4" style={{ background: '#002A10', border: '1px solid #004020' }}>
          <CheckCircle size={16} style={{ color: '#34D399' }} />
          <span className="text-sm" style={{ color: '#34D399' }}>{success}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl p-3 mb-4" style={{ background: '#2A0000', border: '1px solid #5A0000' }}>
          <p className="text-sm" style={{ color: '#F87171' }}>{error}</p>
        </div>
      )}

      {/* Botón agregar */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 mb-5 transition-all"
        style={{ background: showForm ? '#2A2A2A' : '#F59E0B', color: showForm ? '#888' : '#000' }}
      >
        <Plus size={18} />
        {showForm ? 'Cancelar' : 'Agregar meta'}
      </button>

      {/* Formulario */}
      {showForm && (
        <div className="rounded-2xl p-4 mb-5 space-y-3" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#888' }}>Vendedor</label>
              <select value={form.vendedor} onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))} className={selectClass} style={selectStyle}>
                {vendedores.map(v => <option key={v} value={v}>{v.split(' ')[0]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: '#888' }}>Tipo</label>
              <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'mensual' | 'semanal' }))} className={selectClass} style={selectStyle}>
                <option value="mensual">Mensual</option>
                <option value="semanal">Semanal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#888' }}>Categoría de negocio</label>
            <select value={form.categoria_negocio} onChange={e => setForm(f => ({ ...f, categoria_negocio: e.target.value }))} className={selectClass} style={selectStyle}>
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: '#888' }}>Meta en litros</label>
            <input
              type="number"
              value={form.meta_litros}
              onChange={e => setForm(f => ({ ...f, meta_litros: e.target.value }))}
              placeholder="Ej: 500"
              className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
              style={{ background: '#2A2A2A', border: '1px solid #3A3A3A' }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: '#888' }}>Fecha inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
                style={{ background: '#2A2A2A', border: '1px solid #3A3A3A', colorScheme: 'dark' }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: '#888' }}>Fecha fin</label>
              <input
                type="date"
                value={form.fecha_fin}
                onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl text-white text-sm outline-none"
                style={{ background: '#2A2A2A', border: '1px solid #3A3A3A', colorScheme: 'dark' }}
              />
            </div>
          </div>

          <button
            onClick={handleGuardar}
            disabled={loading || !form.meta_litros}
            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
            style={{ background: '#F59E0B', color: '#000', opacity: loading || !form.meta_litros ? 0.6 : 1 }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Guardar meta
          </button>
        </div>
      )}

      {/* Lista de metas */}
      {metasFiltradas.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}>
          <p className="text-sm" style={{ color: '#666' }}>No hay metas para este período</p>
        </div>
      ) : (
        <div className="space-y-2">
          {metasFiltradas.map(meta => (
            <div
              key={meta.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: '#1A1A1A', border: '1px solid #2A2A2A' }}
            >
              <div>
                <p className="text-sm font-semibold text-white">
                  {meta.vendedor.split(' ')[0]} · {meta.categoria_negocio}
                </p>
                <p className="text-xs mt-0.5" style={{ color: '#888' }}>
                  {meta.tipo} · {meta.meta_litros} L
                </p>
              </div>
              <button onClick={() => handleEliminar(meta.id)} className="p-2 rounded-lg transition-colors" style={{ color: '#666' }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
