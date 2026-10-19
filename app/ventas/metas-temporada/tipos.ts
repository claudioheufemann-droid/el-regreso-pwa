// Plan de venta de la temporada (oct 2026 – mar 2027). Fuente única: la vista
// public.plan_metas_avance (security_invoker → hereda la RLS de
// plan_metas_semanales: el vendedor solo recibe sus filas, el admin todas).
// Esto es independiente de la tabla `metas` y del motor de /ventas/metas.

export const TEMPORADA = '2026-2027'

export type EstadoSemana = 'futura' | 'en_curso' | 'cerrada'
export type Semaforo = 'verde' | 'amarillo' | 'rojo'

export interface FilaMeta {
  id: number
  territorio: string
  userId: string
  vendedor: string
  semana: number
  fechaInicio: string
  fechaFin: string
  metaNeto: number
  metaLitros: number
  metaClientes: number
  metaCajasKombucha: number
  metaCajasCerveza: number
  metaBarriles: number
  realNeto: number
  realLitros: number
  realClientes: number
  realCajasKombucha: number
  realCajasCerveza: number
  realBarriles: number
  pctNeto: number
  pctLitros: number
  pctClientes: number
  estado: EstadoSemana
  /** Viene calculado de la vista (verde ≥95%, amarillo ≥80%, rojo <80%; null si es futura). No recalcular. */
  semaforo: Semaforo | null
}

export interface Acumulado {
  metaNeto: number
  realNeto: number
  metaLitros: number
  realLitros: number
  metaClientes: number
  realClientes: number
}

// ── Normalización ───────────────────────────────────────────────────────────

export type FilaVista = Record<string, string | number | null>

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0

/** Fila cruda de plan_metas_avance → FilaMeta (numeric de Postgres puede llegar como string). */
export function normalizarFila(r: FilaVista): FilaMeta {
  return {
    id: num(r.id),
    territorio: String(r.territorio ?? ''),
    userId: String(r.user_id),
    vendedor: String(r.vendedor ?? ''),
    semana: num(r.semana),
    fechaInicio: String(r.fecha_inicio),
    fechaFin: String(r.fecha_fin),
    metaNeto: num(r.meta_neto),
    metaLitros: num(r.meta_litros),
    metaClientes: num(r.meta_clientes_nuevos),
    metaCajasKombucha: num(r.meta_cajas_kombucha),
    metaCajasCerveza: num(r.meta_cajas_cerveza),
    metaBarriles: num(r.meta_barriles),
    realNeto: num(r.real_neto),
    realLitros: num(r.real_litros),
    realClientes: num(r.real_clientes_nuevos),
    realCajasKombucha: num(r.real_cajas_kombucha),
    realCajasCerveza: num(r.real_cajas_cerveza),
    realBarriles: num(r.real_barriles),
    pctNeto: num(r.pct_neto),
    pctLitros: num(r.pct_litros),
    pctClientes: num(r.pct_clientes),
    estado: String(r.estado_semana) as EstadoSemana,
    semaforo: (r.semaforo ?? null) as Semaforo | null,
  }
}

// ── Formato chileno ──────────────────────────────────────────────────────────

export const clp = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')
export const litros = (n: number) =>
  n.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const entero = (n: number) => Math.round(n).toLocaleString('es-CL')
/** Hacia abajo a propósito: un 94,6% no puede mostrarse "95%" con semáforo amarillo. */
export const pctTxt = (n: number) => Math.floor(n).toLocaleString('es-CL') + '%'
export const pct = (real: number, meta: number) => (meta > 0 ? (100 * real) / meta : 0)

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function partes(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return { y, m, d }
}

/** "12–18 oct" · "27 oct – 2 nov" */
export function rangoFechas(inicio: string, fin: string) {
  const a = partes(inicio)
  const b = partes(fin)
  if (a.m === b.m) return `${a.d}–${b.d} ${MESES[b.m - 1]}`
  return `${a.d} ${MESES[a.m - 1]} – ${b.d} ${MESES[b.m - 1]}`
}

/** "26 oct" */
export function fechaCorta(iso: string) {
  const a = partes(iso)
  return `${a.d} ${MESES[a.m - 1]}`
}

