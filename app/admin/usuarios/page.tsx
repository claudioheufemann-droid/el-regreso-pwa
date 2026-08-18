'use client'

import { useState, useEffect } from 'react'
import Logo from '@/components/ui/Logo'

interface AppUser {
  id: string
  nombre: string
  iniciales: string
  email: string
  rol: string
  area: string
  macro_area: string | null
  is_admin: boolean
  telefono: string | null
  avatar_url: string | null
  created_at: string
  last_sign_in_at: string | null
  email_confirmed: boolean
  vehiculo_propio: boolean | null
  vehiculo_tipo: string | null
  rendimiento_kml: number | null
  tarifa_reembolso_km: number | null
}

const VEHICULO_TIPOS = ['auto', 'moto', 'camioneta', 'furgón'] as const

function VehiculoModal({ user, onClose, onSaved }: { user: AppUser; onClose: () => void; onSaved: (u: AppUser) => void }) {
  const [vehiculoPropio, setVehiculoPropio] = useState(user.vehiculo_propio ?? true)
  const [tipo, setTipo] = useState(user.vehiculo_tipo ?? '')
  const [rendimiento, setRendimiento] = useState(user.rendimiento_kml != null ? String(user.rendimiento_kml) : '')
  const [tarifa, setTarifa] = useState(user.tarifa_reembolso_km != null ? String(user.tarifa_reembolso_km) : '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function guardar() {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/admin/usuarios', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: user.id,
          vehiculo_propio: vehiculoPropio,
          vehiculo_tipo: tipo || null,
          rendimiento_kml: rendimiento ? parseFloat(rendimiento) : null,
          tarifa_reembolso_km: tarifa ? parseFloat(tarifa) : null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Error al guardar'); return }
      onSaved({ ...user, ...data })
      onClose()
    } catch {
      setError('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.03)', color: '#F4EEDF', fontSize: 13, outline: 'none',
  }
  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5,
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 24, maxWidth: 420, width: '100%', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h2 style={{ fontSize: 15, fontWeight: 900, color: '#F4EEDF', marginBottom: 2 }}>Vehículo y reembolso</h2>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{user.nombre}</p>
        </div>

        <button
          onClick={() => setVehiculoPropio(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${vehiculoPropio ? 'rgba(212,175,55,0.35)' : 'rgba(255,255,255,0.1)'}`,
            background: vehiculoPropio ? 'rgba(212,175,55,0.08)' : 'rgba(255,255,255,0.03)',
          }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: vehiculoPropio ? '#D4AF37' : 'rgba(255,255,255,0.5)' }}>Usa vehículo propio</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: vehiculoPropio ? '#D4AF37' : 'rgba(255,255,255,0.3)' }}>{vehiculoPropio ? 'SÍ' : 'NO'}</span>
        </button>

        <div>
          <label style={labelStyle}>Tipo de vehículo</label>
          <select value={tipo} onChange={e => setTipo(e.target.value)} style={{ ...inputStyle, colorScheme: 'dark' }}>
            <option value="">Sin especificar</option>
            {VEHICULO_TIPOS.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Rendimiento (km/l)</label>
            <input type="number" min={0} step={0.1} value={rendimiento} onChange={e => setRendimiento(e.target.value)} placeholder="Ej: 12" style={inputStyle} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={labelStyle}>Tarifa reembolso ($/km)</label>
            <input type="number" min={0} value={tarifa} onChange={e => setTarifa(e.target.value)} placeholder="Ej: 150" style={inputStyle} />
          </div>
        </div>

        {error && <p style={{ fontSize: 12, color: '#FF6666' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={guardar} disabled={saving}
            style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: '#D4AF37', color: '#0A0A0A', fontSize: 13, fontWeight: 900, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button onClick={onClose}
            style={{ padding: '11px 16px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 12, cursor: 'pointer' }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  )
}

const AREA_COLOR: Record<string, string> = {
  comercial:      '#E67E22',
  administracion: '#5B8AA8',
  produccion:     '#22C55E',
}

function timeAgo(iso: string | null): string {
  if (!iso) return 'Nunca'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60)  return `Hace ${mins}m`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `Hace ${hrs}h`
  const days = Math.floor(hrs / 24)
  if (days === 1) return 'Ayer'
  if (days < 7)   return `Hace ${days} días`
  if (days < 30)  return `Hace ${Math.floor(days/7)} sem`
  return `Hace ${Math.floor(days/30)} mes${Math.floor(days/30) > 1 ? 'es' : ''}`
}

function activityColor(iso: string | null): string {
  if (!iso) return '#FF4444'
  const days = (Date.now() - new Date(iso).getTime()) / 86400000
  if (days < 1)  return '#22C55E'
  if (days < 7)  return '#D4AF37'
  if (days < 30) return '#E67E22'
  return '#FF4444'
}

function Avatar({ u }: { u: AppUser }) {
  const bg = u.macro_area ? AREA_COLOR[u.macro_area] ?? '#888' : '#555'
  return (
    <div style={{
      width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
      background: u.avatar_url ? 'transparent' : `${bg}22`,
      border: `2px solid ${bg}50`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 12, fontWeight: 800, color: bg, overflow: 'hidden',
    }}>
      {u.avatar_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={u.avatar_url} alt={u.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : u.iniciales}
    </div>
  )
}

export default function UsuariosAdminPage() {
  const [users, setUsers]       = useState<AppUser[]>([])
  const [loading, setLoading]   = useState(true)
  const [filter, setFilter]     = useState<'todos' | 'comercial' | 'administracion' | 'produccion' | 'logistica' | 'sin-area'>('todos')
  const [search, setSearch]     = useState('')
  const [sortBy, setSortBy]     = useState<'nombre' | 'actividad'>('actividad')
  const [syncing, setSyncing]   = useState(false)
  const [syncMsg, setSyncMsg]   = useState('')
  const [editando, setEditando] = useState<AppUser | null>(null)

  function loadUsers() {
    setLoading(true)
    fetch('/api/admin/usuarios')
      .then(r => r.json())
      .then(data => { setUsers(Array.isArray(data) ? data : []); setLoading(false) })
      .catch(() => setLoading(false))
  }

  useEffect(() => { loadUsers() }, [])

  async function syncAvatars() {
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/admin/sync-avatars')
      const data = await res.json()
      setSyncMsg(`✓ ${data.sincronizados} fotos sincronizadas de ${data.total} usuarios`)
      loadUsers() // recargar para mostrar fotos nuevas
    } catch { setSyncMsg('Error al sincronizar') }
    setSyncing(false)
  }

  const filtered = users
    .filter(u => {
      if (filter === 'sin-area') return !u.macro_area
      if (filter !== 'todos') return u.macro_area === filter
      return true
    })
    .filter(u => {
      if (!search.trim()) return true
      const q = search.toLowerCase()
      return u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      if (sortBy === 'nombre') return a.nombre.localeCompare(b.nombre)
      // por actividad: los más recientes primero, nunca = al final
      const ta = a.last_sign_in_at ? new Date(a.last_sign_in_at).getTime() : 0
      const tb = b.last_sign_in_at ? new Date(b.last_sign_in_at).getTime() : 0
      return tb - ta
    })

  const stats = {
    total:    users.length,
    activos:  users.filter(u => u.last_sign_in_at && (Date.now() - new Date(u.last_sign_in_at).getTime()) < 7 * 86400000).length,
    hoy:      users.filter(u => u.last_sign_in_at && (Date.now() - new Date(u.last_sign_in_at).getTime()) < 86400000).length,
    sinAcceso:users.filter(u => !u.last_sign_in_at).length,
  }

  return (
    <div style={{ minHeight: '100vh', background: '#07070D', color: '#F4EEDF' }}>

      {/* Top nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 28px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(15,15,24,0.95)', backdropFilter: 'blur(10px)', position: 'sticky', top: 0, zIndex: 10 }}>
        <Logo size={28} />
        <a href="/gestion" style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m12 19-7-7 7-7"/><path d="M19 12H5"/></svg>
          Volver
        </a>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Panel de Usuarios</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>Administración · El Regreso</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/admin/jornadas" style={{ fontSize: 11, color: '#D4AF37', textDecoration: 'none' }}>Kilometraje →</a>
          {syncMsg && <span style={{ fontSize: 11, color: syncMsg.startsWith('✓') ? '#22C55E' : '#FF6666' }}>{syncMsg}</span>}
          <button onClick={syncAvatars} disabled={syncing}
            style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid rgba(91,138,168,0.35)', background: 'rgba(91,138,168,0.1)', color: '#5B8AA8', fontSize: 11, fontWeight: 700, cursor: syncing ? 'default' : 'pointer', opacity: syncing ? 0.6 : 1, whiteSpace: 'nowrap' }}>
            {syncing ? '⏳ Sincronizando...' : '🔄 Sincronizar fotos'}
          </button>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', padding: '4px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
            ★ Solo admins
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1500, margin: '0 auto', padding: '32px 24px' }}>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
          {[
            { label: 'Usuarios registrados', value: stats.total,     color: '#5B8AA8', icon: '👥' },
            { label: 'Activos esta semana',  value: stats.activos,   color: '#22C55E', icon: '✅' },
            { label: 'Activos hoy',          value: stats.hoy,       color: '#D4AF37', icon: '🟢' },
            { label: 'Sin acceso aún',       value: stats.sinAcceso, color: '#FF6666', icon: '⚠️' },
          ].map(k => (
            <div key={k.label} style={{ background: `${k.color}08`, border: `1px solid ${k.color}22`, borderRadius: 16, padding: '18px 20px' }}>
              <div style={{ fontSize: 20, marginBottom: 8 }}>{k.icon}</div>
              <div style={{ fontSize: 32, fontWeight: 900, color: k.color, lineHeight: 1, marginBottom: 4 }}>{k.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.8 }}>{k.label}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Búsqueda */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', borderRadius: 10, padding: '8px 14px', flex: 1, minWidth: 180 }}>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)' }}>🔍</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar usuario..."
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: 13, color: '#F4EEDF', width: '100%' }} />
          </div>

          {/* Filtro área */}
          <div style={{ display: 'flex', gap: 6 }}>
            {([
              { key: 'todos',         label: 'Todos',         color: '#888' },
              { key: 'comercial',     label: 'Comercial',     color: '#E67E22' },
              { key: 'administracion',label: 'Administración',color: '#5B8AA8' },
              { key: 'produccion',    label: 'Producción',    color: '#22C55E' },
              { key: 'logistica',     label: 'Logística',     color: '#F97316' },
              { key: 'sin-area',      label: 'Sin área',      color: '#666' },
            ] as { key: typeof filter; label: string; color: string }[]).map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${filter === f.key ? f.color+'60' : 'rgba(255,255,255,0.08)'}`, background: filter === f.key ? `${f.color}15` : 'transparent', fontSize: 11, color: filter === f.key ? f.color : 'rgba(255,255,255,0.4)', cursor: 'pointer', fontWeight: filter === f.key ? 700 : 500, whiteSpace: 'nowrap' }}>
                {f.label}
              </button>
            ))}
          </div>

          {/* Sort */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
            style={{ padding: '8px 12px', borderRadius: 9, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.09)', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>
            <option value="actividad">Ordenar: Más activos</option>
            <option value="nombre">Ordenar: Nombre</option>
          </select>
        </div>

        {/* Tabla de usuarios */}
        <div style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>

          {/* Header tabla */}
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '10px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.02)' }}>
            {['USUARIO', 'CONTACTO', 'ÁREA', 'ROL', 'ÚLTIMO ACCESO', 'ESTADO', 'VEHÍCULO'].map(h => (
              <div key={h} style={{ fontSize: 8, fontWeight: 800, color: 'rgba(255,255,255,0.25)', letterSpacing: 1.4, textTransform: 'uppercase' }}>{h}</div>
            ))}
          </div>

          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              Cargando usuarios...
            </div>
          )}

          {!loading && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>
              Sin usuarios que coincidan
            </div>
          )}

          {filtered.map((u, idx) => {
            const aColor = u.macro_area ? AREA_COLOR[u.macro_area] ?? '#888' : '#555'
            const lastColor = activityColor(u.last_sign_in_at)
            const isActive = u.last_sign_in_at && (Date.now() - new Date(u.last_sign_in_at).getTime()) < 86400000
            return (
              <div key={u.id}
                style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr 1fr 1fr 1fr', gap: 8, padding: '14px 20px', borderBottom: idx < filtered.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none', alignItems: 'center', transition: 'background 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>

                {/* USUARIO */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar u={u} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#F4EEDF', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                      {u.nombre}
                      {u.is_admin && <span style={{ fontSize: 8, color: '#D4AF37', background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.25)', borderRadius: 6, padding: '1px 5px', fontWeight: 800 }}>ADMIN</span>}
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 }}>{u.email}</div>
                  </div>
                </div>

                {/* CONTACTO */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {u.telefono ? (
                    <a href={`https://wa.me/${u.telefono.replace('+', '')}`} target="_blank" rel="noopener noreferrer"
                      style={{ display: 'flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}>
                      <div style={{ width: 22, height: 22, borderRadius: 6, background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, flexShrink: 0 }}>💬</div>
                      <span style={{ fontSize: 11, color: '#25D166', fontWeight: 600 }}>{u.telefono}</span>
                    </a>
                  ) : (
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Sin teléfono</span>
                  )}
                </div>

                {/* ÁREA */}
                <div>
                  {u.macro_area ? (
                    <div style={{ padding: '3px 9px', borderRadius: 8, background: `${aColor}12`, border: `1px solid ${aColor}28`, fontSize: 9, fontWeight: 700, color: aColor, textTransform: 'uppercase', letterSpacing: 0.8, display: 'inline-block' }}>
                      {u.macro_area}
                    </div>
                  ) : (
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>
                  )}
                </div>

                {/* ROL */}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {u.rol || '—'}
                </div>

                {/* ÚLTIMO ACCESO */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 700, color: lastColor }}>{timeAgo(u.last_sign_in_at)}</div>
                  {u.last_sign_in_at && (
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>
                      {new Date(u.last_sign_in_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                    </div>
                  )}
                </div>

                {/* ESTADO */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: isActive ? '#22C55E' : u.last_sign_in_at ? '#E67E22' : '#FF4444', flexShrink: 0 }} />
                  <span style={{ fontSize: 10, color: isActive ? '#22C55E' : u.last_sign_in_at ? '#E67E22' : '#FF4444', fontWeight: 600 }}>
                    {isActive ? 'Activo hoy' : u.last_sign_in_at ? 'Inactivo' : 'Sin acceso'}
                  </span>
                </div>

                {/* VEHÍCULO */}
                <div>
                  <button onClick={() => setEditando(u)}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '5px 9px', borderRadius: 8, border: '1px solid rgba(212,175,55,0.25)', background: 'rgba(212,175,55,0.06)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: '#D4AF37' }}>
                      {u.tarifa_reembolso_km ? `$${u.tarifa_reembolso_km}/km` : 'Configurar'}
                    </span>
                    {u.vehiculo_tipo && (
                      <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', textTransform: 'capitalize' }}>{u.vehiculo_tipo}</span>
                    )}
                  </button>
                </div>
              </div>
            )
          })}
        </div>

        {editando && (
          <VehiculoModal
            user={editando}
            onClose={() => setEditando(null)}
            onSaved={u => setUsers(prev => prev.map(p => p.id === u.id ? u : p))}
          />
        )}

        <div style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.2)', textAlign: 'center' }}>
          {filtered.length} de {users.length} usuarios · Actualizado al cargar la página
        </div>
      </div>
    </div>
  )
}
