'use client'

import { useEffect, useState } from 'react'
import { ChevronDown, RefreshCw, Sparkles, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { type FilaMeta, clp, litros, entero, fechaCorta } from './tipos'

/**
 * A quién le vendió cada región en la semana/mes elegido, cuál es el cliente
 * nuevo y qué le vendió a cada uno. Lee la función plan_metas_detalle_clientes
 * (mismas reglas que las vistas de Metas, así la suma cuadra con "Ventas / Meta"
 * y con el "Vendido" de cajas y barriles).
 */
interface ProductoCliente {
  producto: string
  envase: string | null
  categoria: string | null
  litros: number
  neto: number
}

interface ClienteDetalle {
  cliente: string
  neto: number
  porEntregar: number
  litros: number
  pedidos: number
  ultimaFecha: string
  esNuevo: boolean
  cajasKombucha: number
  cajasCerveza: number
  barriles: number
  productos: ProductoCliente[]
}

type FilaRpc = Record<string, unknown>

// Cache de la sesión: abrir y cerrar la misma región no vuelve a consultar.
const cache = new Map<string, ClienteDetalle[]>()

/** "la semana 3" / "Noviembre": cómo se nombra lo elegido dentro de una frase. */
export function nombreEnFrase(fila: FilaMeta): string {
  return fila.nombre.toLowerCase().startsWith('semana') ? `la ${fila.nombre.toLowerCase()}` : fila.nombre
}

export default function DetalleClientes({
  userId, desde, hasta, nombre, etiqueta, metas,
}: {
  userId: string; desde: string; hasta: string; nombre: string; etiqueta: string
  /** Metas del vendedor; se despliegan aquí mismo (pedido: no cambiar de pantalla). */
  metas: React.ReactNode
}) {
  const [verMetas, setVerMetas] = useState(false)
  return (
    <div className="border-b border-[var(--cc-line-soft)] bg-[var(--cc-card-2)] px-3 pb-3 pt-3 lg:px-4">
      <ClientesDelCorte userId={userId} desde={desde} hasta={hasta} nombre={nombre} />
      <button
        type="button"
        onClick={() => setVerMetas(!verMetas)}
        aria-expanded={verMetas}
        className="mt-2 inline-flex min-h-[40px] items-center gap-1 text-[13px] font-bold text-[var(--m-oro-texto)] hover:underline"
      >
        {verMetas ? 'Ocultar metas' : 'Ver metas'} de {etiqueta}
        <ChevronDown size={14} className={`transition-transform duration-200 ${verMetas ? 'rotate-180' : ''}`} />
      </button>
      {verMetas && (
        <div className="mt-1 rounded-[10px] border border-[var(--cc-line)] bg-[var(--cc-card)] px-3 pb-4 pt-3 lg:px-4">{metas}</div>
      )}
    </div>
  )
}

/** Resumen (clientes + nuevos) y lista de clientes; cada cliente se despliega con lo que compró. */
export function ClientesDelCorte({
  userId, desde, hasta, nombre,
}: {
  userId: string; desde: string; hasta: string; nombre: string
}) {
  const clave = `${userId}|${desde}|${hasta}`
  // El error se guarda con su clave: al cambiar de semana se vuelve a "cargando".
  const [fallo, setFallo] = useState<{ clave: string; mensaje: string } | null>(null)
  const [intento, setIntento] = useState(0)
  const [abierto, setAbierto] = useState<string | null>(null)
  const datos = cache.get(clave) ?? null
  const error = fallo?.clave === clave ? fallo.mensaje : null

  useEffect(() => {
    if (cache.has(clave)) return
    let vivo = true
    createClient()
      .rpc('plan_metas_detalle_clientes', { p_user_id: userId, p_desde: desde, p_hasta: hasta })
      .then(({ data, error: e }) => {
        if (!vivo) return
        if (e) { setFallo({ clave, mensaje: e.message }); return }
        const filas = ((data ?? []) as FilaRpc[]).map(r => ({
          cliente: String(r.cliente ?? 'Sin nombre'),
          neto: Number(r.neto) || 0,
          porEntregar: Number(r.neto_por_entregar) || 0,
          litros: Number(r.litros) || 0,
          pedidos: Number(r.pedidos) || 0,
          ultimaFecha: String(r.ultima_fecha ?? ''),
          esNuevo: r.es_nuevo === true,
          cajasKombucha: Number(r.cajas_kombucha) || 0,
          cajasCerveza: Number(r.cajas_cerveza) || 0,
          barriles: Number(r.barriles) || 0,
          productos: (Array.isArray(r.productos) ? (r.productos as FilaRpc[]) : []).map(p => ({
            producto: String(p.producto ?? 'Sin producto'),
            envase: p.envase == null ? null : String(p.envase),
            categoria: p.categoria == null ? null : String(p.categoria),
            litros: Number(p.litros) || 0,
            neto: Number(p.neto) || 0,
          })),
        }))
        cache.set(clave, filas)
        setFallo(null)
        setIntento(n => n + 1) // re-render para leer la caché
      })
    return () => { vivo = false }
  }, [clave, userId, desde, hasta, intento])

  if (error) {
    return (
      <div className="flex flex-wrap items-center gap-3 py-2 text-[13px] text-[var(--cc-ink-2)]">
        No se pudo cargar el detalle: {error}
        <button
          type="button"
          onClick={() => { setFallo(null); setIntento(n => n + 1) }}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[8px] border border-[var(--cc-line)] px-3 font-bold text-[var(--cc-ink)]"
        >
          <RefreshCw size={13} /> Reintentar
        </button>
      </div>
    )
  }

  if (!datos) {
    return (
      <div className="flex flex-col gap-2 py-1" aria-label="Cargando clientes">
        {[0, 1, 2].map(i => <div key={i} className="h-[44px] animate-pulse rounded-[8px] bg-[var(--cc-line-soft)]" />)}
      </div>
    )
  }

  const nuevos = datos.filter(d => d.esNuevo)

  return (
    <>
      <p className="pb-2 text-[13px] font-medium text-[var(--cc-ink-2)]">
        {datos.length === 0 ? (
          <>Sin ventas en {nombre}.</>
        ) : (
          <>
            <strong className="font-bold text-[var(--cc-ink)]">{entero(datos.length)} {datos.length === 1 ? 'cliente' : 'clientes'}</strong> en {nombre}
            {' · '}
            {nuevos.length === 0 ? (
              'ningún cliente nuevo'
            ) : (
              <>
                {nuevos.length === 1 ? 'cliente nuevo: ' : `${nuevos.length} clientes nuevos: `}
                <strong className="font-bold text-[var(--m-verde)]">{nuevos.map(n => n.cliente).join(', ')}</strong>
              </>
            )}
          </>
        )}
      </p>

      {datos.length > 0 && (
        <ul className="overflow-hidden rounded-[10px] border border-[var(--cc-line)] bg-[var(--cc-card)]">
          {datos.map(d => (
            <FilaCliente
              key={d.cliente}
              d={d}
              abierto={abierto === d.cliente}
              onToggle={() => setAbierto(abierto === d.cliente ? null : d.cliente)}
            />
          ))}
        </ul>
      )}
    </>
  )
}

function FilaCliente({ d, abierto, onToggle }: { d: ClienteDetalle; abierto: boolean; onToggle: () => void }) {
  // Lo que cuenta para las metas por producto, en sus mismas unidades.
  const unidades = [
    d.cajasKombucha > 0 && `${litros(d.cajasKombucha)} cj kombucha`,
    d.cajasCerveza > 0 && `${litros(d.cajasCerveza)} cj cerveza`,
    d.barriles > 0 && `${litros(d.barriles)} ${d.barriles === 1 ? 'barril' : 'barriles'}`,
  ].filter(Boolean).join(' · ')

  return (
    <li
      className="border-b border-[var(--cc-line-soft)] last:border-b-0"
      style={d.esNuevo ? { background: 'var(--m-verde-suave)' } : undefined}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierto}
        className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[14px] font-bold text-[var(--cc-ink)]">{d.cliente}</span>
            {d.esNuevo && (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--m-verde)] px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.04em] text-[var(--cc-on-gold)]">
                <Sparkles size={11} /> Nuevo
              </span>
            )}
          </span>
          <span className="truncate text-[12px] font-medium tabular-nums text-[var(--cc-ink-2)]">
            {unidades || `${litros(d.litros)} L`} · {d.pedidos} {d.pedidos === 1 ? 'pedido' : 'pedidos'}
            {d.ultimaFecha && ` · ${fechaCorta(d.ultimaFecha)}`}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end">
          <span className="text-[14px] font-bold tabular-nums text-[var(--cc-ink)]">{clp(d.neto)}</span>
          {Math.round(d.porEntregar) > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium tabular-nums text-[var(--cc-ink-2)]">
              <Truck size={11} className="text-[var(--cc-gold)]" />
              {Math.round(d.porEntregar) >= Math.round(d.neto) ? 'por entregar' : `${clp(d.porEntregar)} por entregar`}
            </span>
          )}
        </span>
        <ChevronDown size={16} className={`shrink-0 text-[var(--cc-ink-2)] transition-transform duration-200 ${abierto ? 'rotate-180' : ''}`} />
      </button>
      {abierto && <ProductosCliente productos={d.productos} />}
    </li>
  )
}

