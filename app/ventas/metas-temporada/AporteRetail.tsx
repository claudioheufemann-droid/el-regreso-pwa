'use client'

import { Lock, Store } from 'lucide-react'
import {
  type Acumulado, type FilaMeta, type Escala, type RetailCorte,
  clp, litros, pct, pctTxt, acumular, nivelPorPct, NIVEL_COLOR, NIVEL_BARRA,
} from './tipos'
import { Barra, PctNivel, PorEntregar, Titulo, ORO } from './ui'

/**
 * Aporte del Retail a las metas — SÓLO gerencia (pedido de Claudio, 2026-11-04).
 *
 * Las metas del plan son de los 4 vendedores y el Retail no entra en ellas (y
 * debe seguir así). La estrategia es que el Retail sea el colchón cuando el
 * equipo no llega, así que acá se ve cuánto suma encima de la venta del equipo,
 * contra la MISMA meta. Los datos vienen de la RPC plan_metas_retail_aporte,
 * que no devuelve nada si quien pregunta no es admin; además la página sólo la
 * pide con isAdmin (apagado en "Ver como vendedor").
 */
export default function AporteRetail({
  retail, equipo, escala, elegido, nombre,
}: {
  /** Cortes del Retail en la escala elegida (semanas o meses 24→23). */
  retail: RetailCorte[]
  /** Filas de los 4 vendedores en la escala elegida. */
  equipo: FilaMeta[]
  escala: Escala
  elegido: number
  nombre: string
}) {
  const porCorte = new Map<number, FilaMeta[]>()
  for (const f of equipo) porCorte.set(f.semana, [...(porCorte.get(f.semana) ?? []), f])
  const retailPor = new Map(retail.map(r => [r.n, r]))

  const filas = [...porCorte.entries()]
    .map(([n, fs]) => ({ n, ref: fs[0], eq: acumular(fs), rt: retailPor.get(n) ?? null }))
    .sort((a, b) => a.n - b.n)
  const transcurridas = filas.filter(f => f.ref.estado !== 'futura')
  const actual = filas.find(f => f.n === elegido) ?? null
  const mes = escala === 'periodo'

  // Acumulado de lo transcurrido (en meses, Octubre usa el 24→23 completo: igual que el resto de la pantalla).
  const acumEq = acumular(transcurridas.flatMap(f => porCorte.get(f.n) ?? []))
  const acumRt = sumarRetail(transcurridas.map(f => f.rt))

  return (
    <section
      className="mb-5 rounded-[14px] border border-[var(--cc-line)] bg-[var(--cc-card-2)] p-4 md:p-5"
      aria-label="Aporte del Retail a las metas (sólo gerencia)"
    >
      <Titulo
        extra={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--cc-gold-soft)] px-3 py-1 text-[12px] font-bold text-[var(--m-oro-texto)]">
            <Lock size={12} /> Sólo gerencia · los vendedores no lo ven
          </span>
        }
      >
        <span className="inline-flex items-center gap-2">
          <Store size={18} className="text-[var(--cc-gold)]" />
          Colchón Retail
        </span>
      </Titulo>
      <p className="-mt-1 mb-4 text-[13px] font-medium text-[var(--cc-ink-2)]">
        Venta del Retail sumada encima del equipo, contra la misma meta. No entra en las metas de los vendedores.
      </p>

      {actual && actual.ref.estado !== 'futura' ? (
        <Bloque
          titulo={`${nombre}${actual.ref.estado === 'en_curso' ? ' · en curso' : ''}`}
          eq={actual.eq}
          rt={actual.rt}
        />
      ) : (
        <p className="py-2 text-[14px] font-medium text-[var(--cc-ink-2)]">
          {mes ? 'Este mes' : 'Esta semana'} todavía no parte: el aporte del Retail se ve desde su primer día.
        </p>
      )}

      {transcurridas.length > 0 && (
        <div className="mt-5 border-t border-[var(--cc-line)] pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
            <p className="text-[14px] font-bold text-[var(--cc-ink)]">{mes ? 'Mes a mes' : 'Semana a semana'}</p>
            <Leyenda />
          </div>
          <Tabla
            filas={transcurridas.map(f => ({ clave: f.n, etiqueta: f.ref.corto, eq: f.eq, rt: f.rt, marcada: f.n === elegido }))}
            total={{ etiqueta: 'Acum.', eq: acumEq, rt: acumRt }}
          />
        </div>
      )}
    </section>
  )
}

// ── Lo elegido: tres números ─────────────────────────────────────────────────

