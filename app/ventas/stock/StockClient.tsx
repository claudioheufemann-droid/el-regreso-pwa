'use client'

import { useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package, Search, Beer, Layers, ImageIcon, Download, Share2, X, Loader2, AlertTriangle, CircleAlert, ChevronDown, ChevronLeft, Boxes } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import SettingsPanel from '@/components/ui/SettingsPanel'
import NotificationsBell from '@/components/ui/NotificationsBell'
import type { StockProductoRow } from './page'
import ProductImage from '@/components/ui/ProductImage'
import StockShareImage, { FILTRO_LABEL, type FiltroStock } from './StockShareImage'

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
// Latas: <100 un. = "poco stock", <24 un. = "revisar stock" (más urgente).
// Barriles: <3 barriles = "revisar stock".
const UMBRAL_LATA_BAJO = 100
const UMBRAL_LATA_CRITICO = 24
const UMBRAL_BARRIL_CRITICO = 3

// Cada caja de latas trae 24 unidades.
const UNIDADES_POR_CAJA = 24

type Nivel = 'ok' | 'bajo' | 'critico'

function nivelDe(f: StockProductoRow): Nivel {
  if (f.tipo === 'barril') return f.cantidad < UMBRAL_BARRIL_CRITICO ? 'critico' : 'ok'
  if (f.cantidad < UMBRAL_LATA_CRITICO) return 'critico'
  if (f.cantidad < UMBRAL_LATA_BAJO) return 'bajo'
  return 'ok'
}

function cajasDe(cantidad: number) {
  return { cajas: Math.floor(cantidad / UNIDADES_POR_CAJA), resto: cantidad % UNIDADES_POR_CAJA }
}

function fCajas(cantidad: number): string {
  const { cajas, resto } = cajasDe(cantidad)
  if (cajas === 0) return `${resto} un.`
  if (resto === 0) return `${fNum(cajas)} caja${cajas === 1 ? '' : 's'}`
  return `${fNum(cajas)} caja${cajas === 1 ? '' : 's'} + ${resto} un.`
}

// La foto del producto la resuelve ProductImage (fuente única en
// lib/producto-imagenes.ts). Antes este archivo tenía su propia copia del mapa
// código→imagen y caía a un emoji cuando faltaba la foto.
function ProductoThumb({ nombre, codigo, categoria, tipo, size = 44 }: { nombre?: string | null; codigo: string | null; categoria: string | null; tipo?: 'barril' | 'envase'; size?: number }) {
  return <ProductImage nombre={nombre} codigo={codigo} categoria={categoria} esBarril={tipo === 'barril'} size={size} />
}

const fNum = (n: number) => n.toLocaleString('es-CL')
const fL = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })} L`
function fFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d} ${meses[m - 1]} ${y}`
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

// Días en bodega = hoy - fecha de embarrilado. La fecha se cruza por código
// de lote contra el listado plano del informe (ver lib/stockParser.ts) — no
// todos los lotes tienen match, en ese caso no se muestra el dato.
function diasEnBodega(fechaISO: string): number {
  const [y, m, d] = fechaISO.split('-').map(Number)
  const fecha = new Date(y, m - 1, d)
  const hoy = new Date(); hoy.setHours(0, 0, 0, 0)
  return Math.round((hoy.getTime() - fecha.getTime()) / 86400000)
}

