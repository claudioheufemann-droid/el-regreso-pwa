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

const inputStyle = {
  background: 'var(--surface2)',
  border: '1px solid var(--border)',
  color: 'var(--cream)',
}

const inputFocusHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--gold)'
}
const inputBlurHandler = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) => {
  e.target.style.borderColor = 'var(--border)'
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

  const inputClass = "w-full px-3 py-2.5 rounded-xl text-sm outline-none transition-colors"
  const selectClass = inputClass

  return (
    <div className="px-4 pt-8 pb-6 max-w-2xl mx-auto lg:px-12 lg:pt-10">
      <div className="mb-6">
        <h1 className="text-2xl font-black" style={{ color: 'var(--cream)' }}>Gestionar Metas</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>Define metas por vendedor y categoría</p>
      </div>

      {/* Selector de período */}
      <div className="mb-5">
        <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>Período</label>
        <select
          value={periodoSeleccionado}
          onChange={e => setPeriodoSeleccionado(e.target.value)}
          className={selectClass}
          style={inputStyle}
          onFocus={inputFocusHandler}
          onBlur={inputBlurHandler}
        >
          {periodos.map(p => (
            <option key={p.id} value={p.id}>{p.nombre} {p.activo ? '(activo)' : ''}</option>
          ))}
        </select>
      </div>

      {/* Feedback */}
      {success && (
        <div className="flex items-center gap-2 rounded-xl p-3 mb-4" style={{ background: 'rgba(74,122,58,0.12)', border: '1px solid rgba(74,122,58,0.3)' }}>
          <CheckCircle size={16} style={{ color: '#4A7A3A' }} />
          <span className="text-sm" style={{ color: '#4A7A3A' }}>{success}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl p-3 mb-4" style={{ background: 'rgba(255,68,68,0.08)', border: '1px solid rgba(255,68,68,0.25)' }}>
          <p className="text-sm" style={{ color: '#FF4444' }}>{error}</p>
        </div>
      )}

      {/* Botón agregar */}
      <button
        onClick={() => setShowForm(!showForm)}
        className="w-full py-3 rounded-xl font-semibold flex items-center justify-center gap-2 mb-5 transition-all"
        style={showForm
          ? { background: 'var(--surface2)', color: 'var(--muted)', border: '1px solid var(--border)' }
          : { background: 'var(--gold)', color: '#000' }
        }
      >
        <Plus size={18} />
        {showForm ? 'Cancelar' : 'Agregar meta'}
      </button>

      {/* Formulario */}
      {showForm && (
        <div className="rounded-2xl p-4 mb-5 space-y-3" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Vendedor</label>
              <select
                value={form.vendedor}
                onChange={e => setForm(f => ({ ...f, vendedor: e.target.value }))}
                className={selectClass}
                style={inputStyle}
                onFocus={inputFocusHandler}
                onBlur={inputBlurHandler}
              >
                {vendedores.map(v => <option key={v} value={v}>{v.split(' ')[0]}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Tipo</label>
              <select
                value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'mensual' | 'semanal' }))}
                className={selectClass}
                style={inputStyle}
                onFocus={inputFocusHandler}
                onBlur={inputBlurHandler}
              >
                <option value="mensual">Mensual</option>
                <option value="semanal">Semanal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Categoría de negocio</label>
            <select
              value={form.categoria_negocio}
              onChange={e => setForm(f => ({ ...f, categoria_negocio: e.target.value }))}
              className={selectClass}
              style={inputStyle}
              onFocus={inputFocusHandler}
              onBlur={inputBlurHandler}
            >
              {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Meta en litros</label>
            <input
              type="number"
              value={form.meta_litros}
              onChange={e => setForm(f => ({ ...f, meta_litros: e.target.value }))}
              placeholder="Ej: 500"
              className={inputClass}
              style={inputStyle}
              onFocus={inputFocusHandler}
              onBlur={inputBlurHandler}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Fecha inicio</label>
              <input
                type="date"
                value={form.fecha_inicio}
                onChange={e => setForm(f => ({ ...f, fecha_inicio: e.target.value }))}
                className={inputClass}
                style={{ ...inputStyle, colorScheme: 'dark' }}
                onFocus={inputFocusHandler}
                onBlur={inputBlurHandler}
              />
            </div>
            <div>
              <label className="block text-xs mb-1" style={{ color: 'var(--muted)' }}>Fecha fin</label>
              <input
                type="date"
                value={form.fecha_fin}
                onChange={e => setForm(f => ({ ...f, fecha_fin: e.target.value }))}
                className={inputClass}
                style={{ ...inputStyle, colorScheme: 'dark' }}
                onFocus={inputFocusHandler}
                onBlur={inputBlurHandler}
              />
            </div>
          </div>

          <button
            onClick={handleGuardar}
            disabled={loading || !form.meta_litros}
            className="w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all"
            style={{ background: 'var(--gold)', color: '#000', opacity: loading || !form.meta_litros ? 0.6 : 1 }}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Guardar meta
          </button>
        </div>
      )}

      {/* Lista de metas */}
      {metasFiltradas.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No hay metas para este período</p>
        </div>
      ) : (
        <div className="space-y-2">
          {metasFiltradas.map(meta => (
            <div
              key={meta.id}
              className="flex items-center justify-between px-4 py-3 rounded-xl"
              style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '3px solid var(--gold)' }}
            >
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--cream)' }}>
                  {meta.vendedor.split(' ')[0]} · {meta.categoria_negocio}
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                  {meta.tipo} · {meta.meta_litros} L
                </p>
              </div>
              <button
                onClick={() => handleEliminar(meta.id)}
                className="p-2 rounded-lg transition-colors"
                style={{ color: 'var(--muted)' }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
