'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Download } from 'lucide-react'
import {
  type FilaMeta, type Acumulado,
  clp, entero, pctTxt, pct, diasHabilesRestantes, colorPorPct,
  semanaEnCurso, semanaTope, acumular, acumuladoTemporada,
  SEMAFORO_COLOR, SEMAFORO_LABEL,
} from './tipos'
import {
  Barra, EncabezadoSemana, Indicadores, indicadoresDe, LineaRitmo,
  FranjaAcumulado, PieTemporada, Titulo,
} from './ui'

export interface VendedorPlan {
  userId: string
  vendedor: string
  territorio: string
  filas: FilaMeta[]
}

interface FilaRanking extends VendedorPlan {
  actual: FilaMeta | null
  acum: Acumulado
}

type Orden = 'semana' | 'acumulado'

export default function VistaEquipo({
  vendedores, hoy, onElegir,
}: {
  vendedores: VendedorPlan[]; hoy: string; onElegir: (userId: string) => void
}) {
  const todas = vendedores.flatMap(v => v.filas)
  const tope = semanaTope(todas)
  const semanaRef = semanaEnCurso(todas)

  const ranking: FilaRanking[] = useMemo(
    () => vendedores.map(v => ({ ...v, actual: semanaEnCurso(v.filas), acum: acumuladoTemporada(v.filas) })),
    [vendedores],
  )

  const [orden, setOrden] = useState<Orden>('semana')
  const [desc, setDesc] = useState(true)
  const ordenado = useMemo(() => {
    const valor = (r: FilaRanking) => (orden === 'semana' ? r.actual?.pctNeto ?? -1 : pct(r.acum.realNeto, r.acum.metaNeto))
    return [...ranking].sort((a, b) => (desc ? valor(b) - valor(a) : valor(a) - valor(b)))
  }, [ranking, orden, desc])

  const cambiarOrden = (o: Orden) => {
    if (o === orden) setDesc(!desc)
    else { setOrden(o); setDesc(true) }
  }

  const semanaEquipo = acumular(ranking.flatMap(r => (r.actual ? [r.actual] : [])))
  const acumEquipo = acumular(todas.filter(f => f.semana <= tope))
  const total = acumular(todas)

  return (
    <div className="flex flex-col">
      {semanaRef && (
        <section className="pb-5">
          {/* El equipo no tiene semáforo propio en la vista: sin chip, % con los mismos cortes. */}
          <EncabezadoSemana prefijo="Equipo · " fila={{ ...semanaRef, semaforo: null }} />
          <Indicadores items={indicadoresDe(semanaEquipo, colorPorPct(pct(semanaEquipo.realNeto, semanaEquipo.metaNeto)))} />
          <LineaRitmo
            falta={semanaEquipo.metaNeto - semanaEquipo.realNeto}
            dias={diasHabilesRestantes(hoy > semanaRef.fechaInicio ? hoy : semanaRef.fechaInicio, semanaRef.fechaFin)}
          />
        </section>
      )}

      <section className="border-t border-[var(--cc-line)] pb-5 pt-5">
        <Titulo
          extra={
            <div className="flex items-center gap-1">
              <BotonOrden activo={orden === 'semana'} desc={desc} onClick={() => cambiarOrden('semana')}>% semana</BotonOrden>
              <BotonOrden activo={orden === 'acumulado'} desc={desc} onClick={() => cambiarOrden('acumulado')}>% acumulado</BotonOrden>
              <button
                type="button"
                onClick={() => exportarCsv(ordenado)}
                className="ml-1 inline-flex min-h-[34px] items-center gap-1.5 rounded-[8px] border border-[var(--cc-line)] px-3 text-[12px] font-semibold text-[var(--cc-ink)] hover:bg-[var(--cc-card-2)]"
              >
                <Download size={13} className="text-[var(--cc-gold)]" /> CSV
              </button>
            </div>
          }
        >
          Ranking por vendedor
        </Titulo>
        <TablaRanking ranking={ordenado} onElegir={onElegir} />
      </section>

      <MatrizSemaforos ranking={ordenado} semanaActual={semanaRef?.semana ?? null} onElegir={onElegir} />

      <FranjaAcumulado a={acumEquipo} etiqueta="Acumulado del equipo a la fecha" />
      <PieTemporada metaNeto={total.metaNeto} metaLitros={total.metaLitros} realNeto={acumEquipo.realNeto} />
    </div>
  )
}

