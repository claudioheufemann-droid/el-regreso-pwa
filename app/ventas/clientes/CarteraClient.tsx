'use client'

import { useMemo, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import { Search, X, Download, ChevronDown, MapPin, ExternalLink, RotateCw } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
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

const PAGINA = 60
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// ── Formato ─────────────────────────────────────────────────────────────────
const fLitros = (n: number) => `${n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} L`
const fPesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
function fPesosCorto(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toLocaleString('es-CL', { maximumFractionDigits: 1 })} M`
  if (n >= 1_000) return `$${Math.round(n / 1_000).toLocaleString('es-CL')} mil`
  return fPesos(n)
}
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
  const anios = dias / 365
  return `Hace ${anios.toLocaleString('es-CL', { maximumFractionDigits: 1 })} años`
}
function fFrecuencia(ciclo: number | null, compras: number): string {
  if (compras === 0) return '—'
  if (ciclo === null) return 'Compró una vez'
  if (ciclo <= 10) return `Cada ~${ciclo} días`
  if (ciclo < 60) return `Cada ~${Math.round(ciclo / 7)} semanas`
  return `Cada ~${Math.round(ciclo / 30)} meses`
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Color del "hace X" según cuán reciente fue la última compra. */
function colorRecencia(dias: number | null): string {
  if (dias === null) return 'var(--muted)'
  if (dias <= 60) return 'var(--green)'
  if (dias <= 180) return '#FACC15'
  if (dias <= ACTIVO_DIAS) return 'var(--orange)'
  return 'var(--muted)'
}

const ESTADO_INFO: Record<EstadoCliente, { label: string; color: string }> = {
  activo:      { label: 'Activo',       color: 'var(--green)' },
  inactivo:    { label: 'Inactivo',     color: 'var(--muted)' },
  sin_compras: { label: 'Sin compras',  color: '#4A4540' },
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

// ── Componente ──────────────────────────────────────────────────────────────
export default function CarteraClient({ clientes, carterasVisibles, hoyISO }: Props) {
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

  const tarjetasCartera: { key: CarteraKey; nombre: string; color: string }[] = [
    ...CARTERAS.filter(c => carterasVisibles.includes(c.key)),
    ...(carterasVisibles.includes('otros') && (porCartera.get('otros')?.length ?? 0) > 0 ? [CARTERA_OTROS] : []),
  ]

  const pctActivos = resumen.total ? (resumen.activos / resumen.total) * 100 : 0

  return (
    <div style={{
      maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0 16px',
      paddingBottom: 'max(96px, calc(80px + env(safe-area-inset-bottom)))',
    }}>
      <AppHeader eyebrow="Ventas · Cartera" title="Clientes" />

      {/* ── Buscador global ───────────────────────────────────────────── */}
      <div style={{ position: 'relative', marginTop: 14 }}>
        <Search size={17} color="var(--muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); setVisibles(PAGINA); setAbierto(null) }}
          placeholder="Buscar cliente, razón social o comuna…"
          aria-label="Buscar cliente"
          style={{
            width: '100%', height: 48, borderRadius: 14, padding: '0 44px 0 42px',
            background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--cream)',
            fontSize: 15, outline: 'none',
          }}
        />
        {buscando && (
          <button onClick={() => setQuery('')} aria-label="Limpiar búsqueda" style={{
            position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)',
            width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'none', border: 'none', cursor: 'pointer',
          }}>
            <X size={17} color="var(--muted)" />
          </button>
        )}
      </div>

      {!buscando && (
        <>
          {/* ── Resumen de la zona elegida ──────────────────────────────── */}
          <section style={{
            marginTop: 14, padding: '16px 16px 14px', borderRadius: 18,
            background: 'linear-gradient(160deg, rgba(212,175,55,0.10), rgba(212,175,55,0.02) 55%), var(--surface)',
            border: '1px solid rgba(212,175,55,0.18)',
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--gold)' }}>
              {nombreZona}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
              <BigStat label="Clientes" valor={resumen.total} color="var(--cream)" />
              <BigStat label="Activos" valor={resumen.activos} color="var(--green)" />
              <BigStat label="Inactivos" valor={resumen.inactivos} color="#A8A29E" />
            </div>
            <div style={{ height: 6, borderRadius: 6, background: 'rgba(255,255,255,0.06)', marginTop: 12, overflow: 'hidden' }}>
              <div style={{ width: `${pctActivos}%`, height: '100%', borderRadius: 6, background: 'var(--green)', transition: 'width .4s var(--spring)' }} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.45 }}>
              {Math.round(pctActivos)}% activos · Activo = compró en los últimos 2 años
              {resumen.sinCompras > 0 && <> · {resumen.sinCompras} inactivos nunca han comprado</>}
            </div>
          </section>

          {/* ── Carteras por vendedor/zona ──────────────────────────────── */}
          {!unaSolaCartera && (
            <section style={{ marginTop: 14 }}>
              <SectionLabel>Por zona</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                <ZonaCard
                  nombre="Todas" color="var(--gold)" activa={cartera === 'todas'}
                  {...conteo(clientes)} onClick={() => elegirCartera('todas')}
                />
                {tarjetasCartera.map(z => (
                  <ZonaCard
                    key={z.key} nombre={z.nombre} color={z.color} activa={cartera === z.key}
                    {...conteo(porCartera.get(z.key) ?? [])} onClick={() => elegirCartera(z.key)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* ── Dónde vendemos ─────────────────────────────────────────── */}
          {comunas.length > 0 && (
            <section style={{ marginTop: 16 }}>
              <SectionLabel>
                <MapPin size={12} style={{ marginRight: 4, verticalAlign: -1 }} />
                Dónde vendemos · {comunas.length} {comunas.length === 1 ? 'comuna' : 'comunas'}
              </SectionLabel>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {comunas.slice(0, 18).map(([nombre, n]) => {
                  const activa = comuna === nombre
                  return (
                    <button key={nombre} onClick={() => { setComuna(activa ? null : nombre); setEstado('activo'); setVisibles(PAGINA) }} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 34, padding: '0 12px',
                      borderRadius: 100, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                      background: activa ? 'var(--gold-dim)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${activa ? 'rgba(212,175,55,0.45)' : 'var(--border)'}`,
                      color: activa ? 'var(--gold)' : 'var(--cream)',
                    }}>
                      {nombre}
                      <span style={{ fontSize: 11, fontWeight: 800, color: activa ? 'var(--gold)' : 'var(--muted)' }}>{n}</span>
                    </button>
                  )
                })}
                {comunas.length > 18 && (
                  <span style={{ alignSelf: 'center', fontSize: 12, color: 'var(--muted)', padding: '0 4px' }}>
                    +{comunas.length - 18} más (usa el buscador)
                  </span>
                )}
              </div>
            </section>
          )}
        </>
      )}

      {/* ── Barra de filtros del listado ─────────────────────────────────── */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginTop: 18 }}>
        {!buscando && (
          <div role="tablist" style={{ display: 'flex', padding: 3, borderRadius: 12, background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)' }}>
            {(['activo', 'inactivo', 'todos'] as const).map(e => (
              <button key={e} role="tab" aria-selected={estado === e}
                onClick={() => { setEstado(e); setVisibles(PAGINA); setAbierto(null) }}
                style={{
                  minHeight: 36, padding: '0 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                  fontSize: 13, fontWeight: 700,
                  background: estado === e ? 'rgba(255,255,255,0.10)' : 'transparent',
                  color: estado === e ? 'var(--cream)' : 'var(--muted)',
                }}>
                {e === 'activo' ? 'Activos' : e === 'inactivo' ? 'Inactivos' : 'Todos'}
              </button>
            ))}
          </div>
        )}
        <div style={{ position: 'relative' }}>
          <select value={orden} onChange={e => setOrden(e.target.value as Orden)} aria-label="Ordenar" style={{
            appearance: 'none', minHeight: 42, padding: '0 34px 0 12px', borderRadius: 12, cursor: 'pointer',
            background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--cream)',
            fontSize: 13, fontWeight: 600,
          }}>
            <option value="reciente">Última compra</option>
            <option value="historico">Mayor compra histórica</option>
            <option value="ultimo_anio">Mayor compra 12 meses</option>
            <option value="nombre">Nombre A-Z</option>
          </select>
          <ChevronDown size={15} color="var(--muted)" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }} />
        </div>
        <button onClick={exportar} disabled={lista.length === 0} style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 42, padding: '0 14px',
          borderRadius: 12, cursor: 'pointer', background: 'var(--gold-dim)', border: '1px solid rgba(212,175,55,0.3)',
          color: 'var(--gold)', fontSize: 13, fontWeight: 700, opacity: lista.length === 0 ? 0.4 : 1,
        }}>
          <Download size={15} /> Excel
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', margin: '12px 2px 8px' }}>
        {buscando
          ? `${lista.length} ${lista.length === 1 ? 'resultado' : 'resultados'} en toda la empresa`
          : `${lista.length} ${lista.length === 1 ? 'cliente' : 'clientes'}${comuna ? ` en ${comuna}` : ''}`}
        {comuna && !buscando && (
          <button onClick={() => setComuna(null)} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--gold)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
            Quitar comuna
          </button>
        )}
      </div>

      {/* ── Listado ─────────────────────────────────────────────────────── */}
      {lista.length === 0 ? (
        <div style={{ padding: '36px 16px', textAlign: 'center', borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)' }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)' }}>
            {buscando ? 'No encontramos ese cliente' : 'No hay clientes en este filtro'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>
            {buscando ? 'Prueba con parte del nombre o la comuna.' : 'Cambia a "Todos" o elige otra zona.'}
          </div>
        </div>
      ) : (
        <div style={{ borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', overflow: 'hidden' }}>
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
        </div>
      )}
      {lista.length > visibles && (
        <button onClick={() => setVisibles(v => v + PAGINA)} style={{
          width: '100%', minHeight: 46, marginTop: 10, borderRadius: 14, cursor: 'pointer',
          background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--cream)',
          fontSize: 13.5, fontWeight: 700,
        }}>
          Ver {Math.min(PAGINA, lista.length - visibles)} más · quedan {lista.length - visibles}
        </button>
      )}
    </div>
  )
}

