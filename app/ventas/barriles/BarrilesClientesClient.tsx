'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronRight, Layers, ChevronLeft, Search, X, Users, Package,
  MessageCircle, FileDown,
} from 'lucide-react'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { useUser } from '@/lib/userContext'
import NotificationsBell from '@/components/ui/NotificationsBell'
import SettingsPanel from '@/components/ui/SettingsPanel'
import WAModal, { type WATarget } from '@/components/ui/WAModal'

interface Barril {
  id: number
  nombre_fantasia: string
  razon_social: string | null
  codigo: string
  litros: number | null
  lote: string | null
  producto: string | null
  vendedor: string | null
  fecha_entrega: string | null
  direccion: string | null
  localidad: string | null
  direccion_entrega: string | null
  localidad_entrega: string | null
  nro_ruta: string | null
  updated_at: string
}

const MC = {
  bg: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#64748B', faint: '#94A3B8',
  border: '#E2E8F0', blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#059669', greenSoft: '#ECFDF5', amber: '#D97706', amberSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2', whatsapp: '#25D366',
}

type Bucket = 'ok' | '30-89' | '90+'
const BUCKET_LABEL: Record<Bucket, string> = { ok: 'Al día', '30-89': '30–89 días', '90+': '+90 días' }
const BUCKET_COLOR: Record<Bucket, { fg: string; bg: string }> = {
  ok:      { fg: MC.green, bg: MC.greenSoft },
  '30-89': { fg: MC.amber, bg: MC.amberSoft },
  '90+':   { fg: MC.red,   bg: MC.redSoft },
}

function diasAfuera(fecha: string | null): number | null {
  if (!fecha) return null
  return Math.floor((Date.now() - new Date(fecha).getTime()) / 86400000)
}
function bucketDe(dias: number | null): Bucket {
  if (dias === null) return 'ok'
  if (dias >= 90) return '90+'
  if (dias >= 30) return '30-89'
  return 'ok'
}
function fFecha(iso: string): string {
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const d = new Date(iso)
  return `${d.getDate()} ${meses[d.getMonth()]} ${d.getFullYear()}`
}

