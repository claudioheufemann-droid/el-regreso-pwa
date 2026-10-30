'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Search, X, Download, ChevronDown, ChevronLeft, MapPin, ExternalLink, RotateCw } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import {
  ACTIVO_DIAS, CARTERAS, CARTERA_OTROS, infoCartera,
  type CarteraKey, type ClienteCartera, type DetalleCliente, type EstadoCliente,
} from './carteraTipos'

interface Props {
  clientes: ClienteCartera[]
  carterasVisibles: CarteraKey[]
  hoyISO: string
}

type FiltroEstado = 'activo' | 'inactivo' | 'todos'
type Orden = 'reciente' | 'historico' | 'ultimo_anio' | 'nombre'

// ── Paleta clara — pedido de Claudio (30-oct-2026): esta pantalla con fondo
// blanco. Mismos valores que Ventas > Hoy (const C de VentasHoyClient.tsx)
// para que las dos se vean como un mismo módulo.
const C = {
  bg: '#F1F5F9',
  card: '#FFFFFF',
  soft: '#F8FAFC',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  green: '#059669',
  greenSoft: '#ECFDF5',
  amber: '#D97706',
  orange: '#EA580C',
  red: '#DC2626',
  redSoft: '#FEF2F2',
}

const PAGINA = 60
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// ── Formato ─────────────────────────────────────────────────────────────────
const fLitros = (n: number) => `${n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
/** Monto siempre completo, nunca "$2,9 M": mismo criterio que Ventas > Hoy. */
const fPesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
function fFecha(iso: string | null): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${parseInt(d)} ${MESES[parseInt(m) - 1]} ${y}`
}
function fMesAnio(iso: string | null): string {
  if (!iso) return '—'
  const [y, m] = iso.slice(0, 10).split('-')
  return `${MESES[parseInt(m) - 1]} ${y}`
}
function fHace(dias: number | null): string {
  if (dias === null) return 'Nunca compró'
  if (dias <= 0) return 'Hoy'
  if (dias === 1) return 'Ayer'
  if (dias < 45) return `Hace ${dias} días`
  if (dias < 365) return `Hace ${Math.round(dias / 30)} meses`
  return `Hace ${(dias / 365).toLocaleString('es-CL', { maximumFractionDigits: 1 })} años`
}
/** Versión corta para columnas "Compra cada": "~4 semanas", "Una vez". */
function fCada(ciclo: number | null, compras: number): string {
  if (compras === 0) return '—'
  if (ciclo === null) return 'Una vez'
  if (ciclo <= 10) return `~${ciclo} días`
  if (ciclo < 60) return `~${Math.round(ciclo / 7)} semanas`
  return `~${Math.round(ciclo / 30)} meses`
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Color del "hace X" según cuán reciente fue la última compra. */
function colorRecencia(dias: number | null): string {
  if (dias === null) return C.faint
  if (dias <= 60) return C.green
  if (dias <= 180) return C.amber
  if (dias <= ACTIVO_DIAS) return C.orange
  return C.faint
}

const ESTADO_INFO: Record<EstadoCliente, { label: string; color: string }> = {
  activo:      { label: 'Activo',      color: C.green },
  inactivo:    { label: 'Inactivo',    color: '#CBD5E1' },
  sin_compras: { label: 'Sin compras', color: '#E2E8F0' },
}

function conteo(lista: ClienteCartera[]) {
  let activos = 0, inactivos = 0, sinCompras = 0
  for (const c of lista) {
    if (c.estado === 'activo') activos++
    else if (c.estado === 'inactivo') inactivos++
    else sinCompras++
  }
  return { total: lista.length, activos, inactivos: inactivos + sinCompras, sinCompras }
}

// Tabla de zonas: nombre · activos · inactivos · total (cabe en 375 px sin cortar "Metropolitana")
const COLS_ZONA = 'minmax(0, 1fr) 54px 64px 50px'

// Columnas del listado en escritorio: cliente · última compra · frecuencia · 12 meses · histórico · flecha
const COLS_DESK = 'minmax(0, 2.4fr) minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr) 20px'

// `display` no lo toca el reset global de globals.css, así que el cambio
// celular/escritorio puede ir en clases; el espaciado va siempre inline.
const CSS = `
.ct-desk{display:none}
@media (min-width:900px){.ct-desk{display:grid}.ct-mob{display:none}}
.ct-row{background:transparent}
.ct-row:hover{background:${C.soft}}
`

// ── Componente ──────────────────────────────────────────────────────────────
export default function CarteraClient({ clientes, carterasVisibles, hoyISO }: Props) {
  const router = useRouter()
  const unaSolaCartera = carterasVisibles.length === 1
  const [cartera, setCartera] = useState<CarteraKey | 'todas'>(unaSolaCartera ? carterasVisibles[0] : 'todas')
  const [estado, setEstado] = useState<FiltroEstado>('activo')
  const [orden, setOrden] = useState<Orden>('reciente')
  const [query, setQuery] = useState('')
  const [comuna, setComuna] = useState<string | null>(null)
  const [visibles, setVisibles] = useState(PAGINA)
  const [abierto, setAbierto] = useState<string | null>(null)

  const buscando = query.trim().length > 0

  const porCartera = useMemo(() => {
    const m = new Map<CarteraKey, ClienteCartera[]>()
    for (const c of clientes) {
      const arr = m.get(c.cartera) ?? []
      arr.push(c)
      m.set(c.cartera, arr)
    }
    return m
  }, [clientes])

  const deCartera = useMemo(
    () => cartera === 'todas' ? clientes : porCartera.get(cartera) ?? [],
    [cartera, clientes, porCartera],
  )
  const resumen = useMemo(() => conteo(deCartera), [deCartera])

  // "Dónde vendemos": comunas con clientes activos en la zona elegida.
  const comunas = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of deCartera) {
      if (c.estado !== 'activo' || !c.localidad) continue
      m.set(c.localidad, (m.get(c.localidad) ?? 0) + 1)
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [deCartera])

  // La búsqueda recorre TODA la empresa (todas las zonas y estados): sirve
  // para "¿este cliente es nuestro?" sin tener que adivinar dónde está.
  const lista = useMemo(() => {
    let base: ClienteCartera[]
    if (buscando) {
      const q = norm(query.trim())
      base = clientes.filter(c =>
        norm(c.nombre).includes(q) ||
        (c.razonSocial && norm(c.razonSocial).includes(q)) ||
        (c.localidad && norm(c.localidad).includes(q)),
      )
    } else {
      base = deCartera.filter(c =>
        (estado === 'todos' || (estado === 'activo' ? c.estado === 'activo' : c.estado !== 'activo')) &&
        (!comuna || c.localidad === comuna),
      )
    }
    const ordenada = [...base]
    ordenada.sort((a, b) => {
      if (orden === 'nombre') return a.nombre.localeCompare(b.nombre, 'es')
      if (orden === 'historico') return b.monto - a.monto
      if (orden === 'ultimo_anio') return b.monto12m - a.monto12m || b.monto - a.monto
      return (b.ultimaCompra ?? '').localeCompare(a.ultimaCompra ?? '') || a.nombre.localeCompare(b.nombre, 'es')
    })
    return ordenada
  }, [buscando, query, clientes, deCartera, estado, comuna, orden])

  const elegirCartera = (k: CarteraKey | 'todas') => {
    setCartera(k); setComuna(null); setVisibles(PAGINA); setAbierto(null)
  }

  const nombreZona = cartera === 'todas' ? 'Toda la empresa' : infoCartera(cartera).nombre

  const exportar = useCallback(async () => {
    const XLSX = await import('xlsx')
    const filas = lista.map(c => ({
      'Cliente': c.nombre,
      'Razón social': c.razonSocial ?? '',
      'Zona': infoCartera(c.cartera).nombre,
      'Vendedor ERP': c.vendedorErp ?? '',
      'Comuna': c.localidad ?? '',
      'Provincia': c.provincia ?? '',
      'Categoría': c.categoria ?? '',
      'Estado': ESTADO_INFO[c.estado].label,
      'Última compra': c.ultimaCompra ?? '',
      'Días sin comprar': c.diasSinComprar ?? '',
      'Compra cada (días)': c.cicloDias ?? '',
      'Compras históricas (días)': c.compras,
      'Litros históricos': c.litros,
      'Venta neta histórica': c.monto,
      'Litros últimos 12 meses': c.litros12m,
      'Venta neta últimos 12 meses': c.monto12m,
      'Cliente desde': c.primeraCompra ?? '',
      'Teléfono': c.telefono ?? '',
    }))
    const ws = XLSX.utils.json_to_sheet(filas)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Clientes')
    const zona = buscando ? 'busqueda' : norm(nombreZona).replace(/\s+/g, '_')
    XLSX.writeFile(wb, `Clientes_${zona}_${hoyISO}.xlsx`)
  }, [lista, buscando, nombreZona, hoyISO])

  const filasZona: { key: CarteraKey | 'todas'; nombre: string; color: string; datos: ReturnType<typeof conteo> }[] = [
    { key: 'todas', nombre: 'Todas', color: C.text, datos: conteo(clientes) },
    ...CARTERAS.filter(c => carterasVisibles.includes(c.key))
      .map(c => ({ key: c.key, nombre: c.nombre, color: c.color, datos: conteo(porCartera.get(c.key) ?? []) })),
    ...(carterasVisibles.includes('otros') && (porCartera.get('otros')?.length ?? 0) > 0
      ? [{ key: CARTERA_OTROS.key, nombre: CARTERA_OTROS.nombre, color: CARTERA_OTROS.color, datos: conteo(porCartera.get('otros') ?? []) }]
      : []),
  ]

  const pctActivos = resumen.total ? (resumen.activos / resumen.total) * 100 : 0
  const tituloLista = buscando
    ? `${lista.length} ${lista.length === 1 ? 'resultado' : 'resultados'} ${unaSolaCartera ? 'en tu zona' : 'en toda la empresa'}`
    : `${estado === 'activo' ? 'Activos' : estado === 'inactivo' ? 'Inactivos' : 'Todos'}${comuna ? ` en ${comuna}` : ''} · ${lista.length}`

  return (
    <div style={{ background: C.bg, minHeight: '100dvh', flex: 1, color: C.text, overflowX: 'clip' }}>
      <style>{CSS}</style>
      <div style={{
        maxWidth: 1100, margin: '0 auto', padding: '14px 16px',
        paddingBottom: 'max(96px, calc(80px + env(safe-area-inset-bottom)))',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        {/* Volver — mismo botón que Ventas > Hoy */}
        <button onClick={() => router.push('/')} aria-label="Volver" style={{
          display: 'inline-flex', alignItems: 'center', gap: 4, alignSelf: 'flex-start',
          background: C.card, border: `1px solid ${C.line}`, borderRadius: 100, padding: '7px 14px 7px 10px',
          color: C.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 36,
        }}>
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} /> Volver
        </button>

        {/* Encabezado */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px', lineHeight: 1.1 }}>Clientes</h1>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
              {unaSolaCartera ? `Tus clientes de ${infoCartera(carterasVisibles[0]).nombre}` : 'Cartera de la empresa'} · activo = compró en los últimos 2 años
            </p>
          </div>
          <button onClick={exportar} disabled={lista.length === 0} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px', flexShrink: 0,
            borderRadius: 12, cursor: 'pointer', background: C.card, border: `1px solid ${C.line}`,
            color: C.text, fontSize: 13, fontWeight: 700, opacity: lista.length === 0 ? 0.4 : 1,
          }}>
            <Download size={15} color={C.green} /> Excel
          </button>
        </div>

        {/* Usuario sin zona (no admin y sin región ni nombre de vendedor en el ERP) */}
        {carterasVisibles.length === 0 && (
          <Card>
            <div style={{ fontSize: 15, fontWeight: 700 }}>No tienes una zona asignada</div>
            <p style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
              Esta pantalla muestra los clientes de la región de cada vendedor. Pide a un administrador que te asigne tu región.
            </p>
          </Card>
        )}

        {carterasVisibles.length > 0 && (<>
        {/* Buscador global */}
        <div style={{ position: 'relative' }}>
          <Search size={17} color={C.faint} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
          <input
            value={query}
            onChange={e => { setQuery(e.target.value); setVisibles(PAGINA); setAbierto(null) }}
            placeholder="Buscar cliente, razón social o comuna…"
            aria-label="Buscar cliente"
            style={{
              width: '100%', height: 46, borderRadius: 12, padding: '0 44px 0 42px',
              background: C.card, border: `1px solid ${C.line}`, color: C.text, fontSize: 15, outline: 'none',
            }}
          />
          {buscando && (
            <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda" style={{
              position: 'absolute', right: 2, top: '50%', transform: 'translateY(-50%)',
              width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'none', border: 'none', cursor: 'pointer',
            }}>
              <X size={17} color={C.muted} />
            </button>
          )}
        </div>

        {!buscando && (
          <>
            {/* Resumen de la zona elegida */}
            <Card>
              <Eyebrow>{nombreZona}</Eyebrow>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', marginTop: 10 }}>
                <BigStat label="Clientes" valor={resumen.total} color={C.text} />
                <BigStat label="Activos" valor={resumen.activos} color={C.green} borde />
                <BigStat label="Inactivos" valor={resumen.inactivos} color={C.muted} borde />
              </div>
              <div style={{ height: 6, borderRadius: 6, background: C.line, marginTop: 14, overflow: 'hidden' }}>
                <div style={{ width: `${pctActivos}%`, height: '100%', borderRadius: 6, background: C.green, transition: 'width .4s' }} />
              </div>
              <p style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
                {Math.round(pctActivos)}% activos
                {resumen.sinCompras > 0 && <> · {resumen.sinCompras} de los inactivos nunca han comprado</>}
              </p>
            </Card>

            {/* Clientes por zona — tabla, tocar una fila filtra todo */}
            {!unaSolaCartera && (
              <Card pad={0}>
                <div style={{ padding: '14px 16px 8px' }}><Eyebrow>Clientes por zona</Eyebrow></div>
                <div style={{
                  display: 'grid', gridTemplateColumns: COLS_ZONA, gap: 8,
                  padding: '6px 16px', fontSize: 11, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.4,
                  borderBottom: `1px solid ${C.line}`,
                }}>
                  <span>Zona</span><span style={{ textAlign: 'right' }}>Activos</span>
                  <span style={{ textAlign: 'right' }}>Inactivos</span><span style={{ textAlign: 'right' }}>Total</span>
                </div>
                {filasZona.map((z, i) => {
                  const activa = cartera === z.key
                  return (
                    <button key={z.key} onClick={() => elegirCartera(z.key)} aria-pressed={activa} className={activa ? undefined : 'ct-row'} style={{
                      width: '100%', display: 'grid', gridTemplateColumns: COLS_ZONA, gap: 8, alignItems: 'center',
                      padding: '0 14px 0 16px', minHeight: 46, border: 'none', cursor: 'pointer', textAlign: 'left',
                      borderTop: i === 0 ? 'none' : `1px solid ${C.line}`,
                      background: activa ? C.blueSoft : undefined,
                      boxShadow: activa ? `inset 3px 0 0 ${C.blue}` : 'none',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 4, background: z.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: activa ? 800 : 600, color: activa ? C.blue : C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{z.nombre}</span>
                      </span>
                      <Num v={z.datos.activos} color={C.green} bold />
                      <Num v={z.datos.inactivos} color={C.muted} />
                      <Num v={z.datos.total} color={C.text} />
                    </button>
                  )
                })}
              </Card>
            )}

            {/* Dónde vendemos */}
            {comunas.length > 0 && (
              <Card>
                <Eyebrow>
                  <MapPin size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                  Dónde vendemos · {comunas.length} {comunas.length === 1 ? 'comuna' : 'comunas'} con clientes activos
                </Eyebrow>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                  {comunas.slice(0, 20).map(([nombre, n]) => {
                    const activa = comuna === nombre
                    return (
                      <button key={nombre} onClick={() => { setComuna(activa ? null : nombre); setEstado('activo'); setVisibles(PAGINA); setAbierto(null) }} style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 11px',
                        borderRadius: 100, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        background: activa ? C.blue : C.soft,
                        border: `1px solid ${activa ? C.blue : C.line}`,
                        color: activa ? '#FFFFFF' : C.text,
                      }}>
                        {nombre}
                        <span style={{ fontSize: 11.5, fontWeight: 800, color: activa ? '#DBEAFE' : C.muted }}>{n}</span>
                      </button>
                    )
                  })}
                  {comunas.length > 20 && (
                    <span style={{ alignSelf: 'center', fontSize: 12, color: C.muted, padding: '0 4px' }}>
                      +{comunas.length - 20} más (usa el buscador)
                    </span>
                  )}
                </div>
              </Card>
            )}
          </>
        )}

        {/* Listado */}
        <Card pad={0}>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: '12px 16px', borderBottom: `1px solid ${C.line}` }}>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <div style={{ fontSize: 15, fontWeight: 800 }}>{tituloLista}</div>
              {comuna && !buscando && (
                <button onClick={() => setComuna(null)} style={{ background: 'none', border: 'none', padding: 0, color: C.blue, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                  Quitar filtro de comuna
                </button>
              )}
            </div>
            {!buscando && (
              <div role="tablist" style={{ display: 'flex', gap: 2, padding: 3, borderRadius: 10, background: C.line }}>
                {(['activo', 'inactivo', 'todos'] as const).map(e => (
                  <button key={e} role="tab" aria-selected={estado === e}
                    onClick={() => { setEstado(e); setVisibles(PAGINA); setAbierto(null) }}
                    style={{
                      minHeight: 34, padding: '0 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontSize: 13, fontWeight: 700,
                      background: estado === e ? C.card : 'transparent',
                      color: estado === e ? C.text : C.muted,
                      boxShadow: estado === e ? '0 1px 2px rgba(15,23,42,.08)' : 'none',
                    }}>
                    {e === 'activo' ? 'Activos' : e === 'inactivo' ? 'Inactivos' : 'Todos'}
                  </button>
                ))}
              </div>
            )}
            <div style={{ position: 'relative' }}>
              <select value={orden} onChange={e => setOrden(e.target.value as Orden)} aria-label="Ordenar" style={{
                appearance: 'none', minHeight: 40, padding: '0 32px 0 12px', borderRadius: 10, cursor: 'pointer',
                background: C.card, border: `1px solid ${C.line}`, color: C.text, fontSize: 13, fontWeight: 600,
              }}>
                <option value="reciente">Última compra</option>
                <option value="historico">Mayor compra histórica</option>
                <option value="ultimo_anio">Mayor compra 12 meses</option>
                <option value="nombre">Nombre A-Z</option>
              </select>
              <ChevronDown size={15} color={C.muted} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
            </div>
          </div>

          {lista.length === 0 ? (
            <div style={{ padding: '36px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>
                {buscando ? 'No encontramos ese cliente' : 'No hay clientes en este filtro'}
              </div>
              <div style={{ fontSize: 13, color: C.muted, marginTop: 6 }}>
                {buscando ? 'Prueba con parte del nombre o la comuna.' : 'Cambia a "Todos" o elige otra zona.'}
              </div>
            </div>
          ) : (
            <>
              {/* Encabezado de columnas (sólo escritorio) */}
              <div className="ct-desk" style={{
                gridTemplateColumns: COLS_DESK, gap: 12, padding: '8px 16px', background: C.soft,
                borderBottom: `1px solid ${C.line}`, fontSize: 11, fontWeight: 700, color: C.faint,
                textTransform: 'uppercase', letterSpacing: 0.4,
              }}>
                <span>Cliente</span><span>Última compra</span><span>Compra cada</span>
                <span style={{ textAlign: 'right' }}>Últimos 12 meses</span>
                <span style={{ textAlign: 'right' }}>Histórico</span><span />
              </div>
              {lista.slice(0, visibles).map((c, i) => (
                <FilaCliente
                  key={c.nombre}
                  c={c}
                  primera={i === 0}
                  mostrarZona={buscando || cartera === 'todas'}
                  abierta={abierto === c.nombre}
                  onToggle={() => setAbierto(abierto === c.nombre ? null : c.nombre)}
                />
              ))}
            </>
          )}
        </Card>

        {lista.length > visibles && (
          <button onClick={() => setVisibles(v => v + PAGINA)} style={{
            width: '100%', minHeight: 46, borderRadius: 12, cursor: 'pointer',
            background: C.card, border: `1px solid ${C.line}`, color: C.blue, fontSize: 14, fontWeight: 700,
          }}>
            Ver {Math.min(PAGINA, lista.length - visibles)} más · quedan {lista.length - visibles}
          </button>
        )}
        </>)}
      </div>
    </div>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────────
function Card({ children, pad = 16 }: { children: React.ReactNode; pad?: number }) {
  return (
    <section style={{
      background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: pad, overflow: 'hidden',
      boxShadow: '0 1px 2px rgba(15,23,42,.04)',
    }}>
      {children}
    </section>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: C.muted }}>{children}</div>
}

function BigStat({ label, valor, color, borde }: { label: string; valor: number; color: string; borde?: boolean }) {
  return (
    <div style={{ minWidth: 0, paddingLeft: borde ? 14 : 0, borderLeft: borde ? `1px solid ${C.line}` : 'none' }}>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1.05, letterSpacing: '-0.5px', fontVariantNumeric: 'tabular-nums' }}>
        {valor.toLocaleString('es-CL')}
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: C.muted, marginTop: 3 }}>{label}</div>
    </div>
  )
}