/** Cantidad en la unidad de la meta: cajas para latas, barriles para barril de cerveza; si no, litros. */
function cantidad(p: ProductoCliente): string {
  const lata = /^lata/i.test(p.envase ?? '')
  if (lata && p.categoria === 'Kombucha') return `${litros(p.litros / (24 * 0.354))} cj`
  if (lata && p.categoria === 'Cerveza') return `${litros(p.litros / (24 * 0.473))} cj`
  if (p.envase === 'Barril' && p.categoria === 'Cerveza') {
    const b = p.litros / 30
    return `${litros(b)} ${Math.round(b * 10) === 10 ? 'barril' : 'barriles'}`
  }
  return p.litros ? `${litros(p.litros)} L` : '—'
}

function envaseCorto(envase: string | null): string {
  if (!envase) return ''
  const ml = envase.match(/(\d+)\s*ml/i)
  if (/^lata/i.test(envase)) return ml ? `Lata ${ml[1]}` : 'Lata'
  return envase
}

function ProductosCliente({ productos }: { productos: ProductoCliente[] }) {
  if (productos.length === 0) {
    return <p className="px-3 pb-3 text-[13px] font-medium text-[var(--cc-ink-2)]">Sin detalle de productos.</p>
  }
  return (
    <ul className="mx-3 mb-3 rounded-[8px] border border-[var(--cc-line-soft)] bg-[var(--cc-card-2)]">
      {productos.map(p => (
        <li
          key={`${p.producto}|${p.envase ?? ''}`}
          className="flex min-h-[40px] items-center gap-3 border-b border-[var(--cc-line-soft)] px-3 py-1.5 last:border-b-0"
        >
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[13px] font-semibold text-[var(--cc-ink)]">{p.producto.replace(/\s{2,}/g, ' ')}</span>
            {p.envase && <span className="truncate text-[11px] font-medium text-[var(--cc-ink-2)]">{envaseCorto(p.envase)}</span>}
          </span>
          <span className="w-[84px] shrink-0 text-right text-[13px] font-bold tabular-nums text-[var(--cc-ink)]">{cantidad(p)}</span>
          <span className="w-[84px] shrink-0 text-right text-[13px] font-medium tabular-nums text-[var(--cc-ink-2)]">{clp(p.neto)}</span>
        </li>
      ))}
    </ul>
  )
}