function BotonOrden({ activo, desc, onClick, children }: { activo: boolean; desc: boolean; onClick: () => void; children: React.ReactNode }) {
  const Flecha = desc ? ArrowDown : ArrowUp
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="inline-flex min-h-[34px] items-center gap-1 rounded-[8px] px-2.5 text-[12px] font-semibold transition-colors"
      style={{
        background: activo ? 'var(--cc-gold-soft)' : 'transparent',
        color: activo ? 'var(--cc-gold-deep)' : 'var(--cc-ink-2)',
      }}
    >
      {children}
      {activo && <Flecha size={12} />}
    </button>
  )
}

// ── Ranking ──────────────────────────────────────────────────────────────────

const COLS_RANKING =
  'grid-cols-[20px_minmax(0,1fr)_auto_16px] md:grid-cols-[24px_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_72px_minmax(0,1.1fr)_64px_20px]'

function TablaRanking({ ranking, onElegir }: { ranking: FilaRanking[]; onElegir: (id: string) => void }) {
  return (
    <div>
      <div className={`hidden ${COLS_RANKING} gap-x-4 border-b border-[var(--cc-line)] px-3 pb-2 text-[11px] text-[var(--cc-ink-3)] md:grid`}>
        <span>#</span><span>Vendedor</span><span>Semana · Ventas / Meta</span><span /><span>Avance</span>
        <span>Acumulado temporada</span><span className="text-right">Clientes</span><span />
      </div>
      {ranking.map((r, i) => {
        const a = r.actual
        const sem = a?.semaforo ?? null
        const pAcum = pct(r.acum.realNeto, r.acum.metaNeto)
        return (
          <button
            key={r.userId}
            type="button"
            onClick={() => onElegir(r.userId)}
            className={`grid w-full ${COLS_RANKING} min-h-[56px] items-center gap-x-4 border-b border-[var(--cc-line-soft)] px-3 py-2 text-left hover:bg-[var(--cc-card-2)] md:min-h-[44px] md:py-1.5`}
          >
            <span className="text-[13px] font-semibold tabular-nums text-[var(--cc-ink-3)]">{i + 1}</span>

            <span className="flex min-w-0 flex-col md:contents">
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-[var(--cc-ink)]">{r.vendedor}</span>
                <span className="block truncate text-[12px] text-[var(--cc-ink-2)]">{r.territorio}</span>
              </span>
              <span className="truncate text-[13px] tabular-nums text-[var(--cc-ink-2)]">
                {a ? <><strong className="font-semibold text-[var(--cc-ink)]">{clp(a.realNeto)}</strong> / {clp(a.metaNeto)}</> : '—'}
              </span>
              <span className="hidden md:block">{a && <Barra valor={a.pctNeto} alto={6} />}</span>
              {/* En móvil, el acumulado va en una tercera línea */}
              <span className="truncate text-[11px] tabular-nums text-[var(--cc-ink-3)] md:hidden">
                Acum. {clp(r.acum.realNeto)} · {pctTxt(pAcum)}
              </span>
            </span>

            <span className="flex flex-col items-end gap-0.5 md:items-start">
              <span
                className="flex items-center gap-1.5 text-[13px] font-semibold tabular-nums"
                style={{ color: sem ? SEMAFORO_COLOR[sem] : 'var(--cc-ink-3)' }}
                title={sem ? SEMAFORO_LABEL[sem] : undefined}
              >
                <span className="size-2 rounded-full" style={{ background: sem ? SEMAFORO_COLOR[sem] : 'var(--cc-neutral)' }} />
                {a ? pctTxt(a.pctNeto) : '—'}
              </span>
              <span className="text-[11px] tabular-nums text-[var(--cc-ink-3)] md:hidden">
                {a ? `${entero(a.realClientes)}/${entero(a.metaClientes)} nuevos` : ''}
              </span>
            </span>

            <span className="hidden truncate text-[13px] tabular-nums text-[var(--cc-ink-2)] md:block">
              <strong className="font-semibold text-[var(--cc-ink)]">{clp(r.acum.realNeto)}</strong> · {pctTxt(pAcum)}
            </span>
            <span className="hidden text-right text-[13px] tabular-nums text-[var(--cc-ink)] md:block">
              {a ? <>{entero(a.realClientes)}<span className="text-[var(--cc-ink-3)]">/{entero(a.metaClientes)}</span></> : '—'}
            </span>
            <ChevronRight size={16} className="justify-self-end text-[var(--cc-ink-3)]" />
          </button>
        )
      })}
    </div>
  )
}

// ── Matriz de semáforos ──────────────────────────────────────────────────────

const MARCAS = new Set([1, 5, 10, 15, 20, 25])

