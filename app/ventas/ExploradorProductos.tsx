'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, Search, X, Package, Store, MapPin, User, RotateCcw } from 'lucide-react'
import { Skeleton } from '@/components/ui/States'
import { dspVendedor, vendedorCanonico } from '@/lib/types'
import { regionDeProvincia } from '@/lib/regiones'
import type { PeriodoLigero } from './hoyTypes'

/**
 * Explorador "Productos vendidos" de /ventas (pedido de Claudio, 2026-11-09):
 * por SEMANA (lunes a domingo) o por PERÍODO (24→23), qué productos se
 * vendieron, cuántas unidades, quién los vendió, en qué región y a qué local.
 * También al revés: buscar un cliente y ver qué compró.
 *
 * Un solo pedido al servidor por rango (GET /api/ventas/productos-vendidos,
 * ya agregado a cliente × vendedor × producto × envase); los filtros y el
 * buscador corren en el navegador, así cambiar un filtro es instantáneo.
 *
 * Tema CLARO, igual que el resto de esta pantalla (ver VentasHoyClient).
 */

const C = {
  bg: '#F1F5F9',
  card: '#FFFFFF',
  hero: '#0F172A',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  green: '#059669',
  greenSoft: '#ECFDF5',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  red: '#DC2626',
}

// ── Tipos ────────────────────────────────────────────────────────────────────
interface FilaApi {
  cliente: string
  vendedor: string
  provincia: string | null
  localidad: string | null
  producto: string
  envase: string
  categoria: string
  litros: number
  revenue: number
  unidades: number
  pedidos: number
  ultimaCompra: string | null
}

interface Fila extends FilaApi {
  vend: string
  region: string
  prodKey: string
  prodLabel: string
  esBarril: boolean
  texto: string
}

type Modo = 'semana' | 'periodo'
type Vista = 'productos' | 'clientes'

interface Rango { key: string; label: string; desde: string; hasta: string }

