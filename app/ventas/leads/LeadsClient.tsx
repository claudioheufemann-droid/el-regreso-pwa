'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Loader2, MessageCircle, Phone, Search, Target, Droplets, Star, MapPin, Globe, RefreshCw } from 'lucide-react'
import WAModal, { type WATarget } from '@/components/ui/WAModal'

interface Lead {
  id: number; nombre: string; region: string | null; ciudad: string | null
  tipo_buscado: string | null; producto_sugerido: string | null
  categoria: string | null; categoria_mapeada: string | null
  direccion: string | null; telefono: string | null; sitio_web: string | null
  rating: number | null; lat: number | null; lng: number | null
  litros_potencial: number | null; score_lead: number | null
  en_zona: boolean; estado: string; vendedor_asignado: string | null; nota: string | null
}

const ESTADOS: Record<string, { label: string; color: string }> = {
  nuevo:      { label: 'Nuevo',      color: '#60A5FA' },
  contactado: { label: 'Contactado', color: '#F59E0B' },
  convertido: { label: 'Convertido', color: '#34D399' },
  descartado: { label: 'Descartado', color: '#6B7280' },
}
const PRODUCTOS = ['all', 'Ambos', 'Cerveza Artesanal', 'Kombucha']

function scoreColor(s: number) { return s >= 70 ? '#34D399' : s >= 45 ? '#F59E0B' : '#9CA3AF' }