function MatrizSemaforos({
  ranking, semanaActual, onElegir,
}: {
  ranking: FilaRanking[]; semanaActual: number | null; onElegir: (userId: string) => void
}) {
  const numSemanas = Math.max(25, ...ranking.flatMap(r => r.filas.map(f => f.semana)))
  const semanas = Array.from({ length: numSemanas }, (_, i) => i + 1)
  const columnas = `minmax(64px, 140px) repeat(${numSemanas}, minmax(0, 1fr))`

  return (
    <section className="border-t border-[var(--cc-line)] pb-5 pt-5">
      <Titulo
        extra={
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--cc-ink-2)]">
            {(['verde', 'amarillo', 'rojo'] as const).map(s => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px]" style={{ background: SEMAFORO_COLOR[s] }} />
                {s === 'verde' ? '≥95%' : s === 'amarillo' ? '80–95%' : '<80%'}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-[2px] bg-[var(--cc-neutral-soft)]" /> Futura
            </span>
          </div>
        }
      >
        Semáforo por semana
      </Titulo>

      <div className="grid items-center gap-[2px] md:gap-[3px]" style={{ gridTemplateColumns: columnas }}>
        <span />
        {semanas.map(s => (
          <span
            key={s}
            className="flex justify-center overflow-visible whitespace-nowrap text-[10px] tabular-nums"
            style={{ color: s === semanaActual ? 'var(--cc-gold-deep)' : 'var(--cc-ink-3)', fontWeight: s === semanaActual ? 700 : 400 }}
          >
            {s === semanaActual || (MARCAS.has(s) && (semanaActual === null || Math.abs(s - semanaActual) > 2)) ? s : ''}
          </span>
        ))}

        {ranking.map(r => {
          const porSemana = new Map(r.filas.map(f => [f.semana, f]))
          return (
            <FilaMatriz key={r.userId} r={r} onElegir={onElegir}>
              {semanas.map(s => {
                const f = porSemana.get(s)
                const sem = f?.semaforo ?? null
                return (
                  <span
                    key={s}
                    title={f ? `S${s} · ${sem ? `${pctTxt(f.pctNeto)} · ${SEMAFORO_LABEL[sem]}` : 'futura'}` : `S${s} · sin meta`}
                    className="h-5 rounded-[3px] md:h-6"
                    style={{
                      background: sem ? SEMAFORO_COLOR[sem] : 'var(--cc-neutral-soft)',
                      outline: s === semanaActual ? '1.5px solid var(--cc-gold)' : undefined,
                      outlineOffset: 1,
                    }}
                  />
                )
              })}
            </FilaMatriz>
          )
        })}
      </div>
    </section>
  )
}

function FilaMatriz({ r, onElegir, children }: { r: FilaRanking; onElegir: (userId: string) => void; children: React.ReactNode }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onElegir(r.userId)}
        className="min-h-[32px] truncate pr-2 text-left text-[12px] font-semibold text-[var(--cc-ink)] md:text-[13px]"
        title={`${r.vendedor} · ${r.territorio}`}
      >
        {r.vendedor.split(' ')[0]}
      </button>
      {children}
    </>
  )
}

// ── CSV (reporte del viernes) ────────────────────────────────────────────────

function exportarCsv(ranking: FilaRanking[]) {
  // Separador ';' y coma decimal: es lo que abre bien un Excel en es-CL.
  const dec = (n: number) => (Math.round(n * 10) / 10).toString().replace('.', ',')
  const encabezado = [
    'Territorio', 'Vendedor', 'Semana', 'Desde', 'Hasta',
    'Meta neto', 'Real neto', '% neto', 'Meta litros', 'Real litros', '% litros',
    'Meta clientes nuevos', 'Real clientes nuevos', 'Semaforo',
    'Acum meta neto', 'Acum real neto', 'Acum % neto',
  ]
  const filas = ranking.map(r => {
    const a = r.actual
    return [
      r.territorio, r.vendedor, a ? `S${a.semana}` : '', a?.fechaInicio ?? '', a?.fechaFin ?? '',
      a ? Math.round(a.metaNeto) : '', a ? Math.round(a.realNeto) : '', a ? dec(a.pctNeto) : '',
      a ? dec(a.metaLitros) : '', a ? dec(a.realLitros) : '', a ? dec(a.pctLitros) : '',
      a?.metaClientes ?? '', a?.realClientes ?? '', a?.semaforo ?? '',
      Math.round(r.acum.metaNeto), Math.round(r.acum.realNeto), dec(pct(r.acum.realNeto, r.acum.metaNeto)),
    ]
  })
  const escapar = (v: string | number) => {
    const s = String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [encabezado, ...filas].map(f => f.map(escapar).join(';')).join('\r\n')
  const semana = ranking.find(r => r.actual)?.actual?.semana
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `metas-temporada-${semana ? `S${semana}` : 'equipo'}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
