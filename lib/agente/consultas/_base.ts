import type { SupabaseClient } from '@supabase/supabase-js'
import { PARAMETROS } from '../sistema'

export interface ParametroConsulta {
  nombre: string
  tipo: 'string' | 'integer'
  descripcion: string
  requerido?: boolean
  enum?: string[]
}

export interface ContextoConsulta {
  /** service-role, SOLO lectura: el agente jamás escribe. */
  admin: SupabaseClient
  hoyISO: string
}

export interface Consulta {
  /** Nombre de la herramienta (snake_case). Es lo que el modelo "ve". */
  nombre: string
  /** Cuándo usarla — el modelo decide en base a este texto, escribirlo bien es entrenar al agente. */
  descripcion: string
  parametros: ParametroConsulta[]
  ejecutar(args: Record<string, unknown>, ctx: ContextoConsulta): Promise<unknown>
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/

export function texto(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

export function entero(v: unknown, def: number, min: number, max: number): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return def
  return Math.min(max, Math.max(min, Math.round(n)))
}

export function fecha(v: unknown): string | null {
  const s = texto(v)
  return s && RE_FECHA.test(s) ? s : null
}

export function sumarDiasISO(iso: string, dias: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + dias * 86_400_000).toISOString().slice(0, 10)
}

/** Rango [desde, hasta] validado; por defecto los últimos `diasDefecto` días. */
export function rango(args: Record<string, unknown>, hoyISO: string, diasDefecto: number): { desde: string; hasta: string } {
  let hasta = fecha(args.hasta) ?? hoyISO
  let desde = fecha(args.desde) ?? sumarDiasISO(hasta, -diasDefecto)
  if (desde > hasta) [desde, hasta] = [hasta, desde]
  return { desde, hasta }
}

/** Escapa lo que rompe el filtro `.or()`/`.ilike()` de PostgREST. */
export function terminoSeguro(s: string): string {
  return s.replace(/[%,()*\\]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * PostgREST corta en 1000 filas por request SIN IMPORTAR el .limit() pedido
 * (ya mordió varias veces en este repo), así que se pagina a mano. Tope
 * duro en PARAMETROS.maxFilasEscaneadas: si se alcanza, `truncado` avisa para
 * que el agente lo diga en vez de presentar un total parcial como completo.
 */
export async function traerPaginado<T>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<{ filas: T[]; truncado: boolean }> {
  const PAGE = 1000
  const filas: T[] = []
  for (let offset = 0; offset < PARAMETROS.maxFilasEscaneadas; offset += PAGE) {
    const { data, error } = await pagina(offset, offset + PAGE - 1)
    if (error) throw new Error(error.message)
    if (!data || data.length === 0) return { filas, truncado: false }
    filas.push(...data)
    if (data.length < PAGE) return { filas, truncado: false }
  }
  return { filas, truncado: true }
}

export const redondear = (n: number) => Math.round(n)

/** Corre `total` tareas de a `concurrencia` a la vez (no 90 requests simultáneas). */
export async function enLotes<T>(total: number, concurrencia: number, fn: (i: number) => Promise<T>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < total; i += concurrencia) {
    out.push(...await Promise.all(Array.from({ length: Math.min(concurrencia, total - i) }, (_, k) => fn(i + k))))
  }
  return out
}

export function mediana(xs: number[]): number | null {
  if (xs.length === 0) return null
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