function Bloque({ titulo, eq, rt }: { titulo: string; eq: Acumulado; rt: RetailCorte | null }) {
  const rNeto = rt?.neto ?? 0
  const rLitros = rt?.litros ?? 0
  const pEq = pct(eq.realNeto, eq.metaNeto)
  const pTotal = pct(eq.realNeto + rNeto, eq.metaNeto)
  const pTotalL = pct(eq.realLitros + rLitros, eq.metaLitros)
  const falta = eq.metaNeto - eq.realNeto - rNeto
  const participacion = pct(rNeto, eq.realNeto + rNeto)
  const fuerte = 'font-bold text-[var(--cc-ink)]'

  return (
    <div>
      <p className="mb-3 text-[13px] font-bold uppercase tracking-[0.04em] text-[var(--cc-ink-3)]">{titulo}</p>
      <div className="grid grid-cols-1 divide-y divide-[var(--cc-line)] md:grid-cols-3 md:divide-x md:divide-y-0">
        <Celda etiqueta="Venta Retail">
          <p className="text-[26px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-[var(--cc-ink)]">{clp(rNeto)}</p>
          <p className="text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)]">
            <strong className={fuerte}>{litros(rLitros)} L</strong> · {pctTxt(participacion)} de la venta total
          </p>
          <PorEntregar monto={rt?.netoPorEntregar ?? 0} className="mt-1" />
        </Celda>

        <Celda etiqueta="Aporte a la meta">
          <p className="text-[26px] font-bold leading-tight tracking-[-0.02em] tabular-nums text-[var(--m-oro-texto)]">
            +{pctTxt(pct(rNeto, eq.metaNeto))}
          </p>
          <p className="text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)]">
            en $ · <strong className={fuerte}>+{pctTxt(pct(rLitros, eq.metaLitros))}</strong> en litros
          </p>
          <div className="mt-2"><Barra valor={pct(rNeto, eq.metaNeto)} alto={7} color={ORO} /></div>
        </Celda>

        <Celda etiqueta="Equipo + Retail">
          <p className="flex items-baseline gap-2 tabular-nums">
            <PctNivel valor={pTotal} className="text-[26px] leading-tight tracking-[-0.02em]" />
            <span className="text-[14px] font-medium text-[var(--cc-ink-2)]">
              equipo solo <span className="font-bold" style={{ color: NIVEL_COLOR[nivelPorPct(pEq)] }}>{pctTxt(pEq)}</span>
            </span>
          </p>
          <p className="text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)]">
            {clp(eq.realNeto + rNeto)} / {clp(eq.metaNeto)} · {pctTxt(pTotalL)} en litros
          </p>
          <div className="mt-2"><BarraDoble equipo={pEq} total={pTotal} /></div>
          <p className="mt-1.5 text-[13px] font-medium tabular-nums text-[var(--cc-ink-2)]">
            {falta > 0
              ? <>Aun con Retail faltan <strong className={fuerte}>{clp(falta)}</strong></>
              : <>Con Retail se cubre la meta{falta < 0 && <> y sobran <strong className={fuerte}>{clp(-falta)}</strong></>}</>}
          </p>
        </Celda>
      </div>
    </div>
  )
}

function Celda({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 py-3 first:pt-0 last:pb-0 md:px-5 md:py-0 md:first:pl-0 md:last:pr-0">
      <p className="mb-1 text-[14px] font-medium text-[var(--cc-ink-2)]">{etiqueta}</p>
      {children}
    </div>
  )
}

/** Barra apilada: tramo del equipo en color de nivel + tramo del Retail en dorado encima. */
function BarraDoble({ equipo, total, alto = 9 }: { equipo: number; total: number; alto?: number }) {
  const wEq = Math.max(0, Math.min(100, equipo))
  const wRt = Math.max(0, Math.min(100, total) - wEq)
  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-[var(--cc-neutral-soft)]"
      style={{ height: alto }}
      role="img"
      aria-label={`Equipo ${pctTxt(equipo)} más Retail ${pctTxt(Math.max(0, total - equipo))}`}
    >
      <div className="h-full transition-[width] duration-500" style={{ width: `${wEq}%`, background: NIVEL_BARRA[nivelPorPct(equipo)] }} />
      {/* Separador fino para que el tramo dorado se lea aparte aunque el equipo esté en verde/naranjo. */}
      <div
        className="h-full transition-[width] duration-500"
        style={{ width: `${wRt}%`, background: ORO, boxShadow: wEq > 0 && wRt > 0 ? 'inset 2px 0 0 var(--cc-card-2)' : undefined }}
      />
    </div>
  )
}