/** Días hábiles (lun–vie) desde `hoy` inclusive hasta `fin` inclusive. Fechas YYYY-MM-DD. */
export function diasHabilesRestantes(hoy: string, fin: string) {
  const h = partes(hoy)
  const f = partes(fin)
  const d = new Date(Date.UTC(h.y, h.m - 1, h.d))
  const end = Date.UTC(f.y, f.m - 1, f.d)
  let n = 0
  while (d.getTime() <= end) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) n++
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return n
}

// ── Lógica de temporada ──────────────────────────────────────────────────────

export const semanaEnCurso = (filas: FilaMeta[]) => filas.find(f => f.estado === 'en_curso') ?? null

/** Última semana a contar en el acumulado: la en curso, o la última cerrada si la temporada no tiene semana en curso. */
export function semanaTope(filas: FilaMeta[]) {
  const actual = semanaEnCurso(filas)
  if (actual) return actual.semana
  const cerradas = filas.filter(f => f.estado === 'cerrada')
  return cerradas.length ? Math.max(...cerradas.map(f => f.semana)) : 0
}

/** Semana que se muestra al abrir: la en curso; si no hay, la última cerrada; si la temporada no parte, la primera. */
export function semanaInicial(filas: FilaMeta[]) {
  const tope = semanaTope(filas)
  if (tope) return tope
  return filas.length ? Math.min(...filas.map(f => f.semana)) : 1
}

export function acumular(filas: FilaMeta[]): Acumulado {
  return filas.reduce<Acumulado>(
    (a, f) => ({
      metaNeto: a.metaNeto + f.metaNeto,
      realNeto: a.realNeto + f.realNeto,
      metaLitros: a.metaLitros + f.metaLitros,
      realLitros: a.realLitros + f.realLitros,
      metaClientes: a.metaClientes + f.metaClientes,
      realClientes: a.realClientes + f.realClientes,
    }),
    { metaNeto: 0, realNeto: 0, metaLitros: 0, realLitros: 0, metaClientes: 0, realClientes: 0 },
  )
}

export function acumuladoTemporada(filas: FilaMeta[]) {
  const tope = semanaTope(filas)
  return acumular(filas.filter(f => f.semana <= tope))
}

/** Las dos últimas semanas cerradas en rojo → hay que ajustar el plan con gerencia. */
export function dosRojasSeguidas(filas: FilaMeta[]) {
  const cerradas = filas.filter(f => f.estado === 'cerrada').sort((a, b) => a.semana - b.semana)
  if (cerradas.length < 2) return false
  return cerradas.slice(-2).every(f => f.semaforo === 'rojo')
}

// ── Alertas por color ────────────────────────────────────────────────────────
// Pedido de Claudio (15-oct-2026): todo % de avance se pinta con estos cortes,
// en números, barras y matriz: <50% rojo, 50–80% naranjo, ≥80% verde.
// Ojo: NO son los cortes del campo `semaforo` de la vista (95/80); ese campo se
// sigue usando solo para la alerta de "dos semanas cerradas bajo 80%".
// Colores: tokens --m-* definidos en globals.css (.metas-claro).

export type Nivel = 'verde' | 'naranjo' | 'rojo'

export const nivelPorPct = (p: number): Nivel => (p < 50 ? 'rojo' : p < 80 ? 'naranjo' : 'verde')

export const NIVEL_COLOR: Record<Nivel, string> = {
  verde: 'var(--m-verde)',
  naranjo: 'var(--m-naranjo)',
  rojo: 'var(--m-rojo)',
}

/** Tono vivo para barras, puntos y celdas de la matriz (no lleva texto encima). */
export const NIVEL_BARRA: Record<Nivel, string> = {
  verde: 'var(--m-verde-barra)',
  naranjo: 'var(--m-naranjo-barra)',
  rojo: 'var(--m-rojo-barra)',
}

export const NIVEL_FONDO: Record<Nivel, string> = {
  verde: 'var(--m-verde-suave)',
  naranjo: 'var(--m-naranjo-suave)',
  rojo: 'var(--m-rojo-suave)',
}

export const NIVEL_LABEL: Record<Nivel, string> = {
  verde: 'Buen avance',
  naranjo: 'En riesgo',
  rojo: 'Crítico',
}

export const colorPorPct = (p: number) => NIVEL_COLOR[nivelPorPct(p)]

/** Semana futura = sin nivel (todavía no hay nada que medir). */
export const nivelDeSemana = (f: FilaMeta): Nivel | null => (f.estado === 'futura' ? null : nivelPorPct(f.pctNeto))
