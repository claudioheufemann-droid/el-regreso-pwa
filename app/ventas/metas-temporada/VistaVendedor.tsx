'use client'

import { useState } from 'react'
import { AlertTriangle, ChevronDown, Coins, Droplets, UserPlus, Target, CalendarClock } from 'lucide-react'
import {
  type FilaMeta, type Semaforo,
  clp, litros, entero, pctTxt, pct, rangoFechas, diasHabilesRestantes,
  semanaEnCurso, acumuladoTemporada, acumular, dosRojasSeguidas,
  SEMAFORO_COLOR, SEMAFORO_FONDO, SEMAFORO_LABEL,
} from './tipos'

/**
 * Pantalla de metas de UN vendedor. La usa el vendedor (sus filas vienen ya
 * acotadas por RLS) y el admin al elegir a alguien en el selector — así el
 * admin ve exactamente lo mismo que esa persona.
 */
export default function VistaVendedor({ filas, hoy }: { filas: FilaMeta[]; hoy: string }) {
  const semanas = [...filas].sort((a, b) => a.semana - b.semana)
  const actual = semanaEnCurso(semanas)
  const [abierta, setAbierta] = useState<number | null>(actual?.semana ?? null)

  if (semanas.length === 0) return <SinMetas />

  const acumulado = acumuladoTemporada(semanas)
  const total = acumular(semanas)

  return (
    <div className="flex flex-col gap-3">
      {dosRojasSeguidas(semanas) && <AlertaRojas />}

      {actual ? <HeroSemana fila={actual} hoy={hoy} /> : <SinSemanaEnCurso filas={semanas} />}

      <AcumuladoCard acumulado={acumulado} metaTotalNeto={total.metaNeto} metaTotalLitros={total.metaLitros} hasta={actual?.semana ?? null} />

      <section>
        <h2 className="mb-2 mt-2 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
          Semanas de la temporada
        </h2>
        <div className="flex flex-col gap-1.5">
          {semanas.map(f => (
            <FilaSemana
              key={f.id}
              fila={f}
              abierta={abierta === f.semana}
              onToggle={() => setAbierta(abierta === f.semana ? null : f.semana)}
            />
          ))}
        </div>
      </section>
    </div>
  )
}

// ── Piezas ───────────────────────────────────────────────────────────────────

export function ChipSemaforo({ semaforo }: { semaforo: Semaforo | null }) {
  if (!semaforo) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold"
      style={{ background: SEMAFORO_FONDO[semaforo], color: SEMAFORO_COLOR[semaforo] }}
    >
      <span className="size-1.5 rounded-full" style={{ background: SEMAFORO_COLOR[semaforo] }} />
      {SEMAFORO_LABEL[semaforo]}
    </span>
  )
}

export function Punto({ semaforo }: { semaforo: Semaforo | null }) {
  return (
    <span
      aria-label={semaforo ? SEMAFORO_LABEL[semaforo] : 'Futura'}
      className="size-2.5 shrink-0 rounded-full"
      style={{ background: semaforo ? SEMAFORO_COLOR[semaforo] : 'rgba(255,255,255,0.12)' }}
    />
  )
}

