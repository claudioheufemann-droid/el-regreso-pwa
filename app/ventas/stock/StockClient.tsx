'use client'

import { useMemo, useState } from 'react'
import { Package, Search, Beer, Layers, Copy, Check, AlertTriangle, CircleAlert } from 'lucide-react'
import type { StockProductoRow } from './page'

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0',
  blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#059669', greenSoft: '#ECFDF5',
  purple: '#7C3AED', purpleSoft: '#F5F3FF',
  amber: '#D97706', amberSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2',
}

// Umbrales de alerta de stock bajo.
// Envases (latas): <100 un. = "poco stock", <24 un. = "revisar stock" (más urgente).
// Barriles: <3 barriles = "revisar stock".
const UMBRAL_ENVASE_BAJO = 100
const UMBRAL_ENVASE_CRITICO = 24
const UMBRAL_BARRIL_CRITICO = 3

type Nivel = 'ok' | 'bajo' | 'critico'

function nivelDe(f: StockProductoRow): Nivel {
  if (f.tipo === 'barril') return f.cantidad < UMBRAL_BARRIL_CRITICO ? 'critico' : 'ok'
  if (f.cantidad < UMBRAL_ENVASE_CRITICO) return 'critico'
  if (f.cantidad < UMBRAL_ENVASE_BAJO) return 'bajo'
  return 'ok'
}

// Mapea codigo_producto (ej. "C-1", "K-4") a la misma imagen de lata usada
// en Producción (app/logistica/produccion/declarar). Solo cubre los productos
// que ya tienen foto subida — el resto cae al emoji de respaldo.
const CODIGO_IMAGENES: Record<string, string> = {
  'C-1':  '/productos/cerveza/arboretum.webp',
  'C-2':  '/productos/cerveza/la-barra.webp',
  'C-4':  '/productos/cerveza/descenso.webp',
  'C-5':  '/productos/cerveza/aguas-blancas.webp',
  'C-8':  '/productos/cerveza/mocho.webp',
  'C-9':  '/productos/cerveza/fisura.webp',
  'K-1':  '/productos/kombucha/natural.webp',
  'K-2':  '/productos/kombucha/lemon-fresh.webp',
  'K-4':  '/productos/kombucha/berry-menta.webp',
  'K-6':  '/productos/kombucha/maqui-hops.webp',
  'K-10': '/productos/kombucha/maracuya-cardamomo.webp',
  'K-11': '/productos/kombucha/mango-merken.webp',
  'K-22': '/productos/kombucha/detox.webp',
}

function ProductoThumb({ codigo, categoria, size = 44 }: { codigo: string | null; categoria: string | null; size?: number }) {
  const src = codigo ? CODIGO_IMAGENES[codigo] : undefined
  const [imgOk, setImgOk] = useState(!!src)
  const emoji = categoria === 'Kombucha' ? '🫧' : '🍺'
  if (src && imgOk) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt="" width={size} height={size}
        onError={() => setImgOk(false)}
        style={{ width: size, height: size, borderRadius: 10, objectFit: 'contain', background: C.bg, flexShrink: 0 }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, flexShrink: 0,
      background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.5,
    }}>
      {emoji}
    </div>
  )
}

const fNum = (n: number) => n.toLocaleString('es-CL')
const fL = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })} L`
function fFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d} ${meses[m - 1]} ${y}`
}

// Texto para compartir: sin cantidades exactas, solo un semáforo de
// disponibilidad, agrupado por categoría (Cerveza/Kombucha) y tipo (Barriles/Envases).
function buildResumenCopiable(filas: StockProductoRow[], fechaInforme: string | null): string {
  const categorias = ['Cerveza', 'Kombucha'] as const
  const tipos = [{ key: 'barril' as const, label: 'Barriles' }, { key: 'envase' as const, label: 'Envases' }]
  let out = `📦 STOCK CÁMARA GENERAL BARRIOS BAJOS`
  if (fechaInforme) out += ` — ${fFecha(fechaInforme)}`
  out += '\n'

  for (const cat of categorias) {
    const deCategoria = filas.filter(f => (f.categoria ?? 'Otros') === cat)
    if (!deCategoria.length) continue
    out += `\n${cat === 'Kombucha' ? '🫧' : '🍺'} ${cat.toUpperCase()}\n`
    for (const t of tipos) {
      const items = deCategoria.filter(f => f.tipo === t.key).sort((a, b) => a.producto.localeCompare(b.producto))
      if (!items.length) continue
      out += `\n${t.label}:\n`
      for (const f of items) {
        const n = nivelDe(f)
        const icon = n === 'critico' ? '🔴' : n === 'bajo' ? '🟡' : '🟢'
        const etiqueta = n === 'critico' ? ' (revisar stock)' : n === 'bajo' ? ' (poco stock)' : ''
        out += `${icon} ${f.producto}${etiqueta}\n`
      }
    }
  }
  return out.trim()
}

function AlertaBadge({ nivel }: { nivel: Nivel }) {
  if (nivel === 'ok') return null
  const critico = nivel === 'critico'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3, marginTop: 4,
      fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
      color: critico ? C.red : C.amber, background: critico ? C.redSoft : C.amberSoft,
    }}>
      {critico ? <CircleAlert size={11} /> : <AlertTriangle size={11} />}
      {critico ? 'Revisar stock' : 'Poco stock'}
    </span>
  )
}

