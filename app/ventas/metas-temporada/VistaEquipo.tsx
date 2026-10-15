'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronRight, Download } from 'lucide-react'
import {
  type FilaMeta, type Acumulado,
  clp, litros, entero, pctTxt, pct, rangoFechas,
  semanaEnCurso, semanaTope, acumular, acumuladoTemporada,
  SEMAFORO_COLOR, SEMAFORO_LABEL,
} from './tipos'
import { Barra, ChipSemaforo, Punto } from './VistaVendedor'

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
  vendedores, onElegir,
}: {
  vendedores: VendedorPlan[]; onElegir: (userId: string) => void
}) {
  const todas = vendedores.flatMap(v => v.filas)
  const tope = semanaTope(todas)
  const actualSemana = semanaEnCurso(todas)

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
  const metaTemporada = acumular(todas).metaNeto

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ResumenCard
          titulo={actualSemana ? `Equipo · S${actualSemana.semana}` : 'Equipo · sin semana en curso'}
          subtitulo={actualSemana ? rangoFechas(actualSemana.fechaInicio, actualSemana.fechaFin) : ''}
          a={semanaEquipo}
        />
        <ResumenCard
          titulo={`Acumulado temporada${tope ? ` · S1–S${tope}` : ''}`}
          subtitulo=""
          pie={`Meta total temporada (S1–S25): ${clp(metaTemporada)}`}
          a={acumEquipo}
        />
      </div>

      <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-3 lg:p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Ranking por vendedor</h2>
          <div className="flex flex-wrap items-center gap-1.5">
            <BotonOrden activo={orden === 'semana'} desc={desc} onClick={() => cambiarOrden('semana')}>% semana</BotonOrden>
            <BotonOrden activo={orden === 'acumulado'} desc={desc} onClick={() => cambiarOrden('acumulado')}>% acumulado</BotonOrden>
            <button
              type="button"
              onClick={() => exportarCsv(ordenado)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-[var(--border)] px-3 text-[12px] font-semibold text-[var(--cream)] active:scale-[0.97]"
            >
              <Download size={14} className="text-[var(--gold)]" /> CSV
            </button>
          </div>
        </div>

        {/* Móvil: tarjetas (nada de tablas anchas con scroll horizontal) */}
        <div className="flex flex-col gap-2 lg:hidden">
          {ordenado.map((r, i) => (
            <TarjetaVendedor key={r.userId} r={r} posicion={i + 1} onClick={() => onElegir(r.userId)} />
          ))}
        </div>

        {/* Escritorio: tabla */}
        <table className="hidden w-full text-left text-[13px] lg:table">
          <thead>
            <tr className="text-[11px] uppercase tracking-[0.06em] text-[var(--muted)]">
              <th className="px-2 py-2 font-semibold">#</th>
              <th className="px-2 py-2 font-semibold">Vendedor</th>
              <th className="px-2 py-2 font-semibold">Territorio</th>
              <th className="px-2 py-2 text-right font-semibold">Semana real / meta</th>
              <th className="px-2 py-2 text-right font-semibold">%</th>
              <th className="px-2 py-2 font-semibold">Semáforo</th>
              <th className="px-2 py-2 text-right font-semibold">Acumulado</th>
              <th className="px-2 py-2 text-right font-semibold">Clientes nuevos</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {ordenado.map((r, i) => (
              <tr
                key={r.userId}
                onClick={() => onElegir(r.userId)}
                className="cursor-pointer border-t border-[var(--border-subtle)] transition-colors hover:bg-[var(--gold-hover)]"
              >
                <td className="px-2 py-2.5 font-bold tabular-nums text-[var(--muted)]">{i + 1}</td>
                <td className="px-2 py-2.5 font-bold text-[var(--cream)]">{r.vendedor}</td>
                <td className="px-2 py-2.5 text-[var(--muted)]">{r.territorio}</td>
                <td className="px-2 py-2.5 text-right tabular-nums text-[var(--cream)]">
                  {r.actual ? <>{clp(r.actual.realNeto)} <span className="text-[var(--muted)]">/ {clp(r.actual.metaNeto)}</span></> : '—'}
                </td>
                <td
                  className="px-2 py-2.5 text-right font-extrabold tabular-nums"
                  style={{ color: r.actual?.semaforo ? SEMAFORO_COLOR[r.actual.semaforo] : 'var(--cream)' }}
                >
                  {r.actual ? pctTxt(r.actual.pctNeto) : '—'}
                </td>
                <td className="px-2 py-2.5"><ChipSemaforo semaforo={r.actual?.semaforo ?? null} /></td>
                <td className="px-2 py-2.5 text-right tabular-nums text-[var(--cream)]">
                  {clp(r.acum.realNeto)} <span className="text-[var(--muted)]">· {pctTxt(pct(r.acum.realNeto, r.acum.metaNeto))}</span>
                </td>
                <td className="px-2 py-2.5 text-right tabular-nums text-[var(--cream)]">
                  {r.actual ? `${entero(r.actual.realClientes)}/${entero(r.actual.metaClientes)}` : '—'}
                  <span className="text-[var(--muted)]"> · {entero(r.acum.realClientes)} temp.</span>
                </td>
                <td className="px-2 py-2.5 text-[var(--muted)]"><ChevronRight size={16} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <MatrizSemaforos ranking={ordenado} semanaActual={actualSemana?.semana ?? null} onElegir={onElegir} />
    </div>
  )
}

function ResumenCard({ titulo, subtitulo, pie, a }: { titulo: string; subtitulo: string; pie?: string; a: Acumulado }) {
  const p = pct(a.realNeto, a.metaNeto)
  return (
    <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <p className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--gold)]">{titulo}</p>
        <span className="text-[13px] font-extrabold tabular-nums text-[var(--gold)]">{pctTxt(p)}</span>
      </div>
      <p className="text-[24px] font-black leading-none tracking-[-0.03em] tabular-nums text-[var(--cream)]">{clp(a.realNeto)}</p>
      <p className="mb-2 mt-1 truncate text-[12px] tabular-nums text-[var(--muted)]">de {clp(a.metaNeto)}{subtitulo ? ` · ${subtitulo}` : ''}</p>
      <Barra valor={p} />
      <div className="mt-3 grid grid-cols-2 gap-2 text-[12px]">
        <div className="rounded-lg bg-[var(--surface2)] px-3 py-2">
          <p className="text-[var(--muted)]">Litros · {pctTxt(pct(a.realLitros, a.metaLitros))}</p>
          <p className="truncate font-bold tabular-nums text-[var(--cream)]">
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
      {pie && <p className="mt-3 border-t border-[var(--border-subtle)] pt-3 text-[12px] tabular-nums text-[var(--muted)]">{pie}</p>}
    </section>
  )
}

function BotonOrden({ activo, desc, onClick, children }: { activo: boolean; desc: boolean; onClick: () => void; children: React.ReactNode }) {
  const Flecha = desc ? ArrowDown : ArrowUp
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={activo}
      className="inline-flex min-h-[36px] items-center gap-1 rounded-full border px-3 text-[12px] font-semibold transition-colors"
      style={{
        background: activo ? 'var(--gold-dim)' : 'transparent',
        borderColor: activo ? 'rgba(212,175,55,0.3)' : 'var(--border)',
        color: activo ? 'var(--gold)' : 'var(--muted)',
      }}
    >
      {children}
      {activo && <Flecha size={13} />}
    </button>
  )
}