function Leyenda() {
  const punto = 'inline-block h-2 w-2 rounded-full'
  return (
    <span className="flex items-center gap-3 text-[12px] font-medium text-[var(--cc-ink-2)]">
      <span className="inline-flex items-center gap-1.5">
        {/* El tramo del equipo cambia de color según su avance (rojo/naranjo/verde). */}
        <span
          className="inline-block h-2 w-4 rounded-full"
          style={{ background: `linear-gradient(90deg, ${NIVEL_BARRA.rojo}, ${NIVEL_BARRA.naranjo}, ${NIVEL_BARRA.verde})` }}
        /> Equipo
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className={punto} style={{ background: ORO }} /> Retail
      </span>
    </span>
  )
}

// ── Tabla semana a semana ────────────────────────────────────────────────────

// Móvil: la meta va bajo la venta del equipo ("de $X") para no pasar de 4 columnas en 390px.
const COLS = 'grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_64px] md:grid-cols-[56px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_76px_72px_minmax(0,1.2fr)]'

interface FilaTabla { clave: number; etiqueta: string; eq: Acumulado; rt: RetailCorte | null; marcada: boolean }

function Tabla({ filas, total }: { filas: FilaTabla[]; total: { etiqueta: string; eq: Acumulado; rt: RetailCorte | null } }) {
  return (
    <div>
      <div className={`grid ${COLS} gap-x-3 border-b border-[var(--cc-line)] pb-1.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--cc-ink-3)]`}>
        <span />
        <span className="hidden md:block">Meta</span>
        <span>Equipo</span>
        <span>Retail</span>
        <span className="hidden md:block">% Equipo</span>
        <span className="hidden md:block">Aporte</span>
        <span className="text-right md:text-left">Con Retail</span>
      </div>
      {filas.map(f => <Linea key={f.clave} {...f} />)}
      <Linea clave={-1} etiqueta={total.etiqueta} eq={total.eq} rt={total.rt} marcada={false} total />
    </div>
  )
}

function Linea({ etiqueta, eq, rt, marcada, total = false }: FilaTabla & { total?: boolean }) {
  const rNeto = rt?.neto ?? 0
  const pEq = pct(eq.realNeto, eq.metaNeto)
  const pTotal = pct(eq.realNeto + rNeto, eq.metaNeto)
  return (
    <div
      className={`grid ${COLS} min-h-[44px] items-center gap-x-3 border-b border-[var(--cc-line-soft)] py-1.5 text-[13px] tabular-nums ${
        total ? 'border-t border-t-[var(--cc-line)] font-bold' : ''
      } ${marcada ? 'bg-[var(--cc-gold-soft)]' : ''}`}
    >
      <span className={`pl-1 font-bold ${marcada || total ? 'text-[var(--cc-ink)]' : 'text-[var(--cc-ink-2)]'}`}>{etiqueta}</span>
      <span className="hidden truncate font-medium text-[var(--cc-ink-2)] md:block">{clp(eq.metaNeto)}</span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold text-[var(--cc-ink)]">{clp(eq.realNeto)}</span>
        <span className="truncate text-[12px] font-medium text-[var(--cc-ink-2)]">
          <span className="hidden md:inline">{litros(eq.realLitros)} L</span>
          <span className="md:hidden">de {clp(eq.metaNeto)}</span>
        </span>
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-bold text-[var(--cc-ink)]">{clp(rNeto)}</span>
        <span className="truncate text-[12px] font-medium text-[var(--cc-ink-2)]">
          {litros(rt?.litros ?? 0)} L<span className="md:hidden"> · +{pctTxt(pct(rNeto, eq.metaNeto))}</span>
        </span>
      </span>
      <span className="hidden md:block"><PctNivel valor={pEq} /></span>
      <span className="hidden font-bold text-[var(--m-oro-texto)] md:block">+{pctTxt(pct(rNeto, eq.metaNeto))}</span>
      <span className="flex items-center justify-end gap-3 md:justify-start">
        <span className="hidden flex-1 md:block"><BarraDoble equipo={pEq} total={pTotal} alto={7} /></span>
        <span className="flex flex-col items-end md:block">
          <PctNivel valor={pTotal} />
          <span className="text-[11px] font-medium text-[var(--cc-ink-3)] md:hidden">eq. {pctTxt(pEq)}</span>
          <span className="mt-1 block w-[56px] md:hidden"><BarraDoble equipo={pEq} total={pTotal} alto={4} /></span>
        </span>
      </span>
    </div>
  )
}

function sumarRetail(cortes: (RetailCorte | null)[]): RetailCorte {
  return cortes.reduce<RetailCorte>(
    (a, r) => (r ? { ...a, neto: a.neto + r.neto, netoPorEntregar: a.netoPorEntregar + r.netoPorEntregar, litros: a.litros + r.litros } : a),
    { tipo: 'semana', n: 0, fechaInicio: '', fechaFin: '', neto: 0, netoPorEntregar: 0, litros: 0 },
  )
}