export function Barra({ valor, color = 'var(--gold)', alto = 6 }: { valor: number; color?: string; alto?: number }) {
  const w = Math.max(0, Math.min(100, valor))
  return (
    <div className="w-full overflow-hidden rounded-full bg-white/[0.06]" style={{ height: alto }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${w}%`, background: color }} />
    </div>
  )
}

function AlertaRojas() {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-[14px] border px-3.5 py-3"
      style={{ background: 'rgba(248,113,113,0.08)', borderColor: 'rgba(248,113,113,0.3)' }}
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--red)]" />
      <p className="text-[13px] leading-snug text-[var(--cream)]">
        <strong className="font-bold">Dos semanas cerradas seguidas en rojo.</strong>{' '}
        Coordina una llamada con la gerencia comercial para ajustar el plan.
      </p>
    </div>
  )
}

function Indicador({
  icono, etiqueta, real, meta, porcentaje, color, grande,
}: {
  icono: React.ReactNode; etiqueta: string; real: string; meta: string; porcentaje: number; color: string; grande?: boolean
}) {
  return (
    <div className="min-w-0 rounded-xl bg-[var(--surface2)] p-3">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">
          {icono}
          {etiqueta}
        </span>
        <span className="shrink-0 whitespace-nowrap text-[13px] font-extrabold tabular-nums" style={{ color }}>{pctTxt(porcentaje)}</span>
      </div>
      <p className={`${grande ? 'text-[28px]' : 'text-[20px]'} truncate font-black leading-none tracking-[-0.03em] tabular-nums text-[var(--cream)]`}>
        {real}
      </p>
      <p className="mb-2 mt-1 truncate text-[12px] tabular-nums text-[var(--muted)]">de {meta}</p>
      <Barra valor={porcentaje} color={color} />
    </div>
  )
}

function HeroSemana({ fila, hoy }: { fila: FilaMeta; hoy: string }) {
  const color = fila.semaforo ? SEMAFORO_COLOR[fila.semaforo] : 'var(--gold)'
  const falta = Math.max(0, fila.metaNeto - fila.realNeto)
  // La vista decide "en curso" con CURRENT_DATE del servidor (UTC); de noche en
  // Chile ya puede ser el día siguiente allá. Nunca contar antes del inicio.
  const dias = diasHabilesRestantes(hoy > fila.fechaInicio ? hoy : fila.fechaInicio, fila.fechaFin)

  let ritmo: React.ReactNode
  if (falta === 0) {
    ritmo = <>Meta de plata cumplida. Todo lo que vendas desde ahora suma al acumulado.</>
  } else if (dias > 0) {
    ritmo = (
      <>
        Te faltan <strong className="text-[var(--cream)]">{clp(falta)}</strong>: vende{' '}
        <strong className="text-[var(--cream)]">{clp(falta / dias)}</strong> por día hábil
        {' '}({dias} {dias === 1 ? 'día' : 'días'} hábiles {dias === 1 ? 'queda' : 'quedan'}).
      </>
    )
  } else {
    ritmo = (
      <>
        Te faltan <strong className="text-[var(--cream)]">{clp(falta)}</strong> y no quedan días hábiles esta semana.
      </>
    )
  }

  return (
    <section
      className="rounded-[18px] border p-4"
      style={{
        background: 'linear-gradient(160deg, rgba(212,175,55,0.08), var(--surface) 55%)',
        borderColor: 'rgba(212,175,55,0.18)',
      }}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gold)]">Semana en curso</p>
          <p className="mt-0.5 text-[20px] font-black tracking-[-0.02em] text-[var(--cream)]">
            S{fila.semana} <span className="text-[15px] font-semibold text-[var(--muted)]">· {rangoFechas(fila.fechaInicio, fila.fechaFin)}</span>
          </p>
        </div>
        <ChipSemaforo semaforo={fila.semaforo} />
      </div>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-3">
        <div className="col-span-2 lg:col-span-1">
          <Indicador
            icono={<Coins size={13} />} etiqueta="Plata (neto)"
            real={clp(fila.realNeto)} meta={clp(fila.metaNeto)} porcentaje={fila.pctNeto} color={color} grande
          />
        </div>
        <Indicador
          icono={<Droplets size={13} />} etiqueta="Litros"
          real={litros(fila.realLitros)} meta={`${litros(fila.metaLitros)} L`} porcentaje={fila.pctLitros} color="var(--blue)"
        />
        <Indicador
          icono={<UserPlus size={13} />} etiqueta="Nuevos"
          real={entero(fila.realClientes)} meta={`${entero(fila.metaClientes)} clientes nuevos`} porcentaje={fila.pctClientes} color="var(--green)"
        />
      </div>

      <p className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-[var(--muted)]">
        <CalendarClock size={15} className="mt-0.5 shrink-0 text-[var(--gold)]" />
        <span>{ritmo}</span>
      </p>
    </section>
  )
}

function SinSemanaEnCurso({ filas }: { filas: FilaMeta[] }) {
  const futuras = filas.filter(f => f.estado === 'futura')
  const texto = futuras.length === filas.length
    ? `La temporada parte el ${rangoFechas(filas[0].fechaInicio, filas[0].fechaInicio)}.`
    : 'La temporada terminó. Este es tu resultado final.'
  return (
    <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gold)]">Sin semana en curso</p>
      <p className="mt-1 text-[14px] text-[var(--cream)]">{texto}</p>
    </section>
  )
}

function AcumuladoCard({
  acumulado: a, metaTotalNeto, metaTotalLitros, hasta,
}: {
  acumulado: ReturnType<typeof acumuladoTemporada>; metaTotalNeto: number; metaTotalLitros: number; hasta: number | null
}) {
  const pNeto = pct(a.realNeto, a.metaNeto)
  const pTemporada = pct(a.realNeto, metaTotalNeto)
  return (
    <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
          Acumulado temporada{hasta ? ` · S1–S${hasta}` : ''}
        </p>
        <span className="text-[13px] font-extrabold tabular-nums text-[var(--gold)]">{pctTxt(pNeto)}</span>
      </div>

      <p className="text-[24px] font-black leading-none tracking-[-0.03em] tabular-nums text-[var(--cream)]">{clp(a.realNeto)}</p>
      <p className="mb-2 mt-1 text-[12px] tabular-nums text-[var(--muted)]">de {clp(a.metaNeto)} a la fecha</p>
      <Barra valor={pNeto} />

      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-lg bg-[var(--surface2)] px-3 py-2">
          <p className="text-[var(--muted)]">Litros</p>
          <p className="font-bold tabular-nums text-[var(--cream)]">
            {litros(a.realLitros)} <span className="font-medium text-[var(--muted)]">/ {litros(a.metaLitros)}</span>
          </p>
        </div>
        <div className="rounded-lg bg-[var(--surface2)] px-3 py-2">
          <p className="text-[var(--muted)]">Clientes nuevos</p>
          <p className="font-bold tabular-nums text-[var(--cream)]">
            {entero(a.realClientes)} <span className="font-medium text-[var(--muted)]">/ {entero(a.metaClientes)}</span>
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-start gap-2 border-t border-[var(--border-subtle)] pt-3">
        <Target size={15} className="mt-0.5 shrink-0 text-[var(--gold)]" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--muted)]">
            Meta total temporada (S1–S25):{' '}
            <strong className="tabular-nums text-[var(--cream)]">{clp(metaTotalNeto)}</strong>
            {' '}· {litros(metaTotalLitros)} L
          </p>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="flex-1"><Barra valor={pTemporada} alto={4} color="rgba(212,175,55,0.55)" /></div>
            <span className="text-[11px] tabular-nums text-[var(--muted)]">{pctTxt(pTemporada)} hecho</span>
          </div>
        </div>
      </div>
    </section>
  )
}

function FilaSemana({ fila, abierta, onToggle }: { fila: FilaMeta; abierta: boolean; onToggle: () => void }) {
  const futura = fila.estado === 'futura'
  const enCurso = fila.estado === 'en_curso'
  const detalleId = `semana-${fila.id}`

  return (
    <div
      className={`shrink-0 rounded-[14px] border ${futura ? 'opacity-55' : ''}`}
      style={{
        background: 'var(--surface)',
        borderColor: enCurso ? 'rgba(212,175,55,0.35)' : 'var(--border-subtle)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={abierta}
        aria-controls={detalleId}
        className="flex min-h-[52px] w-full items-center gap-3 px-3 py-2 text-left"
      >
        <span
          className="w-9 shrink-0 text-[14px] font-black tabular-nums"
          style={{ color: enCurso ? 'var(--gold)' : 'var(--cream)' }}
        >
          S{fila.semana}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12px] text-[var(--muted)]">
            {rangoFechas(fila.fechaInicio, fila.fechaFin)}{enCurso ? ' · en curso' : ''}
          </span>
          <span className="block truncate text-[13px] tabular-nums text-[var(--cream)]">
            {futura ? (
              <>Meta {clp(fila.metaNeto)}</>
            ) : (
              <>
                <strong className="font-bold">{clp(fila.realNeto)}</strong>
                <span className="text-[var(--muted)]"> / {clp(fila.metaNeto)}</span>
              </>
            )}
          </span>
        </span>
        {!futura && (
          <span
            className="w-11 shrink-0 text-right text-[13px] font-extrabold tabular-nums"
            style={{ color: fila.semaforo ? SEMAFORO_COLOR[fila.semaforo] : 'var(--cream)' }}
          >
            {pctTxt(fila.pctNeto)}
          </span>
        )}
        <Punto semaforo={fila.semaforo} />
        <ChevronDown
          size={16}
          className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${abierta ? 'rotate-180' : ''}`}
        />
      </button>

      {abierta && (
        <div id={detalleId} className="border-t border-[var(--border-subtle)] px-3 pb-3 pt-2">
          <DetalleFormato etiqueta="Cajas kombucha" meta={fila.metaCajasKombucha} real={fila.realCajasKombucha} futura={futura} />
          <DetalleFormato etiqueta="Cajas cerveza lata" meta={fila.metaCajasCerveza} real={fila.realCajasCerveza} futura={futura} />
          <DetalleFormato etiqueta="Barriles" meta={fila.metaBarriles} real={fila.realBarriles} futura={futura} />
          <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
            <p className="text-[var(--muted)]">
              Litros{' '}
              <span className="tabular-nums text-[var(--cream)]">
                {futura ? litros(fila.metaLitros) : `${litros(fila.realLitros)} / ${litros(fila.metaLitros)}`}
              </span>
            </p>
            <p className="text-right text-[var(--muted)]">
              Clientes nuevos{' '}
              <span className="tabular-nums text-[var(--cream)]">
                {futura ? entero(fila.metaClientes) : `${entero(fila.realClientes)} / ${entero(fila.metaClientes)}`}
              </span>
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function DetalleFormato({ etiqueta, meta, real, futura }: { etiqueta: string; meta: number; real: number; futura: boolean }) {
  const p = pct(real, meta)
  return (
    <div className="py-1.5">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-[12px]">
        <span className="text-[var(--muted)]">{etiqueta}</span>
        <span className="tabular-nums text-[var(--cream)]">
          {futura ? (
            <>Meta <strong>{entero(meta)}</strong></>
          ) : (
            <>
              <strong>{litros(real)}</strong>
              <span className="text-[var(--muted)]"> / {entero(meta)}</span>
              <span className="ml-2 font-bold text-[var(--gold)]">{pctTxt(p)}</span>
            </>
          )}
        </span>
      </div>
      {!futura && <Barra valor={p} alto={4} />}
    </div>
  )
}

function SinMetas() {
  return (
    <div className="flex flex-col items-center rounded-[18px] border border-[var(--border)] bg-[var(--surface)] px-6 py-10 text-center">
      <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-[var(--gold-dim)]">
        <Target size={22} className="text-[var(--gold)]" />
      </div>
      <p className="text-[15px] font-bold text-[var(--cream)]">No tienes metas cargadas para esta temporada</p>
      <p className="mt-1 max-w-[300px] text-[13px] text-[var(--muted)]">
        El plan de venta oct 2026 – mar 2027 se asigna por vendedor. Si crees que es un error, avísale a la gerencia comercial.
      </p>
    </div>
  )
}