// Detalle de lotes al expandir un producto. Se ordena de mayor a menor
// cantidad (no hay fecha de vencimiento con la cual ordenar por próximo a vencer).
function DetalleLotes({ f }: { f: StockProductoRow }) {
  const lotes = [...(f.lotes ?? [])].sort((a, b) => b.cantidad - a.cantidad)
  if (lotes.length === 0) {
    return <p style={{ fontSize: 12, color: C.muted, padding: '10px 16px 14px' }}>Sin detalle de lotes disponible.</p>
  }
  return (
    <div style={{ padding: '2px 16px 14px' }}>
      <p style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, letterSpacing: '0.04em', marginBottom: 6 }}>
        {lotes.length} LOTE{lotes.length === 1 ? '' : 'S'}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {lotes.map((l, i) => {
          const dias = l.fechaEmbarrilado ? diasEnBodega(l.fechaEmbarrilado) : null
          return (
          <div key={`${l.codigo}-${i}`} style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            background: C.bg, borderRadius: 9, padding: '7px 10px',
          }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: C.text }}>Lote {l.codigo}</span>
              {dias != null ? (() => {
                const [bg, fg] = dias > 90 ? [C.redSoft, C.red] : dias > 30 ? [C.amberSoft, C.amber] : [C.greenSoft, C.green]
                return (
                  <p style={{ marginTop: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: fg, background: bg, borderRadius: 7, padding: '2px 7px', letterSpacing: '-0.2px' }}>
                      {dias} día{dias === 1 ? '' : 's'} en bodega
                    </span>
                  </p>
                )
              })() : (
                <p style={{ fontSize: 11, color: C.faint, marginTop: 1 }}>Sin fecha de embarrilado</p>
              )}
            </div>
            <span style={{ fontSize: 12, color: C.muted, textAlign: 'right', flexShrink: 0 }}>
              {fNum(l.cantidad)} {f.tipo === 'barril' ? 'barr.' : 'un.'}
              {f.tipo === 'envase' && <span style={{ color: C.faint }}> · {fCajas(l.cantidad)}</span>}
            </span>
          </div>
          )
        })}
      </div>
    </div>
  )
}

