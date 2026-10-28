'use client'

import { useEffect, useState } from 'react'
import { ChevronRight, RefreshCw, Sparkles, Truck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { clp, litros, entero, fechaCorta } from './tipos'

/**
 * A quién le vendió cada región en la semana/mes elegido y cuál es el cliente
 * nuevo. Lee la función plan_metas_detalle_clientes (mismas reglas que las
 * vistas de Metas, así la suma cuadra con "Ventas / Meta" del ranking).
 */
interface ClienteDetalle {
  cliente: string
  neto: number
  porEntregar: number
  litros: number
  pedidos: number
  ultimaFecha: string
  esNuevo: boolean
}

type FilaRpc = Record<string, string | number | boolean | null>

// Cache de la sesión: abrir y cerrar la misma región no vuelve a consultar.
const cache = new Map<string, ClienteDetalle[]>()

export default function DetalleClientes({
  userId, desde, hasta, nombre, etiqueta, onVerMetas,
}: {
  userId: string; desde: string; hasta: string; nombre: string; etiqueta: string; onVerMetas: () => void
}) {
  const clave = `${userId}|${desde}|${hasta}`
  // El error se guarda con su clave: al cambiar de semana se vuelve a "cargando".
  const [fallo, setFallo] = useState<{ clave: string; mensaje: string } | null>(null)
  const [intento, setIntento] = useState(0)
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
        }))
        cache.set(clave, filas)
        setFallo(null)
        setIntento(n => n + 1) // re-render para leer la caché
      })
    return () => { vivo = false }
  }, [clave, userId, desde, hasta, intento])

  const nuevos = datos?.filter(d => d.esNuevo) ?? []

  return (
    <div className="border-b border-[var(--cc-line-soft)] bg-[var(--cc-card-2)] px-3 pb-3 pt-3 lg:px-4">
      {error ? (
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
      ) : !datos ? (
        <div className="flex flex-col gap-2 py-1" aria-label="Cargando clientes">
          {[0, 1, 2].map(i => <div key={i} className="h-[44px] animate-pulse rounded-[8px] bg-[var(--cc-line-soft)]" />)}
        </div>
      ) : (
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
                <li
                  key={d.cliente}
                  className="flex min-h-[48px] items-center gap-3 border-b border-[var(--cc-line-soft)] px-3 py-2 last:border-b-0"
                  style={d.esNuevo ? { background: 'var(--m-verde-suave)' } : undefined}
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
                      {litros(d.litros)} L · {d.pedidos} {d.pedidos === 1 ? 'pedido' : 'pedidos'}
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
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button
        type="button"
        onClick={onVerMetas}
        className="mt-2 inline-flex min-h-[40px] items-center gap-1 text-[13px] font-bold text-[var(--m-oro-texto)] hover:underline"
      >
        Ver metas de {etiqueta} <ChevronRight size={14} />
      </button>
    </div>
  )
}