// ── Formato ──────────────────────────────────────────────────────────────────
const fL = (n: number) => `${n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
const fNum = (n: number) => Math.round(n).toLocaleString('es-CL')
const fPeso = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fDia = (iso: string) => { const [, m, d] = iso.split('-').map(Number); return `${d} ${MESES[m - 1]}` }

function sinTildes(s: string) {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** "Lata (473 ml)" → "Lata 473 ml"; "Barril" → "Barril 30 L". */
function envaseCorto(envase: string): string {
  if (/barril/i.test(envase)) return 'Barril 30 L'
  return envase.replace(/[()]/g, '').replace(/\s+/g, ' ').trim()
}

function unidadesTxt(n: number, esBarril: boolean) {
  const r = Math.round(n)
  return `${fNum(r)} ${esBarril ? (r === 1 ? 'barril' : 'barriles') : (r === 1 ? 'lata' : 'latas')}`
}

// ── Semanas (lunes a domingo, hora de Chile) ─────────────────────────────────
const isoUTC = (d: Date) => d.toISOString().slice(0, 10)
function hoyChile(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
}
function semanas(n: number): Rango[] {
  const hoy = new Date(`${hoyChile()}T12:00:00Z`)
  const lunes = new Date(hoy)
  lunes.setUTCDate(hoy.getUTCDate() - ((hoy.getUTCDay() + 6) % 7))
  const out: Rango[] = []
  for (let i = 0; i < n; i++) {
    const ini = new Date(lunes); ini.setUTCDate(lunes.getUTCDate() - 7 * i)
    const fin = new Date(ini); fin.setUTCDate(ini.getUTCDate() + 6)
    const desde = isoUTC(ini), hasta = isoUTC(fin)
    const tramo = `${fDia(desde)} – ${fDia(hasta)}`
    const label = i === 0 ? `Esta semana · ${tramo}` : i === 1 ? `Semana pasada · ${tramo}` : tramo
    out.push({ key: desde, label, desde, hasta })
  }
  return out
}

// ── UI pequeña ───────────────────────────────────────────────────────────────
function Segmento<T extends string>({ valor, opciones, onChange }: {
  valor: T; opciones: { key: T; label: string }[]; onChange: (v: T) => void
}) {
  return (
    <div style={{ display: 'flex', background: C.bg, borderRadius: 10, padding: 3, gap: 3 }}>
      {opciones.map(o => {
        const on = o.key === valor
        return (
          <button key={o.key} onClick={() => onChange(o.key)} style={{
            flex: 1, minHeight: 38, borderRadius: 8, border: 'none', cursor: 'pointer',
            background: on ? C.card : 'transparent', boxShadow: on ? '0 1px 2px rgba(15,23,42,.12)' : 'none',
            fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.text : C.muted,
          }}>{o.label}</button>
        )
      })}
    </div>
  )
}

function Desplegable({ etiqueta, valor, onChange, opciones, todos }: {
  etiqueta: string; valor: string; onChange: (v: string) => void
  opciones: { value: string; label: string }[]; todos: string
}) {
  const activo = valor !== ''
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
      <span style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em' }}>{etiqueta}</span>
      <span style={{ position: 'relative', display: 'block' }}>
        <select
          value={valor}
          onChange={e => onChange(e.target.value)}
          style={{
            width: '100%', minHeight: 42, padding: '9px 30px 9px 11px', borderRadius: 10, appearance: 'none',
            border: `1px solid ${activo ? C.blue : C.line}`, background: activo ? C.blueSoft : C.card,
            fontSize: 13, fontWeight: activo ? 600 : 400, color: C.text, outline: 'none', cursor: 'pointer',
            textOverflow: 'ellipsis',
          }}
        >
          <option value="">{todos}</option>
          {opciones.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <ChevronDown size={14} color={activo ? C.blue : C.faint} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
      </span>
    </label>
  )
}

function Kpi({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ background: C.bg, borderRadius: 10, padding: '9px 11px', minWidth: 0 }}>
      <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em' }}>{label}</p>
      <p style={{ fontSize: 16, fontWeight: 800, color: C.text, letterSpacing: '-0.3px', marginTop: 2, wordBreak: 'break-word' }}>{valor}</p>
    </div>
  )
}

/** Barras horizontales simples para "por región" / "por vendedor". */
function Reparto({ titulo, icono: Icono, items, esBarril }: {
  titulo: string; icono: typeof MapPin
  items: { nombre: string; unidades: number; litros: number }[]; esBarril: boolean
}) {
  const max = Math.max(1, ...items.map(i => i.litros))
  return (
    <div style={{ minWidth: 0 }}>
      <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em', marginBottom: 6 }}>
        <Icono size={11} /> {titulo}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {items.map(i => (
          <div key={i.nombre}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: C.text, fontWeight: 600, minWidth: 0, wordBreak: 'break-word' }}>{i.nombre}</span>
              <span style={{ color: C.muted, whiteSpace: 'nowrap' }}>{unidadesTxt(i.unidades, esBarril)}</span>
            </div>
            <div style={{ height: 5, borderRadius: 3, background: C.line, marginTop: 3, overflow: 'hidden' }}>
              <div style={{ width: `${(i.litros / max) * 100}%`, height: '100%', background: C.blue, borderRadius: 3 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function agrupar<T>(filas: Fila[], clave: (f: Fila) => string, init: (f: Fila) => T, sumar: (acc: T, f: Fila) => void): Map<string, T> {
  const m = new Map<string, T>()
  for (const f of filas) {
    const k = clave(f)
    let acc = m.get(k)
    if (!acc) { acc = init(f); m.set(k, acc) }
    sumar(acc, f)
  }
  return m
}

const PASO = 15

// ── Componente ───────────────────────────────────────────────────────────────
export default function ExploradorProductos({ periodos }: { periodos: PeriodoLigero[] }) {
  const listaSemanas = useMemo(() => semanas(26), [])
  const listaPeriodos = useMemo<Rango[]>(() =>
    [...periodos].sort((a, b) => b.inicio.localeCompare(a.inicio))
      .map(p => ({ key: String(p.id), label: `${p.nombre} · ${fDia(p.inicio)} – ${fDia(p.fin)}`, desde: p.inicio, hasta: p.fin })),
  [periodos])

  const [modo, setModo] = useState<Modo>('semana')
  const [semanaKey, setSemanaKey] = useState(listaSemanas[0].key)
  const [periodoKey, setPeriodoKey] = useState(() => {
    const hoy = hoyChile()
    return (listaPeriodos.find(p => p.desde <= hoy && p.hasta >= hoy) ?? listaPeriodos[0])?.key ?? ''
  })
  const rango = modo === 'semana'
    ? listaSemanas.find(s => s.key === semanaKey) ?? listaSemanas[0]
    : listaPeriodos.find(p => p.key === periodoKey) ?? listaPeriodos[0]

  // Cada rango ya pedido queda guardado: volver a una semana vista es instantáneo.
  const [cargados, setCargados] = useState<Record<string, { porEntrega: boolean; filas: Fila[] }>>({})
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [reintento, setReintento] = useState(0)

  const [busca, setBusca] = useState('')
  const [regionSel, setRegion] = useState('')
  const [vendedorSel, setVendedor] = useState('')
  const [productoSel, setProducto] = useState('')
  const [categoriaSel, setCategoria] = useState('')
  const [vista, setVista] = useState<Vista>('productos')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [visibles, setVisibles] = useState(PASO)

  const desde = rango?.desde ?? ''
  const hasta = rango?.hasta ?? ''
  const claveRango = `${desde}|${hasta}`
  const filas = cargados[claveRango]?.filas ?? null
  const porEntrega = cargados[claveRango]?.porEntrega ?? true
  const error = filas ? null : (errores[claveRango] ?? null)

  // Rangos con un pedido en vuelo: evita pedir dos veces el mismo cuando otro
  // rango termina de cargar y el efecto vuelve a correr.
  const enCurso = useRef(new Set<string>())

  useEffect(() => {
    if (!desde || !hasta || cargados[claveRango] || errores[claveRango]) return
    const k = claveRango
    if (enCurso.current.has(k)) return
    enCurso.current.add(k)
    fetch(`/api/ventas/productos-vendidos?desde=${desde}&hasta=${hasta}`)
      .then(r => r.ok ? r.json() : r.json().then(j => Promise.reject(j.error ?? 'Error')))
      .then((d: { porEntrega: boolean; filas: FilaApi[] }) => {
        const enriquecidas: Fila[] = (d.filas ?? []).map(f => {
          const vend = dspVendedor(vendedorCanonico(f.vendedor))
          const reg = regionDeProvincia(f.provincia) ?? 'Otra región'
          const esBarril = /barril/i.test(f.envase)
          const prodLabel = `${f.producto} · ${envaseCorto(f.envase)}`
          return {
            ...f, vend, region: reg, esBarril, prodLabel,
            prodKey: `${f.producto}||${f.envase}`,
            texto: sinTildes([f.producto, envaseCorto(f.envase), f.cliente, f.localidad ?? '', vend, reg, f.categoria].join(' ')),
          }
        })
        // Se guarda aunque el usuario ya haya cambiado de semana: sirve si vuelve.
        setCargados(prev => ({ ...prev, [k]: { porEntrega: d.porEntrega, filas: enriquecidas } }))
      })
      .catch(e => { setErrores(prev => ({ ...prev, [k]: String(e) })) })
      .finally(() => { enCurso.current.delete(k) })
  }, [desde, hasta, claveRango, cargados, errores, reintento])

  function reintentar() {
    setErrores(prev => { const n = { ...prev }; delete n[claveRango]; return n })
    setReintento(n => n + 1)
  }

  // Opciones de los desplegables: salen del rango completo (no del filtrado),
  // así elegir una región no hace desaparecer las otras del menú.
  const opciones = useMemo(() => {
    const regiones = new Set<string>(), vendedores = new Set<string>(), categorias = new Set<string>()
    const productos = new Map<string, string>()
    for (const f of filas ?? []) {
      regiones.add(f.region); vendedores.add(f.vend); categorias.add(f.categoria)
      productos.set(f.prodKey, f.prodLabel)
    }
    const orden = (a: string, b: string) => a.localeCompare(b, 'es')
    return {
      regiones: [...regiones].sort(orden).map(v => ({ value: v, label: v })),
      vendedores: [...vendedores].sort(orden).map(v => ({ value: v, label: v })),
      categorias: [...categorias].sort(orden).map(v => ({ value: v, label: v })),
      productos: [...productos].sort((a, b) => orden(a[1], b[1])).map(([value, label]) => ({ value, label })),
    }
  }, [filas])

  // Si el rango elegido no trae el valor del filtro (ej. un producto que esa
  // semana no se vendió), el filtro no aplica en vez de dejar la lista vacía.
  const valido = (v: string, ops: { value: string }[]) => (v && ops.some(o => o.value === v) ? v : '')
  const region = valido(regionSel, opciones.regiones)
  const vendedor = valido(vendedorSel, opciones.vendedores)
  const producto = valido(productoSel, opciones.productos)
  const categoria = valido(categoriaSel, opciones.categorias)

  // Al cambiar de rango, filtro o vista se colapsa lo abierto y se vuelve a
  // la primera página de la lista (ajuste durante el render, sin efecto).
  const firma = [claveRango, busca, region, vendedor, producto, categoria, vista].join('¦')
  const [firmaPrev, setFirmaPrev] = useState(firma)
  if (firma !== firmaPrev) {
    setFirmaPrev(firma)
    setAbierto(null)
    setVisibles(PASO)
  }

  const filtradas = useMemo(() => {
    if (!filas) return []
    const tokens = sinTildes(busca.trim()).split(/\s+/).filter(Boolean)
    return filas.filter(f =>
      (!region || f.region === region) &&
      (!vendedor || f.vend === vendedor) &&
      (!producto || f.prodKey === producto) &&
      (!categoria || f.categoria === categoria) &&
      tokens.every(t => f.texto.includes(t)))
  }, [filas, busca, region, vendedor, producto, categoria])

  const totales = useMemo(() => {
    let latas = 0, barriles = 0, litros = 0, revenue = 0
    const clientes = new Set<string>()
    for (const f of filtradas) {
      if (f.esBarril) barriles += f.unidades; else latas += f.unidades
      litros += f.litros; revenue += f.revenue; clientes.add(f.cliente)
    }
    return { latas, barriles, litros, revenue, clientes: clientes.size }
  }, [filtradas])

  const porProducto = useMemo(() => [...agrupar(filtradas, f => f.prodKey,
    f => ({ key: f.prodKey, producto: f.producto, envase: envaseCorto(f.envase), categoria: f.categoria, esBarril: f.esBarril, unidades: 0, litros: 0, revenue: 0, pedidos: 0, filas: [] as Fila[] }),
    (a, f) => { a.unidades += f.unidades; a.litros += f.litros; a.revenue += f.revenue; a.pedidos += f.pedidos; a.filas.push(f) },
  ).values()].sort((a, b) => b.litros - a.litros), [filtradas])

  const porCliente = useMemo(() => [...agrupar(filtradas, f => f.cliente,
    f => ({ key: f.cliente, cliente: f.cliente, localidad: f.localidad, region: f.region, vendedores: new Set<string>(), litros: 0, revenue: 0, ultima: '' as string, filas: [] as Fila[] }),
    (a, f) => {
      a.litros += f.litros; a.revenue += f.revenue; a.vendedores.add(f.vend); a.filas.push(f)
      if (f.ultimaCompra && f.ultimaCompra > a.ultima) a.ultima = f.ultimaCompra
    },
  ).values()].sort((a, b) => b.litros - a.litros), [filtradas])

  const hayFiltros = !!(busca || region || vendedor || producto || categoria)
  function limpiar() { setBusca(''); setRegion(''); setVendedor(''); setProducto(''); setCategoria('') }

  const lista = vista === 'productos' ? porProducto : porCliente

  return (
    <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div>
        <p style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: '0.04em' }}>PRODUCTOS VENDIDOS</p>
        <p style={{ fontSize: 11, color: C.muted, marginTop: 2, lineHeight: 1.45 }}>
          Qué se vendió, quién lo vendió, en qué región y a qué local. Busca un producto (&quot;berry&quot;) o un cliente.
        </p>
      </div>

      {/* Rango: semana o período */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, alignItems: 'end' }}>
        <Segmento<Modo> valor={modo} onChange={setModo}
          opciones={[{ key: 'semana', label: 'Por semana' }, { key: 'periodo', label: 'Por período' }]} />
        <span style={{ position: 'relative', display: 'block' }}>
          <select
            aria-label={modo === 'semana' ? 'Semana' : 'Período'}
            value={modo === 'semana' ? semanaKey : periodoKey}
            onChange={e => modo === 'semana' ? setSemanaKey(e.target.value) : setPeriodoKey(e.target.value)}
            style={{
              width: '100%', minHeight: 44, padding: '10px 32px 10px 12px', borderRadius: 10, appearance: 'none',
              border: `1px solid ${C.line}`, background: C.card, fontSize: 14, fontWeight: 600, color: C.text, outline: 'none', cursor: 'pointer',
            }}
          >
            {(modo === 'semana' ? listaSemanas : listaPeriodos).map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
          <ChevronDown size={15} color={C.faint} style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </span>
      </div>

      {/* Buscador */}
      <div style={{ position: 'relative' }}>
        <Search size={15} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          type="text"
          enterKeyHint="search"
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar producto, cliente o comuna…"
          style={{
            width: '100%', minHeight: 44, padding: '10px 40px 10px 35px', borderRadius: 10,
            border: `1px solid ${busca ? C.blue : C.line}`, background: C.card, fontSize: 14, color: C.text, outline: 'none',
          }}
        />
        {busca && (
          <button onClick={() => setBusca('')} aria-label="Limpiar búsqueda" style={{
            position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40,
            display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', cursor: 'pointer',
          }}><X size={15} color={C.faint} /></button>
        )}
      </div>

      {/* Filtros desplegables */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
        <Desplegable etiqueta="REGIÓN" valor={region} onChange={setRegion} opciones={opciones.regiones} todos="Todas" />
        <Desplegable etiqueta="VENDEDOR" valor={vendedor} onChange={setVendedor} opciones={opciones.vendedores} todos="Todos" />
        <Desplegable etiqueta="CATEGORÍA" valor={categoria} onChange={setCategoria} opciones={opciones.categorias} todos="Todas" />
        <Desplegable etiqueta="PRODUCTO" valor={producto} onChange={setProducto} opciones={opciones.productos} todos="Todos" />
      </div>
      {hayFiltros && (
        <button onClick={limpiar} style={{
          alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, minHeight: 32,
          background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.blue,
        }}><RotateCcw size={12} /> Limpiar filtros</button>
      )}

      {error ? (
        <p style={{ fontSize: 12, color: C.red }}>
          No se pudo cargar: {error}{' '}
          <button onClick={reintentar} style={{ color: C.blue, background: 'none', border: 'none', padding: 0, font: 'inherit', cursor: 'pointer', textDecoration: 'underline' }}>Reintentar</button>
        </p>
      ) : !filas ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Skeleton height={56} radius={10} />
          {[0, 1, 2, 3].map(i => <Skeleton key={i} height={52} radius={10} />)}
        </div>
      ) : (
        <>
          {/* Totales de lo filtrado */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 8 }}>
            <Kpi label="LATAS" valor={fNum(totales.latas)} />
            <Kpi label="BARRILES" valor={fNum(totales.barriles)} />
            <Kpi label="LITROS" valor={fL(totales.litros)} />
            <Kpi label="VENTA NETA" valor={fPeso(totales.revenue)} />
            <Kpi label="LOCALES" valor={fNum(totales.clientes)} />
          </div>
          <p style={{ fontSize: 10.5, color: C.faint, marginTop: -4 }}>
            {fDia(desde)} – {fDia(hasta)} · por fecha de {porEntrega ? 'entrega' : 'pedido'} · neto sin IVA
          </p>

          <Segmento<Vista> valor={vista} onChange={setVista} opciones={[
            { key: 'productos', label: `Productos · ${porProducto.length}` },
            { key: 'clientes', label: `Clientes · ${porCliente.length}` },
          ]} />

          {lista.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '18px 8px' }}>
              <p style={{ fontSize: 13, color: C.muted }}>
                {filas.length === 0 ? 'Sin ventas en este rango todavía.' : 'Nada coincide con estos filtros.'}
              </p>
              {hayFiltros && (
                <button onClick={limpiar} style={{ marginTop: 8, minHeight: 36, padding: '0 14px', borderRadius: 9, border: `1px solid ${C.line}`, background: C.card, fontSize: 12, fontWeight: 600, color: C.blue, cursor: 'pointer' }}>
                  Limpiar filtros
                </button>
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {vista === 'productos'
                ? porProducto.slice(0, visibles).map((p, i) => (
                    <FilaProducto key={p.key} p={p} pos={i} abierto={abierto === p.key}
                      onToggle={() => setAbierto(a => a === p.key ? null : p.key)} />
                  ))
                : porCliente.slice(0, visibles).map(c => (
                    <FilaCliente key={c.key} c={c} abierto={abierto === c.key}
                      onToggle={() => setAbierto(a => a === c.key ? null : c.key)} />
                  ))}
              {lista.length > visibles && (
                <button onClick={() => setVisibles(v => v + PASO)} style={{
                  minHeight: 42, borderRadius: 10, border: `1px dashed ${C.line}`, background: C.card,
                  fontSize: 13, fontWeight: 600, color: C.blue, cursor: 'pointer',
                }}>
                  Ver {Math.min(PASO, lista.length - visibles)} más · quedan {lista.length - visibles}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Filas ────────────────────────────────────────────────────────────────────
function Chevron({ abierto }: { abierto: boolean }) {
  return <ChevronDown size={15} color={abierto ? C.blue : C.faint} style={{
    flexShrink: 0, marginTop: 2, transform: abierto ? 'rotate(180deg)' : undefined, transition: 'transform .15s',
  }} />
}

const btnFila = {
  display: 'flex', alignItems: 'flex-start', gap: 10, width: '100%', textAlign: 'left' as const,
  background: 'transparent', border: 'none', padding: 0, font: 'inherit', color: 'inherit', cursor: 'pointer', minHeight: 40,
}

function colorCategoria(cat: string) {
  return cat === 'Kombucha' ? { fg: C.green, bg: C.greenSoft } : cat === 'Cerveza' ? { fg: C.hero, bg: C.line } : { fg: C.amber, bg: C.amberSoft }
}

function FilaProducto({ p, pos, abierto, onToggle }: {
  p: { key: string; producto: string; envase: string; categoria: string; esBarril: boolean; unidades: number; litros: number; revenue: number; pedidos: number; filas: Fila[] }
  pos: number; abierto: boolean; onToggle: () => void
}) {
  const [verTodos, setVerTodos] = useState(false)
  const col = colorCategoria(p.categoria)

  const detalle = useMemo(() => {
    if (!abierto) return null
    const suma = (clave: (f: Fila) => string) => [...agrupar(p.filas, clave,
      f => ({ nombre: clave(f), unidades: 0, litros: 0 }),
      (a, f) => { a.unidades += f.unidades; a.litros += f.litros },
    ).values()].sort((a, b) => b.litros - a.litros)
    const locales = [...agrupar(p.filas, f => f.cliente,
      f => ({ cliente: f.cliente, localidad: f.localidad, region: f.region, vend: f.vend, unidades: 0, litros: 0, revenue: 0 }),
      (a, f) => { a.unidades += f.unidades; a.litros += f.litros; a.revenue += f.revenue },
    ).values()].sort((a, b) => b.litros - a.litros)
    return { regiones: suma(f => f.region), vendedores: suma(f => f.vend), locales }
  }, [abierto, p.filas])

  return (
    <div style={{ background: C.bg, border: `1px solid ${abierto ? C.blue : C.line}`, borderRadius: 12, padding: '10px 12px' }}>
      <button onClick={onToggle} style={btnFila}>
        <span style={{ width: 22, fontSize: 11, fontWeight: 700, color: C.faint, flexShrink: 0, marginTop: 2 }}>{pos + 1}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{p.producto}</p>
          <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: col.fg, background: col.bg, borderRadius: 5, padding: '1px 6px' }}>{p.categoria}</span>
            <span style={{ fontSize: 11, color: C.muted }}>{p.envase}</span>
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>{unidadesTxt(p.unidades, p.esBarril)}</p>
          <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{fL(p.litros)} · {fPeso(p.revenue)}</p>
        </div>
        <Chevron abierto={abierto} />
      </button>

      {abierto && detalle && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Reparto titulo="POR REGIÓN" icono={MapPin} items={detalle.regiones} esBarril={p.esBarril} />
            <Reparto titulo="POR VENDEDOR" icono={User} items={detalle.vendedores} esBarril={p.esBarril} />
          </div>
          <div>
            <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em', marginBottom: 6 }}>
              <Store size={11} /> LOCALES · {detalle.locales.length} · {fNum(p.pedidos)} {p.pedidos === 1 ? 'pedido' : 'pedidos'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(verTodos ? detalle.locales : detalle.locales.slice(0, 10)).map(l => (
                <div key={l.cliente} style={{ display: 'flex', gap: 8, background: C.card, borderRadius: 9, padding: '8px 10px', border: `1px solid ${C.line}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{l.cliente}</p>
                    <p style={{ fontSize: 10.5, color: C.muted, marginTop: 1 }}>{[l.vend, l.localidad ?? l.region].filter(Boolean).join(' · ')}</p>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <p style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{unidadesTxt(l.unidades, p.esBarril)}</p>
                    <p style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>{fPeso(l.revenue)}</p>
                  </div>
                </div>
              ))}
              {detalle.locales.length > 10 && (
                <button onClick={() => setVerTodos(v => !v)} style={{ minHeight: 36, background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: C.blue }}>
                  {verTodos ? 'Ver menos' : `Ver los ${detalle.locales.length} locales`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function FilaCliente({ c, abierto, onToggle }: {
  c: { key: string; cliente: string; localidad: string | null; region: string; vendedores: Set<string>; litros: number; revenue: number; ultima: string; filas: Fila[] }
  abierto: boolean; onToggle: () => void
}) {
  const productos = useMemo(() => {
    if (!abierto) return []
    return [...agrupar(c.filas, f => f.prodKey,
      f => ({ key: f.prodKey, producto: f.producto, envase: envaseCorto(f.envase), categoria: f.categoria, esBarril: f.esBarril, unidades: 0, litros: 0, revenue: 0 }),
      (a, f) => { a.unidades += f.unidades; a.litros += f.litros; a.revenue += f.revenue },
    ).values()].sort((a, b) => b.litros - a.litros)
  }, [abierto, c.filas])

  return (
    <div style={{ background: C.bg, border: `1px solid ${abierto ? C.blue : C.line}`, borderRadius: 12, padding: '10px 12px' }}>
      <button onClick={onToggle} style={btnFila}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{c.cliente}</p>
          <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
            {[[...c.vendedores].join(', '), c.localidad ?? c.region, c.ultima ? `últ. ${fDia(c.ultima)}` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: C.text, whiteSpace: 'nowrap' }}>{fL(c.litros)}</p>
          <p style={{ fontSize: 11, color: C.muted, whiteSpace: 'nowrap' }}>{fPeso(c.revenue)}</p>
        </div>
        <Chevron abierto={abierto} />
      </button>

      {abierto && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <p style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em' }}>
            <Package size={11} /> QUÉ COMPRÓ · {productos.length}
          </p>
          {productos.map(p => {
            const col = colorCategoria(p.categoria)
            return (
              <div key={p.key} style={{ display: 'flex', gap: 8, background: C.card, borderRadius: 9, padding: '8px 10px', border: `1px solid ${C.line}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 600, color: C.text, lineHeight: 1.3, wordBreak: 'break-word' }}>{p.producto}</p>
                  <p style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: col.fg, background: col.bg, borderRadius: 5, padding: '1px 5px' }}>{p.categoria}</span>
                    <span style={{ fontSize: 10.5, color: C.muted }}>{p.envase}</span>
                  </p>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 12.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap' }}>{unidadesTxt(p.unidades, p.esBarril)}</p>
                  <p style={{ fontSize: 10.5, color: C.muted, whiteSpace: 'nowrap' }}>{fL(p.litros)} · {fPeso(p.revenue)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