function TarjetaVendedor({ r, posicion, onClick }: { r: FilaRanking; posicion: number; onClick: () => void }) {
  const a = r.actual
  const color = a?.semaforo ? SEMAFORO_COLOR[a.semaforo] : 'var(--gold)'
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full shrink-0 rounded-[14px] border border-[var(--border-subtle)] bg-[var(--surface2)] p-3 text-left active:scale-[0.99]"
    >
      <div className="mb-2 flex items-center gap-2.5">
        <span className="w-5 shrink-0 text-[13px] font-black tabular-nums text-[var(--muted)]">{posicion}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[14px] font-bold text-[var(--cream)]">{r.vendedor}</span>
          <span className="block truncate text-[11px] text-[var(--muted)]">{r.territorio}</span>
        </span>
        <span className="text-[15px] font-black tabular-nums" style={{ color }}>{a ? pctTxt(a.pctNeto) : '—'}</span>
        <Punto semaforo={a?.semaforo ?? null} />
        <ChevronRight size={16} className="shrink-0 text-[var(--muted)]" />
      </div>
      <Barra valor={a?.pctNeto ?? 0} color={color} />
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div className="min-w-0">
          <p className="text-[var(--muted)]">Semana</p>
          <p className="truncate font-semibold tabular-nums text-[var(--cream)]">{a ? clp(a.realNeto) : '—'}</p>
          <p className="truncate tabular-nums text-[var(--muted)]">de {a ? clp(a.metaNeto) : '—'}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[var(--muted)]">Acumulado</p>
          <p className="truncate font-semibold tabular-nums text-[var(--cream)]">{clp(r.acum.realNeto)}</p>
          <p className="truncate tabular-nums text-[var(--muted)]">{pctTxt(pct(r.acum.realNeto, r.acum.metaNeto))} de meta</p>
        </div>
        <div className="min-w-0">
          <p className="text-[var(--muted)]">Clientes nuevos</p>
          <p className="truncate font-semibold tabular-nums text-[var(--cream)]">{a ? `${entero(a.realClientes)} de ${entero(a.metaClientes)}` : '—'}</p>
          <p className="truncate tabular-nums text-[var(--muted)]">{entero(r.acum.realClientes)} en temporada</p>
        </div>
      </div>
    </button>
  )
}