// ── Piezas ──────────────────────────────────────────────────────────────────
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted)', margin: '0 2px 8px' }}>
      {children}
    </div>
  )
}

function BigStat({ label, valor, color }: { label: string; valor: number; color: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 30, fontWeight: 900, color, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
        {valor.toLocaleString('es-CL')}
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 3 }}>{label}</div>
    </div>
  )
}

function ZonaCard({ nombre, color, activa, total, activos, inactivos, onClick }: {
  nombre: string; color: string; activa: boolean
  total: number; activos: number; inactivos: number; onClick: () => void
}) {
  const pct = total ? (activos / total) * 100 : 0
  return (
    <button onClick={onClick} aria-pressed={activa} style={{
      textAlign: 'left', padding: '12px 12px 11px', borderRadius: 14, cursor: 'pointer', minHeight: 44,
      background: activa ? 'rgba(255,255,255,0.07)' : 'var(--surface)',
      border: `1px solid ${activa ? color : 'var(--border)'}`,
      boxShadow: activa ? `0 0 0 1px ${color}33` : 'none',
      transition: 'border-color .15s, background .15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ width: 8, height: 8, borderRadius: 4, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, marginTop: 8 }}>
        <span style={{ fontSize: 22, fontWeight: 900, color: 'var(--green)', fontVariantNumeric: 'tabular-nums' }}>{activos}</span>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>activos</span>
      </div>
      <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 1 }}>
        {inactivos} inactivos · {total} total
      </div>
      <div style={{ height: 3, borderRadius: 3, background: 'rgba(255,255,255,0.06)', marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'var(--green)', opacity: 0.8 }} />
      </div>
    </button>
  )
}