export default function LeadsClient({ isAdmin }: { isAdmin: boolean }) {
  const [leads, setLeads] = useState<Lead[]>([])
  const [loading, setLoading] = useState(true)
  const [enZona, setEnZona] = useState(true)
  const [producto, setProducto] = useState('all')
  const [ciudad, setCiudad] = useState('all')
  const [q, setQ] = useState('')
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const p = new URLSearchParams({ limit: '1000' })
      if (enZona) p.set('en_zona', '1')
      if (producto !== 'all') p.set('producto', producto)
      const res = await fetch(`/api/leads?${p}`)
      const d = await res.json()
      setLeads(Array.isArray(d?.leads) ? d.leads : [])
    } catch { setLeads([]) }
    finally { setLoading(false) }
  }, [enZona, producto])

  useEffect(() => { load() }, [load])

  const ciudades = useMemo(() => [...new Set(leads.map(l => l.ciudad).filter(Boolean))].sort() as string[], [leads])

  const filtrados = useMemo(() => {
    let r = leads
    if (ciudad !== 'all') r = r.filter(l => l.ciudad === ciudad)
    if (q.trim()) { const n = q.toLowerCase(); r = r.filter(l => l.nombre.toLowerCase().includes(n)) }
    return r
  }, [leads, ciudad, q])

  const kpis = useMemo(() => ({
    total: filtrados.length,
    litros: Math.round(filtrados.reduce((s, l) => s + (l.litros_potencial ?? 0), 0)),
    conTel: filtrados.filter(l => l.telefono).length,
    ciudades: new Set(filtrados.map(l => l.ciudad)).size,
  }), [filtrados])

  async function marcar(id: number, estado: string) {
    setLeads(prev => prev.map(l => l.id === id ? { ...l, estado } : l))
    try { await fetch('/api/leads', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, estado }) }) } catch {}
  }

  return (
    <div style={{ padding: '20px 16px 60px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>🎯 Posibles clientes (Leads)</h1>
          <p style={{ fontSize: 12, color: 'var(--muted)' }}>Prospectos ordenados por potencial de venta estimado</p>
        </div>
        <button onClick={load} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.3)', color: '#D4AF37', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
          <RefreshCw size={13} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} /> Actualizar
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }} className="kpi-grid-4">
        {[
          { icon: <Target size={16} />, c: '#60A5FA', label: 'Leads', v: kpis.total.toLocaleString('es-CL') },
          { icon: <Droplets size={16} />, c: '#34D399', label: 'Potencial / mes', v: `${kpis.litros.toLocaleString('es-CL')} L` },
          { icon: <MapPin size={16} />, c: '#A78BFA', label: 'Ciudades', v: kpis.ciudades },
          { icon: <Phone size={16} />, c: '#F59E0B', label: 'Con teléfono', v: kpis.conTel.toLocaleString('es-CL') },
        ].map(k => (
          <div key={k.label} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6, color: k.c }}>{k.icon}<span style={{ fontSize: 9, fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{k.label}</span></div>
            <p style={{ fontSize: 24, fontWeight: 900, color: k.c }}>{k.v}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '7px 12px', flex: '1 1 200px' }}>
          <Search size={14} style={{ color: 'var(--muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar lead…" style={{ flex: 1, background: 'transparent', border: 'none', color: 'var(--cream)', fontSize: 13, outline: 'none' }} />
        </div>
        <select value={producto} onChange={e => setProducto(e.target.value)} style={selStyle}>
          {PRODUCTOS.map(p => <option key={p} value={p} style={{ background: 'var(--surface)' }}>{p === 'all' ? 'Todos los productos' : p}</option>)}
        </select>
        <select value={ciudad} onChange={e => setCiudad(e.target.value)} style={selStyle}>
          <option value="all" style={{ background: 'var(--surface)' }}>Todas las ciudades</option>
          {ciudades.map(c => <option key={c} value={c} style={{ background: 'var(--surface)' }}>{c}</option>)}
        </select>
        <button onClick={() => setEnZona(v => !v)} style={{ padding: '8px 14px', borderRadius: 10, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: `1px solid ${enZona ? 'rgba(52,211,153,0.4)' : 'var(--border)'}`, background: enZona ? 'rgba(52,211,153,0.12)' : 'transparent', color: enZona ? '#34D399' : 'var(--muted)' }}>
          {enZona ? '✓ Solo zona de despacho' : 'Todas las zonas'}
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60, color: 'var(--muted)' }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} /></div>
      ) : filtrados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '50px 16px', color: 'var(--muted)' }}>
          <Target size={30} style={{ opacity: 0.3, marginBottom: 10 }} />
          <p style={{ fontSize: 14, fontWeight: 700 }}>Sin leads</p>
          <p style={{ fontSize: 12 }}>Si esperabas datos, corre la importación de leads primero (admin).</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.map(l => {
            const est = ESTADOS[l.estado] ?? ESTADOS.nuevo
            return (
              <div key={l.id} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                {/* Score */}
                <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, background: `${scoreColor(l.score_lead ?? 0)}18`, border: `1.5px solid ${scoreColor(l.score_lead ?? 0)}50`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 16, fontWeight: 900, color: scoreColor(l.score_lead ?? 0), lineHeight: 1 }}>{l.score_lead ?? 0}</span>
                  <span style={{ fontSize: 7, color: 'var(--muted)', textTransform: 'uppercase' }}>score</span>
                </div>
                {/* Info */}
                <div style={{ flex: '1 1 220px', minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>{l.nombre}</span>
                    {l.rating != null && <span style={{ fontSize: 11, color: '#F59E0B', display: 'flex', alignItems: 'center', gap: 2 }}><Star size={11} fill="#F59E0B" /> {l.rating}</span>}
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 8px', borderRadius: 20, background: `${est.color}20`, color: est.color }}>{est.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>{l.categoria ?? l.tipo_buscado}</span>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>· 📍 {l.ciudad}</span>
                    {l.categoria_mapeada && <span style={{ fontSize: 10, color: '#A78BFA' }}>≈ {l.categoria_mapeada}</span>}
                    {l.producto_sugerido && <span style={{ fontSize: 10, color: '#60A5FA' }}>· {l.producto_sugerido}</span>}
                  </div>
                </div>
                {/* Potencial */}
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 17, fontWeight: 900, color: '#34D399' }}>~{l.litros_potencial} L</p>
                  <p style={{ fontSize: 9, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>potencial/mes</p>
                </div>
                {/* Acciones */}
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                  {l.telefono && <button onClick={() => setWaTarget({ nombre: l.nombre, telefono: l.telefono!, contexto: 'mision' })} style={btn('#25D166')}><MessageCircle size={14} color="#25D166" /></button>}
                  {l.telefono && <button onClick={() => window.open(`tel:${l.telefono}`)} style={btn('#60A5FA')}><Phone size={14} color="#60A5FA" /></button>}
                  {l.sitio_web && <button onClick={() => window.open(l.sitio_web!.startsWith('http') ? l.sitio_web! : `https://${l.sitio_web}`, '_blank')} style={btn('#9CA3AF')}><Globe size={14} color="#9CA3AF" /></button>}
                  <select value={l.estado} onChange={e => marcar(l.id, e.target.value)} onClick={e => e.stopPropagation()} style={{ ...selStyle, padding: '6px 8px', fontSize: 11 }}>
                    {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k} style={{ background: 'var(--surface)' }}>{v.label}</option>)}
                  </select>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

const selStyle: React.CSSProperties = {
  background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
  color: 'var(--cream)', fontSize: 12, fontWeight: 600, padding: '8px 10px', cursor: 'pointer', outline: 'none',
}
function btn(color: string): React.CSSProperties {
  return { width: 32, height: 32, borderRadius: '50%', border: `1px solid ${color}40`, background: `${color}12`, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }
}