const AVATAR_PALETTE = [
  { bg: '#FEE2E2', fg: '#DC2626' }, { bg: '#FEF3C7', fg: '#D97706' },
  { bg: '#DBEAFE', fg: '#2563EB' }, { bg: '#D1FAE5', fg: '#059669' },
  { bg: '#EDE9FE', fg: '#7C3AED' }, { bg: '#FCE7F3', fg: '#DB2777' },
]
function avatarColorDe(nombre: string) {
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

interface ClienteBarriles {
  nombre: string; localidad: string | null; vendedor: string | null; barriles: Barril[]
  peorDias: number | null
}

function agruparPorCliente(barriles: Barril[]): ClienteBarriles[] {
  const map = new Map<string, ClienteBarriles>()
  for (const b of barriles) {
    let g = map.get(b.nombre_fantasia)
    if (!g) {
      g = { nombre: b.nombre_fantasia, localidad: b.localidad_entrega || b.localidad, vendedor: b.vendedor, barriles: [], peorDias: null }
      map.set(b.nombre_fantasia, g)
    }
    g.barriles.push(b)
    const d = diasAfuera(b.fecha_entrega)
    if (d !== null && (g.peorDias === null || d > g.peorDias)) g.peorDias = d
  }
  return [...map.values()]
}

function csvEscape(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function exportarCSV(barriles: Barril[]) {
  const headers = ['Cliente', 'Código', 'Producto', 'Litros', 'Lote', 'Vendedor', 'Fecha entrega', 'Días afuera']
  const filas = barriles.map(b => [
    b.nombre_fantasia, b.codigo, b.producto ?? '', b.litros ?? '', b.lote ?? '', b.vendedor ?? '',
    b.fecha_entrega ? fFecha(b.fecha_entrega) : '', diasAfuera(b.fecha_entrega) ?? '',
  ])
  const csv = [headers, ...filas].map(fila => fila.map(csvEscape).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `barriles-clientes-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function ClienteCard({ g, abierto, onToggle, onWA }: {
  g: ClienteBarriles; abierto: boolean; onToggle: () => void; onWA: (t: WATarget) => void
}) {
  const bucket = bucketDe(g.peorDias)
  const avatar = avatarColorDe(g.nombre)
  const bucketColor = BUCKET_COLOR[bucket]
  const primerBarril = g.barriles[0]

  const waTarget: WATarget = {
    nombre: g.nombre, telefono: null, contexto: 'general', subtitulo: g.localidad ?? undefined,
  }

  return (
    <div style={{
      background: MC.card, borderRadius: 16, marginBottom: 10,
      border: `1px solid ${MC.border}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)', overflow: 'hidden',
    }}>
      <button onClick={onToggle} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer', padding: '12px 14px', font: 'inherit' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: avatar.bg, color: avatar.fg, fontSize: 15, fontWeight: 800 }}>
            {g.nombre[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: MC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.nombre}</p>
            <p style={{ fontSize: 11.5, color: MC.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {g.localidad ?? '—'}{g.vendedor ? ` · ${g.vendedor.split(' ')[0]}` : ''}
            </p>
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '4px 9px', borderRadius: 20, flexShrink: 0, color: bucketColor.fg, background: bucketColor.bg }}>
            {g.peorDias !== null ? `${g.peorDias}d` : BUCKET_LABEL[bucket]}
          </span>
          <ChevronRight size={16} color={MC.faint} style={{ flexShrink: 0, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <Layers size={14} color={MC.muted} />
          <p style={{ fontSize: 13, fontWeight: 700, color: MC.text }}>
            {g.barriles.length} barril{g.barriles.length === 1 ? '' : 'es'}
          </p>
          {!abierto && (
            <p style={{ fontSize: 11.5, color: MC.faint, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {primerBarril.producto}{g.barriles.length > 1 ? ` +${g.barriles.length - 1} más` : ''}
            </p>
          )}
        </div>
      </button>

      {abierto && (
        <div style={{ borderTop: `1px solid ${MC.border}`, padding: '10px 14px 14px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
            {g.barriles.map(b => {
              const dias = diasAfuera(b.fecha_entrega)
              const bb = BUCKET_COLOR[bucketDe(dias)]
              return (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: MC.bg, borderRadius: 10, padding: '8px 10px' }}>
                  <Package size={13} color={MC.muted} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: MC.text }}>
                      {b.producto ?? 'Producto sin especificar'} <span style={{ fontWeight: 500, color: MC.faint }}>· {b.litros ?? '—'}L</span>
                    </p>
                    <p style={{ fontSize: 11, color: MC.muted, marginTop: 1 }}>
                      Código {b.codigo}{b.lote ? ` · Lote ${b.lote}` : ''} · {b.fecha_entrega ? fFecha(b.fecha_entrega) : 'sin fecha'}
                    </p>
                  </div>
                  <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 20, flexShrink: 0, color: bb.fg, background: bb.bg }}>
                    {dias !== null ? `${dias}d` : '—'}
                  </span>
                </div>
              )
            })}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={e => { e.stopPropagation(); onWA(waTarget) }}
              style={{ flex: 1, minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: MC.greenSoft, border: `1px solid rgba(5,150,105,0.25)`, borderRadius: 10, color: MC.whatsapp, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <MessageCircle size={14} /> WhatsApp
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function BarrilesClientesClient({ initialBarriles, isAdmin }: { initialBarriles: Barril[]; isAdmin: boolean }) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { user } = useUser()
  const [showSettings, setShowSettings] = useState(false)
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
  const [searchText, setSearchText] = useState('')
  const [filterBucket, setFilterBucket] = useState<Bucket | 'todos'>('todos')
  const [sortBy, setSortBy] = useState<'antiguo' | 'nombre'>('antiguo')
  const [expanded, setExpanded] = useState<string | null>(null)

  const clientes = useMemo(() => agruparPorCliente(initialBarriles), [initialBarriles])

  const bucketCounts = useMemo(() => {
    const counts: Record<Bucket, number> = { ok: 0, '30-89': 0, '90+': 0 }
    for (const g of clientes) counts[bucketDe(g.peorDias)]++
    return counts
  }, [clientes])

  const filtrados = useMemo(() => {
    let res = clientes.filter(g => {
      if (filterBucket !== 'todos' && bucketDe(g.peorDias) !== filterBucket) return false
      if (searchText && !g.nombre.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
    res = [...res].sort((a, b) => sortBy === 'nombre' ? a.nombre.localeCompare(b.nombre) : (b.peorDias ?? -1) - (a.peorDias ?? -1))
    return res
  }, [clientes, searchText, filterBucket, sortBy])

  const selectStyle: React.CSSProperties = {
    padding: '9px 30px 9px 12px', borderRadius: 10, border: `1px solid ${MC.border}`,
    background: MC.card, color: MC.text, fontSize: 12.5, fontWeight: 600, outline: 'none', appearance: 'none',
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748B\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  }

  if (isDesktop) return <BarrilesTablaDesktop initialBarriles={initialBarriles} isAdmin={isAdmin} />

  return (
    <div style={{ minHeight: '100vh', background: MC.bg, paddingBottom: 'max(120px, calc(env(safe-area-inset-bottom, 0px) + 100px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button onClick={() => router.push('/ventas')} aria-label="Volver"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: MC.card, border: `1px solid ${MC.border}`, borderRadius: 100, padding: '7px 14px 7px 10px', marginBottom: 14, color: MC.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 36 }}>
          <ChevronLeft size={17} strokeWidth={2.5} color={MC.blue} /> Volver
        </button>

        <div style={{ marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: MC.text, letterSpacing: '-0.5px' }}>Barriles en clientes</h1>
          <p style={{ fontSize: 12.5, color: MC.faint, marginTop: 2 }}>
            {isAdmin ? 'Barriles sin devolver de toda la cartera.' : 'Barriles sin devolver de tus clientes asignados.'}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
          <NotificationsBell inline variant="light" />
          <button onClick={() => setShowSettings(true)} aria-label="Cuenta"
            style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${MC.border}`, background: MC.text, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 }}>
            {user?.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={user.avatarUrl} alt={user.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : (user?.iniciales || '··')}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
          <div style={{ background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: MC.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Layers size={15} color={MC.blue} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: MC.muted }}>Total barriles</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: MC.text, letterSpacing: '-0.5px' }}>{initialBarriles.length}</p>
          </div>
          <div style={{ background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: MC.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={15} color={MC.amber} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: MC.muted }}>Clientes</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: MC.text, letterSpacing: '-0.5px' }}>{clientes.length}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {([
            { key: 'todos' as const, label: 'Todos', count: clientes.length, color: MC.blue },
            { key: 'ok' as const, label: 'Al día', count: bucketCounts.ok, color: MC.green },
            { key: '30-89' as const, label: '30–89 días', count: bucketCounts['30-89'], color: MC.amber },
            { key: '90+' as const, label: '+90 días', count: bucketCounts['90+'], color: MC.red },
          ]).map(f => {
            const active = filterBucket === f.key
            return (
              <button key={f.key} onClick={() => setFilterBucket(f.key)}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 12, cursor: 'pointer',
                  border: `1px solid ${active ? f.color : MC.border}`, background: active ? f.color : MC.card, color: active ? '#FFFFFF' : MC.text,
                  fontSize: 13, fontWeight: active ? 800 : 600 }}>
                {f.label}
                <span style={{ fontSize: 12, fontWeight: 800, padding: '0 6px', borderRadius: 8, background: active ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.06)', color: active ? '#FFFFFF' : MC.muted }}>
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>

        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={15} color={MC.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Buscar cliente…"
            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 12, border: `1px solid ${MC.border}`, background: MC.card, fontSize: 13, color: MC.text, outline: 'none' }} />
          {searchText && <button onClick={() => setSearchText('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MC.faint }}><X size={14} /></button>}
        </div>

        <div style={{ marginBottom: 12 }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={selectStyle}>
            <option value="antiguo">Más días afuera primero</option>
            <option value="nombre">Nombre (A–Z)</option>
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <p style={{ fontSize: 13, fontWeight: 700, color: MC.text }}>{filtrados.length} cliente{filtrados.length === 1 ? '' : 's'}</p>
          {filtrados.length > 0 && (
            <button onClick={() => exportarCSV(filtrados.flatMap(g => g.barriles))}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: MC.blue, fontSize: 12.5, fontWeight: 700 }}>
              <FileDown size={14} /> Exportar
            </button>
          )}
        </div>

        {filtrados.length === 0 ? (
          <div style={{ background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`, padding: '40px 20px', textAlign: 'center' }}>
            <Layers size={32} color={MC.faint} style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13, color: MC.muted }}>
              {initialBarriles.length === 0
                ? (isAdmin ? 'Todavía no hay barriles cargados.' : 'Ninguno de tus clientes tiene barriles sin devolver.')
                : 'Sin resultados para este filtro'}
            </p>
          </div>
        ) : (
          filtrados.map(g => (
            <ClienteCard key={g.nombre} g={g} abierto={expanded === g.nombre} onToggle={() => setExpanded(expanded === g.nombre ? null : g.nombre)} onWA={setWaTarget} />
          ))
        )}
      </div>

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} userName={user?.nombre ?? ''} userEmail={user?.email ?? ''} avatarUrl={user?.avatarUrl ?? undefined} />
      )}
      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
    </div>
  )
}

// ── Tabla de escritorio (tema oscuro existente) ───────────────────────────────
function BarrilesTablaDesktop({ initialBarriles, isAdmin }: { initialBarriles: Barril[]; isAdmin: boolean }) {
  const [searchText, setSearchText] = useState('')
  const [filterVendedor, setFilterVendedor] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  const clientes = useMemo(() => agruparPorCliente(initialBarriles), [initialBarriles])
  const vendedores = Array.from(new Set(initialBarriles.map(b => b.vendedor).filter((v): v is string => !!v)))

  const filtrados = clientes.filter(g => {
    if (isAdmin && filterVendedor && g.vendedor !== filterVendedor) return false
    if (searchText && !g.nombre.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  }).sort((a, b) => (b.peorDias ?? -1) - (a.peorDias ?? -1))

  const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 12px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--cream)', fontSize: 13, outline: 'none' }
  const selectStyle: React.CSSProperties = {
    ...inputStyle, appearance: 'none',
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23888\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: 32,
  }

  return (
    <div style={{ padding: '24px 20px 60px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Layers size={22} style={{ color: 'var(--gold)' }} />
        <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>Barriles en clientes</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
        {isAdmin ? 'Barriles sin devolver de toda la cartera.' : 'Barriles sin devolver de tus clientes asignados.'}
      </p>

      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 12, marginBottom: 20, maxWidth: 480 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3px solid #60a5fa', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>Total Barriles</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: '#60a5fa' }}>{initialBarriles.length}</p>
        </div>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderTop: '3px solid var(--gold)', borderRadius: 12, padding: '16px 20px' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>Clientes</p>
          <p style={{ fontSize: 22, fontWeight: 900, color: 'var(--gold)' }}>{clientes.length}</p>
        </div>
      </div>

      <div className="grid-stack-mobile" style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 20px', marginBottom: 16, display: 'grid', gridTemplateColumns: isAdmin ? 'repeat(2,1fr)' : '1fr', gap: 12 }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>BUSCAR</label>
          <input type="text" value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Nombre cliente..." style={inputStyle} />
        </div>
        {isAdmin && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>VENDEDOR</label>
            <select value={filterVendedor} onChange={e => setFilterVendedor(e.target.value)} style={selectStyle}>
              <option value="">Todos</option>
              {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
        {filtrados.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              {initialBarriles.length === 0 ? (isAdmin ? 'Todavía no hay barriles cargados.' : 'Ninguno de tus clientes tiene barriles sin devolver.') : 'No hay resultados para los filtros'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[...(isAdmin ? ['Cliente', 'Vendedor'] : ['Cliente']), 'Barriles', 'Más antiguo', ''].map(h => (
                    <th key={h} style={{ padding: '10px 14px', textAlign: h === 'Barriles' ? 'right' : 'left', fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtrados.map(g => (
                  <>
                    <tr key={g.nombre} onClick={() => setExpandedRow(expandedRow === g.nombre ? null : g.nombre)}
                      style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', background: expandedRow === g.nombre ? 'rgba(212,175,55,0.04)' : 'transparent' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--cream)' }}>{g.nombre}</td>
                      {isAdmin && <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{g.vendedor || '—'}</td>}
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#60a5fa' }}>{g.barriles.length}</td>
                      <td style={{ padding: '11px 14px', color: (g.peorDias ?? 0) >= 90 ? '#f87171' : (g.peorDias ?? 0) >= 30 ? '#D4AF37' : 'var(--muted)', fontWeight: 700 }}>
                        {g.peorDias !== null ? `${g.peorDias} días` : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center', color: 'var(--muted)' }}>{expandedRow === g.nombre ? '▲' : '▼'}</td>
                    </tr>
                    {expandedRow === g.nombre && (
                      <tr key={`${g.nombre}-detail`}>
                        <td colSpan={isAdmin ? 5 : 4} style={{ padding: '14px 24px', background: 'rgba(212,175,55,0.03)', borderBottom: '1px solid var(--border)', borderLeft: '3px solid var(--gold)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {g.barriles.map(b => {
                              const dias = diasAfuera(b.fecha_entrega)
                              return (
                                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                                  <span style={{ color: 'var(--cream)' }}>{b.producto ?? '—'} · {b.litros ?? '—'}L · Código {b.codigo}{b.lote ? ` · Lote ${b.lote}` : ''}</span>
                                  <span>{b.fecha_entrega ? fFecha(b.fecha_entrega) : '—'} · <strong style={{ color: (dias ?? 0) >= 90 ? '#f87171' : 'var(--cream)' }}>{dias !== null ? `${dias}d` : '—'}</strong></span>
                                </div>
                              )
                            })}
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
    </div>
  )
}