const MARCAS = new Set([1, 5, 10, 15, 20, 25])

function MatrizSemaforos({
  ranking, semanaActual, onElegir,
}: {
  ranking: FilaRanking[]; semanaActual: number | null; onElegir: (userId: string) => void
}) {
  const numSemanas = Math.max(25, ...ranking.flatMap(r => r.filas.map(f => f.semana)))
  const semanas = Array.from({ length: numSemanas }, (_, i) => i + 1)
  const columnas = `minmax(64px, 120px) repeat(${numSemanas}, minmax(0, 1fr))`

  return (
    <section className="rounded-[18px] border border-[var(--border)] bg-[var(--surface)] p-3 lg:p-4">
      <h2 className="mb-3 px-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">Matriz de semáforos · S1–S{numSemanas}</h2>

      <div className="grid items-center gap-[2px]" style={{ gridTemplateColumns: columnas }}>
        <span />
        {semanas.map(s => (
          <span
            key={s}
            className="flex justify-center overflow-visible whitespace-nowrap text-[9px] tabular-nums"
            style={{ color: s === semanaActual ? 'var(--gold)' : 'var(--muted)', fontWeight: s === semanaActual ? 800 : 500 }}
          >
            {s === semanaActual || (MARCAS.has(s) && (semanaActual === null || Math.abs(s - semanaActual) > 2)) ? s : ''}
          </span>
        ))}

        {ranking.map(r => {
          const porSemana = new Map(r.filas.map(f => [f.semana, f]))
          return (
            <Fila key={r.userId} r={r} onElegir={onElegir}>
              {semanas.map(s => {
                const f = porSemana.get(s)
                const sem = f?.semaforo ?? null
                const titulo = f
                  ? `S${s} · ${sem ? `${pctTxt(f.pctNeto)} · ${SEMAFORO_LABEL[sem]}` : 'futura'}`
                  : `S${s} · sin meta`
                return (
                  <span
                    key={s}
                    title={titulo}
                    className="h-5 rounded-[3px] lg:h-6"
                    style={{
                      background: sem ? SEMAFORO_COLOR[sem] : 'rgba(255,255,255,0.06)',
                      opacity: sem ? 0.9 : 1,
                      outline: s === semanaActual ? '1.5px solid var(--gold)' : undefined,
                      outlineOffset: 1,
                    }}
                  />
                )
              })}
            </Fila>
          )
        })}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 px-1 text-[11px] text-[var(--muted)]">
        {(['verde', 'amarillo', 'rojo'] as const).map(s => (
          <span key={s} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px]" style={{ background: SEMAFORO_COLOR[s] }} />
            {s === 'verde' ? '≥95%' : s === 'amarillo' ? '80–95%' : '<80%'}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-[2px] bg-white/[0.06]" /> Futura
        </span>
      </div>
    </section>
  )
}

function Fila({ r, onElegir, children }: { r: FilaRanking; onElegir: (userId: string) => void; children: React.ReactNode }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onElegir(r.userId)}
        className="min-h-[32px] truncate pr-1 text-left text-[12px] font-semibold text-[var(--cream)]"
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