function FilaCliente({ c, primera, mostrarZona, abierta, onToggle }: {
  c: ClienteCartera; primera: boolean; mostrarZona: boolean; abierta: boolean; onToggle: () => void
}) {
  const zona = infoCartera(c.cartera)
  const etiquetaZona = c.cartera === 'otros' ? (c.vendedorErp ?? 'Sin vendedor') : zona.nombre
  const sub = [c.localidad, c.categoria, mostrarZona || c.cartera === 'otros' ? etiquetaZona : null].filter(Boolean).join(' · ')
  return (
    <div style={{ borderTop: primera ? 'none' : '1px solid var(--row-sep)' }}>
      <button onClick={onToggle} aria-expanded={abierta} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', minHeight: 60,
        background: abierta ? 'rgba(255,255,255,0.03)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left',
      }}>
        <span title={ESTADO_INFO[c.estado].label} style={{
          width: 9, height: 9, borderRadius: 5, flexShrink: 0, background: ESTADO_INFO[c.estado].color,
          boxShadow: c.estado === 'activo' ? '0 0 8px rgba(74,222,128,0.45)' : 'none',
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--cream)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.nombre}
          </div>
          {sub && (
            <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {mostrarZona && <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: zona.color, marginRight: 6, verticalAlign: 1 }} />}
              {sub}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: colorRecencia(c.diasSinComprar) }}>{fHace(c.diasSinComprar)}</div>
          <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
            {c.compras > 0 ? fPesosCorto(c.monto) : '—'}
          </div>
        </div>
        <ChevronDown size={16} color="var(--muted)" style={{ flexShrink: 0, transform: abierta ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} />
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
  const [pedido, setPedido] = useState(0)
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
  const pedidoSel = detalle?.compras[pedido] ?? null

  return (
    <div style={{ padding: '4px 14px 16px 35px' }}>
      {c.razonSocial && c.razonSocial !== c.nombre && (
        <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>{c.razonSocial}{c.provincia ? ` · ${c.provincia}` : ''}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8 }}>
        <Dato label="Compra histórica" valor={c.compras > 0 ? fPesos(c.monto) : '—'} sub={c.compras > 0 ? `${fLitros(c.litros)} · neto` : 'Sin compras registradas'} />
        <Dato label="Últimos 12 meses" valor={c.monto12m > 0 ? fPesos(c.monto12m) : '$0'} sub={fLitros(c.litros12m)} />
        <Dato label="Última compra" valor={fFecha(c.ultimaCompra)} sub={fHace(c.diasSinComprar)} color={colorRecencia(c.diasSinComprar)} />
        <Dato label="Frecuencia" valor={fFrecuencia(c.cicloDias, c.compras)} sub={c.compras > 0 ? `${c.compras} ${c.compras === 1 ? 'compra' : 'compras'} · desde ${fMesAnio(c.primeraCompra)}` : ''} />
      </div>

      {c.compras > 0 && (
        <>
          {cargando && !detalle && (
            <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
              {[70, 90, 55].map((w, i) => <div key={i} className="ct-sk" style={{ height: 14, width: `${w}%`, borderRadius: 6 }} />)}
              <style>{`@keyframes ctsh{0%{opacity:.35}50%{opacity:.8}100%{opacity:.35}}.ct-sk{background:#1A1A1A;animation:ctsh 1.2s ease-in-out infinite}`}</style>
            </div>
          )}
          {error && (
            <button onClick={reintentar} style={{
              marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, padding: '0 14px',
              borderRadius: 10, background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.3)',
              color: 'var(--red)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            }}>
              <RotateCw size={14} /> {error} Reintentar
            </button>
          )}

          {detalle && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginTop: 16 }}>
              {/* Qué compró (últimos pedidos) */}
              <div style={{ minWidth: 0 }}>
                <MiniLabel>Qué compró</MiniLabel>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 8 }}>
                  {detalle.compras.map((p, i) => (
                    <button key={p.fecha} onClick={() => setPedido(i)} style={{
                      minHeight: 32, padding: '0 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700,
                      background: pedido === i ? 'var(--gold-dim)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${pedido === i ? 'rgba(212,175,55,0.4)' : 'var(--border)'}`,
                      color: pedido === i ? 'var(--gold)' : 'var(--cream)',
                    }}>
                      {fFecha(p.fecha).replace(/ \d{4}$/, '')}{p.fecha.slice(0, 4) !== new Date().getFullYear().toString() ? ` ${p.fecha.slice(2, 4)}` : ''}
                    </button>
                  ))}
                </div>
                {pedidoSel && (
                  <div style={{ borderRadius: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border-subtle)', padding: '8px 12px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12, color: 'var(--muted)', paddingBottom: 6, borderBottom: '1px solid var(--row-sep)' }}>
                      <span>{fFecha(pedidoSel.fecha)}{pedidoSel.pedidos ? ` · N° ${pedidoSel.pedidos}` : ''}</span>
                      <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{fLitros(pedidoSel.litros)} · {fPesos(pedidoSel.monto)}</span>
                    </div>
                    {pedidoSel.items.map((it, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '6px 0', fontSize: 12.5 }}>
                        <span style={{ color: 'var(--cream)', minWidth: 0 }}>
                          {it.producto ?? '—'}
                          {it.envase && <span style={{ color: 'var(--muted)' }}> · {it.envase}</span>}
                        </span>
                        <span style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                          {it.litros > 0 ? fLitros(it.litros) : fPesos(it.monto)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Lo que más compra + por año */}
              <div style={{ minWidth: 0 }}>
                <MiniLabel>Lo que más compra</MiniLabel>
                {detalle.productos.map(p => (
                  <div key={p.producto} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', fontSize: 12.5, borderBottom: '1px solid var(--row-sep)' }}>
                    <span style={{ color: 'var(--cream)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.producto}</span>
                    <span style={{ color: 'var(--muted)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      {fLitros(p.litros)} · {p.veces} {p.veces === 1 ? 'vez' : 'veces'}
                    </span>
                  </div>
                ))}

                <div style={{ marginTop: 14 }}><MiniLabel>Compras por año</MiniLabel></div>
                {detalle.anios.map(a => (
                  <div key={a.anio} style={{ display: 'grid', gridTemplateColumns: '38px 1fr auto', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>{a.anio}</span>
                    <div style={{ height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.05)', overflow: 'hidden' }}>
                      <div style={{ width: `${(a.litros / maxLitrosAnio) * 100}%`, height: '100%', borderRadius: 4, background: 'var(--gold)', opacity: 0.85 }} />
                    </div>
                    <span style={{ fontSize: 12, color: 'var(--cream)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                      {fLitros(a.litros)} <span style={{ color: 'var(--muted)' }}>· {fPesosCorto(a.monto)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {c.id !== null && (
        <Link href={`/ventas/clientes/${c.id}`} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 40, marginTop: 14, padding: '0 14px',
          borderRadius: 10, background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)',
          color: 'var(--cream)', fontSize: 13, fontWeight: 700, textDecoration: 'none',
        }}>
          Ficha completa <ExternalLink size={13} />
        </Link>
      )}
    </div>
  )
}

function MiniLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>{children}</div>
}

function Dato({ label, valor, sub, color }: { label: string; valor: string; sub?: string; color?: string }) {
  return (
    <div style={{ padding: '10px 12px', borderRadius: 12, background: '#1A1A1A', border: '1px solid var(--border-subtle)', minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--muted)' }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: color ?? 'var(--cream)', marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {sub && <div style={{ fontSize: 11.5, color: 'var(--muted)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}