export default function StockClient({ filas, fechaInforme }: { filas: StockProductoRow[]; fechaInforme: string | null }) {
  const router = useRouter()
  const { user } = useUser()
  const [showSettings, setShowSettings] = useState(false)
  const [tab, setTab] = useState<'barril' | 'envase'>('barril')
  const [busca, setBusca] = useState('')
  const [expandido, setExpandido] = useState<string | null>(null)

  // Imagen compartible del stock (reemplaza el texto plano que copiaba antes:
  // difícil de leer para el cliente). Se renderiza una tarjeta oculta
  // (StockShareImage) fuera de pantalla y se rasteriza con html-to-image.
  const shareCardRef = useRef<HTMLDivElement>(null)
  const [generandoImagen, setGenerandoImagen] = useState(false)
  const [imagenGenerada, setImagenGenerada] = useState<string | null>(null)
  const [errorImagen, setErrorImagen] = useState('')
  const [filtroImagen, setFiltroImagen] = useState<FiltroStock>('todo')
  const [menuCompartirAbierto, setMenuCompartirAbierto] = useState(false)

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

  // Cuántos productos tiene cada una de las 4 combinaciones envase×tipo, para
  // mostrar el conteo en el menú de compartir y deshabilitar las que no
  // tengan nada que mostrar.
  const conteoPorFiltro = useMemo(() => {
    const porCat = (lista: StockProductoRow[], cat: string) => lista.filter(f => (f.categoria ?? 'Otros') === cat).length
    return {
      'barril-cerveza': porCat(barriles, 'Cerveza'),
      'barril-kombucha': porCat(barriles, 'Kombucha'),
      'lata-cerveza': porCat(envases, 'Cerveza'),
      'lata-kombucha': porCat(envases, 'Kombucha'),
    } as Record<Exclude<FiltroStock, 'todo'>, number>
  }, [barriles, envases])

  async function generarImagen(filtro: FiltroStock) {
    setMenuCompartirAbierto(false)
    setGenerandoImagen(true)
    setErrorImagen('')
    setFiltroImagen(filtro)
    try {
      // La tarjeta oculta recién recibe el nuevo `filtro` en el próximo
      // render de React — hay que esperar a que se pinte esa versión antes
      // de rasterizar, si no se captura la sección anterior (o vacía).
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))
      await new Promise(r => setTimeout(r, 60))
      if (!shareCardRef.current) return
      const { toPng } = await import('html-to-image')
      const dataUrl = await toPng(shareCardRef.current, { pixelRatio: 2, backgroundColor: '#FFFFFF' })
      setImagenGenerada(dataUrl)
    } catch {
      setErrorImagen('No se pudo generar la imagen. Intenta de nuevo.')
      setTimeout(() => setErrorImagen(''), 3500)
    } finally {
      setGenerandoImagen(false)
    }
  }

  async function compartirImagen() {
    if (!imagenGenerada) return
    try {
      const res = await fetch(imagenGenerada)
      const blob = await res.blob()
      const file = new File([blob], `stock-el-regreso-${filtroImagen}.png`, { type: 'image/png' })
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Stock disponible — El Regreso Beer' })
        return
      }
    } catch {
      // Si el usuario cancela el share nativo, no hacer nada (no es un error real).
    }
  }

  function descargarImagen() {
    if (!imagenGenerada) return
    const a = document.createElement('a')
    a.href = imagenGenerada
    a.download = `stock-el-regreso-${filtroImagen}-${fechaInforme ?? 'hoy'}.png`
    a.click()
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/ventas')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 100, padding: '7px 14px 7px 10px', marginBottom: 14,
            color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer',
            minHeight: 36,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>

        {/* Título y acciones en filas separadas — antes iban en la misma fila
            con justify-content:space-between; el botón "Compartir stock" con
            la flecha del menú (más ancho que el "Copiar stock" original) no
            entraba junto al resto de íconos en pantallas angostas, y como
            flexShrink:0 nunca cede espacio, todo el aplaste caía sobre el
            título — quedaba partido letra por letra ("CÁMAR/A/GENERA/L…"). */}
        <div style={{ marginBottom: 4 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>CÁMARA GENERAL BARRIOS BAJOS</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>Stock de productos</h1>
          <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
            {fechaInforme ? `Actualizado ${fFecha(fechaInforme)}` : 'Sin informe de stock cargado todavía'}
          </p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {filas.length > 0 && (
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setMenuCompartirAbierto(v => !v)}
                  disabled={generandoImagen}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '9px 14px', borderRadius: 12, border: `1px solid ${C.line}`,
                    background: C.card, color: C.text,
                    fontSize: 12.5, fontWeight: 700, cursor: generandoImagen ? 'default' : 'pointer',
                    opacity: generandoImagen ? 0.6 : 1,
                  }}
                >
                  {generandoImagen ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <ImageIcon size={14} />}
                  {generandoImagen ? 'Generando…' : 'Compartir stock'}
                  {!generandoImagen && <ChevronDown size={13} color={C.faint} />}
                </button>

                {menuCompartirAbierto && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 90 }} onClick={() => setMenuCompartirAbierto(false)} />
                    <div style={{
                      position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100,
                      background: C.card, border: `1px solid ${C.line}`, borderRadius: 14,
                      boxShadow: '0 12px 32px rgba(15,23,42,0.14)', overflow: 'hidden', minWidth: 240,
                    }}>
                      {(['todo', 'barril-cerveza', 'barril-kombucha', 'lata-cerveza', 'lata-kombucha'] as const).map((f, i) => {
                        const cantidad = f === 'todo' ? filas.length : conteoPorFiltro[f]
                        const deshabilitado = cantidad === 0
                        return (
                          <button
                            key={f}
                            onClick={() => !deshabilitado && generarImagen(f)}
                            disabled={deshabilitado}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%',
                              padding: '11px 14px', background: 'transparent',
                              border: 'none', borderTop: i === 0 ? 'none' : `1px solid ${C.line}`,
                              textAlign: 'left', cursor: deshabilitado ? 'default' : 'pointer',
                              opacity: deshabilitado ? 0.4 : 1,
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: f === 'todo' ? 800 : 600, color: C.text }}>{FILTRO_LABEL[f]}</span>
                            <span style={{ fontSize: 11, color: C.muted, fontWeight: 700 }}>{cantidad}</span>
                          </button>
                        )
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
            <NotificationsBell inline variant="light" />
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Cuenta"
              style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${C.line}`, background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 }}
            >
              {user?.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.avatarUrl} alt={user.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (user?.iniciales || '··')}
            </button>
          </div>
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
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Latas</span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>{fNum(totEnvasesCant)}</p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>un. · ≈{fCajas(totEnvasesCant)}</p>
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
                  {t === 'barril' ? `Barriles (${barriles.length})` : `Latas (${envases.length})`}
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
                          const key = `${f.tipo}-${f.producto}`
                          const abierto = expandido === key
                          const share = (f.cantidad / maxCant) * 100
                          const nivel = nivelDe(f)
                          const barColor = nivel === 'critico' ? C.red : nivel === 'bajo' ? C.amber : tintCat
                          return (
                            <div key={key} style={{ borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                              <button
                                onClick={() => setExpandido(abierto ? null : key)}
                                style={{
                                  display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
                                  border: 'none', cursor: 'pointer', padding: '12px 16px', font: 'inherit',
                                }}
                              >
                                <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                                  <ProductoThumb nombre={f.producto} codigo={f.codigo_producto} categoria={f.categoria} tipo={f.tipo} />
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flex: 1, minWidth: 0 }}>
                                    <div style={{ minWidth: 0 }}>
                                      <p style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{f.producto}</p>
                                      <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{f.codigo_producto ?? '—'}</p>
                                      <AlertaBadge nivel={nivel} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 4, flexShrink: 0 }}>
                                      <div style={{ textAlign: 'right' }}>
                                        <p style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                                          {fNum(f.cantidad)} <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>{f.tipo === 'barril' ? 'barr.' : 'un.'}</span>
                                        </p>
                                        {f.litros != null && <p style={{ fontSize: 11, color: C.muted }}>{fL(f.litros)}</p>}
                                        {f.tipo === 'envase' && (
                                          <p style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 3, justifyContent: 'flex-end' }}>
                                            <Boxes size={11} /> {fCajas(f.cantidad)}
                                          </p>
                                        )}
                                      </div>
                                      <ChevronDown
                                        size={16} color={C.faint}
                                        style={{ marginTop: 2, transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
                                  <div style={{ width: `${share}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                                </div>
                              </button>
                              {abierto && (
                                <div style={{ borderTop: `1px solid ${C.line}` }}>
                                  <DetalleLotes f={f} />
                                </div>
                              )}
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

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          userName={user?.nombre ?? ''}
          userEmail={user?.email ?? ''}
          avatarUrl={user?.avatarUrl ?? undefined}
        />
      )}

      {/* Tarjeta oculta: se rasteriza con html-to-image, nunca se ve en pantalla. */}
      <StockShareImage ref={shareCardRef} barriles={barriles} envases={envases} fechaInforme={fechaInforme} filtro={filtroImagen} />

      {errorImagen && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 400,
          background: C.red, color: '#fff', fontSize: 13, fontWeight: 600,
          padding: '10px 18px', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
        }}>
          {errorImagen}
        </div>
      )}

      {/* Vista previa de la imagen generada */}
      {imagenGenerada && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.7)', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={e => { if (e.target === e.currentTarget) setImagenGenerada(null) }}
        >
          <div style={{ background: C.bg, borderRadius: 20, padding: 16, maxWidth: 420, width: '100%', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{FILTRO_LABEL[filtroImagen]} — lista para compartir</p>
              <button onClick={() => setImagenGenerada(null)} aria-label="Cerrar" style={{ background: C.bg, border: `1px solid ${C.line}`, borderRadius: '50%', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: C.muted }}>
                <X size={15} />
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', borderRadius: 12, border: `1px solid ${C.line}`, marginBottom: 14 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imagenGenerada} alt="Stock disponible" style={{ width: '100%', display: 'block' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={descargarImagen} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                <Download size={15} /> Descargar
              </button>
              {typeof navigator !== 'undefined' && 'share' in navigator && (
                <button onClick={compartirImagen} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px 0', borderRadius: 12, border: 'none', background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  <Share2 size={15} /> Compartir
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