export default function StockClient({ filas, fechaInforme }: { filas: StockProductoRow[]; fechaInforme: string | null }) {
  const [tab, setTab] = useState<'barril' | 'envase'>('barril')
  const [busca, setBusca] = useState('')
  const [copiado, setCopiado] = useState(false)

  const barriles = useMemo(() => filas.filter(f => f.tipo === 'barril'), [filas])
  const envases = useMemo(() => filas.filter(f => f.tipo === 'envase'), [filas])

  const totBarrilesCant = barriles.reduce((s, f) => s + f.cantidad, 0)
  const totBarrilesLitros = barriles.reduce((s, f) => s + (f.litros ?? 0), 0)
  const totEnvasesCant = envases.reduce((s, f) => s + f.cantidad, 0)
  const totAlertas = filas.filter(f => nivelDe(f) !== 'ok').length

  const listaActual = tab === 'barril' ? barriles : envases
  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return listaActual
    return listaActual.filter(f => f.producto.toLowerCase().includes(q) || (f.codigo_producto ?? '').toLowerCase().includes(q))
  }, [listaActual, busca])

  // Agrupado por categoría dentro de la pestaña actual, para que sea más fácil
  // de escanear visualmente que una lista plana larga.
  const grupos = useMemo(() => {
    const cats = ['Cerveza', 'Kombucha', 'Otros'] as const
    return cats
      .map(cat => ({ cat, items: visibles.filter(f => (f.categoria ?? 'Otros') === cat) }))
      .filter(g => g.items.length > 0)
  }, [visibles])

  const maxCant = Math.max(1, ...listaActual.map(f => f.cantidad))

  async function copiarResumen() {
    const texto = buildResumenCopiable(filas, fechaInforme)
    await navigator.clipboard.writeText(texto)
    setCopiado(true)
    setTimeout(() => setCopiado(false), 2000)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>CÁMARA GENERAL BARRIOS BAJOS</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>Stock de productos</h1>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
              {fechaInforme ? `Actualizado ${fFecha(fechaInforme)}` : 'Sin datos cargados todavía'}
            </p>
          </div>
          {filas.length > 0 && (
            <button
              onClick={copiarResumen}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginTop: 2,
                padding: '9px 14px', borderRadius: 12, border: `1px solid ${copiado ? C.green : C.line}`,
                background: copiado ? C.greenSoft : C.card, color: copiado ? C.green : C.text,
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}
            >
              {copiado ? <Check size={14} /> : <Copy size={14} />}
              {copiado ? 'Copiado' : 'Copiar stock'}
            </button>
          )}
        </div>

        {filas.length === 0 ? (
          <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 32, textAlign: 'center' }}>
            <Package size={36} color={C.faint} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Aún no se ha cargado el stock</p>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Un administrador debe subir el informe desde Admin → Stock</p>
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: C.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={15} color={C.amber} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Barriles</span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>{fNum(totBarrilesCant)}</p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{fL(totBarrilesLitros)}</p>
              </div>
              <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Beer size={15} color={C.green} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Envases</span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>{fNum(totEnvasesCant)}</p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>unidades</p>
              </div>
            </div>

            {totAlertas > 0 && (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, background: C.redSoft,
                border: `1px solid ${C.red}33`, borderRadius: 14, padding: '10px 14px', marginBottom: 16,
              }}>
                <CircleAlert size={16} color={C.red} style={{ flexShrink: 0 }} />
                <p style={{ fontSize: 12.5, fontWeight: 600, color: C.red }}>
                  {totAlertas} producto{totAlertas === 1 ? '' : 's'} con poco stock o para revisar
                </p>
              </div>
            )}

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4, marginBottom: 12, width: 'fit-content' }}>
              {(['barril', 'envase'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                    background: tab === t ? C.hero : 'transparent',
                    color: tab === t ? '#fff' : C.muted,
                  }}
                >
                  {t === 'barril' ? `Barriles (${barriles.length})` : `Envases (${envases.length})`}
                </button>
              ))}
            </div>

            {/* Búsqueda */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={15} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar producto o código…"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px', borderRadius: 12,
                  border: `1px solid ${C.line}`, background: C.card, fontSize: 13, color: C.text, outline: 'none',
                }}
              />
            </div>

            {/* Lista, agrupada por categoría */}
            {visibles.length === 0 ? (
              <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 28 }}>Sin coincidencias</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {grupos.map(({ cat, items }) => {
                  const tintCat = cat === 'Kombucha' ? C.green : C.purple
                  return (
                    <div key={cat}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, paddingLeft: 2 }}>
                        <span style={{ fontSize: 15 }}>{cat === 'Kombucha' ? '🫧' : '🍺'}</span>
                        <p style={{ fontSize: 12, fontWeight: 700, color: tintCat, letterSpacing: '0.03em', textTransform: 'uppercase' }}>
                          {cat} <span style={{ color: C.faint, fontWeight: 600 }}>· {items.length}</span>
                        </p>
                      </div>
                      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
                        {items.map((f, i) => {
                          const share = (f.cantidad / maxCant) * 100
                          const nivel = nivelDe(f)
                          const barColor = nivel === 'critico' ? C.red : nivel === 'bajo' ? C.amber : tintCat
                          return (
                            <div key={`${f.producto}-${i}`} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                              <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                                <ProductoThumb codigo={f.codigo_producto} categoria={f.categoria} />
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flex: 1, minWidth: 0 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <p style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{f.producto}</p>
                                    <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{f.codigo_producto ?? '—'}</p>
                                    <AlertaBadge nivel={nivel} />
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <p style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                                      {fNum(f.cantidad)} <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>{f.tipo === 'barril' ? 'barr.' : 'un.'}</span>
                                    </p>
                                    {f.litros != null && <p style={{ fontSize: 11, color: C.muted }}>{fL(f.litros)}</p>}
                                  </div>
                                </div>
                              </div>
                              <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
                                <div style={{ width: `${share}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