function Num({ v, color, bold }: { v: number; color: string; bold?: boolean }) {
  return (
    <span style={{ textAlign: 'right', fontSize: 14, fontWeight: bold ? 800 : 600, color, fontVariantNumeric: 'tabular-nums' }}>
      {v.toLocaleString('es-CL')}
    </span>
  )
}

/** Etiqueta chica + valor, para los datos de cada fila en el celular. */
function Campo({ label, valor, color, sub }: { label: string; valor: string; color?: string; sub?: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: color ?? C.text, marginTop: 2, fontVariantNumeric: 'tabular-nums', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{valor}</div>
      {sub && <div style={{ fontSize: 11.5, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
    </div>
  )
}

function FilaCliente({ c, primera, mostrarZona, abierta, onToggle }: {
  c: ClienteCartera; primera: boolean; mostrarZona: boolean; abierta: boolean; onToggle: () => void
}) {
  const zona = infoCartera(c.cartera)
  const etiquetaZona = c.cartera === 'otros' ? (c.vendedorErp ?? 'Sin vendedor') : zona.nombre
  const sub = [c.localidad, c.categoria, mostrarZona || c.cartera === 'otros' ? etiquetaZona : null].filter(Boolean).join(' · ')
  const ultima = c.ultimaCompra ? fFecha(c.ultimaCompra) : 'Nunca compró'
  const hace = c.ultimaCompra ? fHace(c.diasSinComprar) : undefined
  const cada = fCada(c.cicloDias, c.compras)
  const nCompras = c.compras > 0 ? `${c.compras} ${c.compras === 1 ? 'compra' : 'compras'}` : undefined

  const nombre = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
      <span title={ESTADO_INFO[c.estado].label} style={{ width: 9, height: 9, borderRadius: 5, flexShrink: 0, background: ESTADO_INFO[c.estado].color }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: C.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.nombre}</div>
        {sub && <div style={{ fontSize: 12, color: C.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</div>}
      </div>
    </div>
  )
  const flecha = <ChevronDown size={16} color={C.faint} style={{ flexShrink: 0, transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />

  return (
    <div style={{ borderTop: primera ? 'none' : `1px solid ${C.line}`, background: abierta ? C.soft : C.card }}>
      <button onClick={onToggle} aria-expanded={abierta} className={abierta ? undefined : 'ct-row'} style={{
        width: '100%', display: 'block', padding: '12px 16px', background: abierta ? 'transparent' : undefined, border: 'none', cursor: 'pointer', textAlign: 'left', color: C.text,
      }}>
        {/* Celular: nombre arriba y tres datos alineados debajo */}
        <div className="ct-mob">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ flex: 1, minWidth: 0 }}>{nombre}</div>
            {flecha}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '10px 12px', marginTop: 10, paddingLeft: 19 }}>
            <Campo label="Última compra" valor={hace ?? ultima} color={colorRecencia(c.diasSinComprar)} sub={hace ? ultima : undefined} />
            <Campo label="Compra cada" valor={cada} sub={nCompras} />
            <Campo label="Últimos 12 meses" valor={fPesos(c.monto12m)} sub={fLitros(c.litros12m)} />
            <Campo label="Histórico" valor={c.compras > 0 ? fPesos(c.monto) : '—'} sub={c.compras > 0 ? fLitros(c.litros) : undefined} />
          </div>
        </div>
        {/* Escritorio: una fila con columnas */}
        <div className="ct-desk" style={{ gridTemplateColumns: COLS_DESK, gap: 12, alignItems: 'center' }}>
          {nombre}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>{ultima}</div>
            {hace && <div style={{ fontSize: 12, fontWeight: 600, color: colorRecencia(c.diasSinComprar), marginTop: 1 }}>{hace}</div>}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: c.compras ? C.text : C.faint }}>{cada}</div>
            {nCompras && <div style={{ fontSize: 12, color: C.muted, marginTop: 1 }}>{nCompras}</div>}
          </div>
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fPesos(c.monto12m)}</div>
            <div style={{ fontSize: 12, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{fLitros(c.litros12m)}</div>
          </div>
          <div style={{ textAlign: 'right', minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fPesos(c.monto)}</div>
            <div style={{ fontSize: 12, color: C.muted, fontVariantNumeric: 'tabular-nums' }}>{fLitros(c.litros)}</div>
          </div>
          {flecha}
        </div>
      </button>
      {abierta && <FichaCliente c={c} />}
    </div>
  )
}

// Caché en memoria de las fichas ya abiertas: volver a abrir un cliente es instantáneo.
const cacheDetalle = new Map<string, DetalleCliente>()

function FichaCliente({ c }: { c: ClienteCartera }) {
  const [detalle, setDetalle] = useState<DetalleCliente | null>(() => cacheDetalle.get(c.nombre) ?? null)
  const [error, setError] = useState<string | null>(null)
  const [intento, setIntento] = useState(0)
  const [sel, setSel] = useState(0)
  const cargando = !detalle && !error

  // Carga al abrir (una sola vez por cliente gracias al caché); `intento`
  // la repite desde el botón Reintentar.
  useEffect(() => {
    if (cacheDetalle.has(c.nombre) || c.compras === 0) return
    let vivo = true
    createClient().rpc('cartera_cliente_detalle', { p_nombre: c.nombre }).then(({ data, error: err }) => {
      if (!vivo) return
      if (err || !data) { setError('No se pudo cargar el historial.'); return }
      const d = data as Partial<DetalleCliente>
      const limpio: DetalleCliente = { anios: d.anios ?? [], productos: d.productos ?? [], compras: d.compras ?? [] }
      cacheDetalle.set(c.nombre, limpio)
      setDetalle(limpio)
    })
    return () => { vivo = false }
  }, [c.nombre, c.compras, intento])
  const reintentar = () => { setError(null); setIntento(n => n + 1) }

  const maxLitrosAnio = Math.max(1, ...(detalle?.anios.map(a => a.litros) ?? [1]))
  const compraSel = detalle?.compras[sel] ?? null
  const anioActual = new Date().getFullYear().toString()

  return (
    <div style={{ padding: '0 16px 16px' }}>
      {/* Los datos clave ya están en la fila; acá va sólo lo que no cabe en ella. */}
      <p style={{ fontSize: 12.5, color: C.muted, marginBottom: 10, paddingLeft: 19 }}>
        {[
          c.razonSocial && c.razonSocial !== c.nombre ? c.razonSocial : null,
          c.provincia,
          c.telefono,
          c.primeraCompra ? `Cliente desde ${fMesAnio(c.primeraCompra)}` : 'Sin compras registradas',
        ].filter(Boolean).join(' · ')}
      </p>

      {c.compras > 0 && cargando && (
        <div style={{ display: 'grid', gap: 8 }}>
          {[70, 90, 55].map((w, i) => <div key={i} className="ct-sk" style={{ height: 14, width: `${w}%`, borderRadius: 6 }} />)}
          <style>{`@keyframes ctsh{0%{opacity:.5}50%{opacity:1}100%{opacity:.5}}.ct-sk{background:${C.line};animation:ctsh 1.2s ease-in-out infinite}`}</style>
        </div>
      )}
      {error && (
        <button onClick={reintentar} style={{
          marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px',
          borderRadius: 10, background: C.redSoft, border: `1px solid ${C.red}33`,
          color: C.red, fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          <RotateCw size={14} /> {error} Reintentar
        </button>
      )}

      {detalle && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
          {/* Qué compró en sus últimas compras */}
          <Panel titulo="Qué compró">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, padding: '0 12px 10px' }}>
              {detalle.compras.map((p, i) => (
                <button key={p.fecha} onClick={() => setSel(i)} style={{
                  minHeight: 32, padding: '0 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                  background: sel === i ? C.blue : C.card,
                  border: `1px solid ${sel === i ? C.blue : C.line}`,
                  color: sel === i ? '#FFFFFF' : C.text,
                }}>
                  {fFecha(p.fecha).replace(/ \d{4}$/, '')}{p.fecha.slice(0, 4) !== anioActual ? ` ${p.fecha.slice(2, 4)}` : ''}
                </button>
              ))}
            </div>
            {compraSel && (
              <>
                <Tabla cols="minmax(0, 1fr) 70px 90px" head={['Producto', 'Litros', 'Neto']}>
                  {compraSel.items.map((it, i) => (
                    <FilaTabla key={i} cols="minmax(0, 1fr) 70px 90px">
                      <span style={{ minWidth: 0 }}>
                        <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.producto ?? '—'}</span>
                        {it.envase && <span style={{ display: 'block', fontSize: 11.5, color: C.muted, marginTop: 1 }}>{it.envase}</span>}
                      </span>
                      <span style={{ textAlign: 'right', color: it.litros > 0 ? C.text : C.faint }}>{it.litros > 0 ? fLitros(it.litros) : '—'}</span>
                      <span style={{ textAlign: 'right' }}>{fPesos(it.monto)}</span>
                    </FilaTabla>
                  ))}
                </Tabla>
                <div style={{
                  display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px 90px', gap: 8, padding: '9px 12px',
                  borderTop: `1px solid ${C.line}`, fontSize: 13, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
                }}>
                  <span style={{ minWidth: 0 }}>
                    Total {fFecha(compraSel.fecha)}
                    {compraSel.pedidos && <span style={{ fontWeight: 500, color: C.muted }}> · N° {compraSel.pedidos}</span>}
                  </span>
                  <span style={{ textAlign: 'right' }}>{fLitros(compraSel.litros)}</span>
                  <span style={{ textAlign: 'right' }}>{fPesos(compraSel.monto)}</span>
                </div>
              </>
            )}
          </Panel>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <Panel titulo="Lo que más compra">
              <Tabla cols="minmax(0, 1fr) 80px 54px" head={['Producto', 'Litros', 'Veces']}>
                {detalle.productos.map(p => (
                  <FilaTabla key={p.producto} cols="minmax(0, 1fr) 80px 54px">
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.producto}</span>
                    <span style={{ textAlign: 'right' }}>{fLitros(p.litros)}</span>
                    <span style={{ textAlign: 'right', color: C.muted }}>{p.veces}</span>
                  </FilaTabla>
                ))}
              </Tabla>
            </Panel>

            <Panel titulo="Compras por año">
              <Tabla cols="44px minmax(0, 1fr) 76px 96px" head={['Año', '', 'Litros', 'Neto']}>
                {detalle.anios.map(a => (
                  <FilaTabla key={a.anio} cols="44px minmax(0, 1fr) 76px 96px">
                    <span style={{ fontWeight: 700 }}>{a.anio}</span>
                    <span style={{ height: 8, borderRadius: 4, background: C.line, overflow: 'hidden', alignSelf: 'center' }}>
                      <span style={{ display: 'block', width: `${(a.litros / maxLitrosAnio) * 100}%`, height: '100%', borderRadius: 4, background: C.blue }} />
                    </span>
                    <span style={{ textAlign: 'right' }}>{fLitros(a.litros)}</span>
                    <span style={{ textAlign: 'right' }}>{fPesos(a.monto)}</span>
                  </FilaTabla>
                ))}
              </Tabla>
            </Panel>
          </div>
        </div>
      )}

      {c.id !== null && (
        <Link href={`/ventas/clientes/${c.id}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, marginTop: 12, padding: '0 14px',
          borderRadius: 10, background: C.card, border: `1px solid ${C.line}`,
          color: C.blue, fontSize: 13, fontWeight: 700, textDecoration: 'none',
        }}>
          Ficha completa <ExternalLink size={13} />
        </Link>
      )}
    </div>
  )
}

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, overflow: 'hidden', minWidth: 0 }}>
      <div style={{ padding: '11px 12px 9px', fontSize: 11.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: C.muted }}>{titulo}</div>
      {children}
    </div>
  )
}

function Tabla({ cols, head, children }: { cols: string; head: string[]; children: React.ReactNode }) {
  return (
    <div>
      <div style={{
        display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '6px 12px', background: C.soft,
        borderTop: `1px solid ${C.line}`, borderBottom: `1px solid ${C.line}`,
        fontSize: 10.5, fontWeight: 700, color: C.faint, textTransform: 'uppercase', letterSpacing: 0.3,
      }}>
        {head.map((h, i) => <span key={i} style={{ textAlign: i === 0 ? 'left' : 'right' }}>{h}</span>)}
      </div>
      {children}
    </div>
  )
}

function FilaTabla({ cols, children }: { cols: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: cols, gap: 8, alignItems: 'center', padding: '8px 12px',
      borderTop: `1px solid ${C.line}`, fontSize: 13, color: C.text, fontVariantNumeric: 'tabular-nums',
    }}>
      {children}
    </div>
  )
}
