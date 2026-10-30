'use client'

import { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp, ChevronDown, Download } from 'lucide-react'
import {
  type FilaMeta, type Acumulado,
  clp, entero, pctTxt, pct,
  semanaEnCurso, semanaTope, acumular, acumuladoTemporada,
  nivelPorPct, nivelDeSemana, NIVEL_COLOR, NIVEL_BARRA, NIVEL_LABEL,
} from './tipos'
import {
  type Corte,
  BarraNivel, PctNivel, PorEntregar, ResumenSemana, SelectorSemana, opcionesSemana,
  FranjaAcumulado, PieTemporada, Titulo, TablaSemanas,
} from './ui'
import { etiquetaVendedor, nombreCorto } from '@/lib/types'
import DetalleClientes, { nombreEnFrase } from './DetalleClientes'

export interface VendedorPlan {
  userId: string
  vendedor: string
  territorio: string
  filas: FilaMeta[]
  /** Las mismas metas por período comercial 24→23 (plan_metas_periodo_avance). */
  periodos: FilaMeta[]
}

interface FilaRanking extends VendedorPlan {
  /** Semanas o períodos, según la escala elegida. */
  enEscala: FilaMeta[]
  /** Fila de la semana/período elegido en el selector (no necesariamente el en curso). */
  actual: FilaMeta | null
  acum: Acumulado
}

type Orden = 'semana' | 'acumulado'

export default function VistaEquipo({
  vendedores, hoy, corte, onElegir,
}: {
  vendedores: VendedorPlan[]; hoy: string; corte: Corte; onElegir: (userId: string) => void
}) {
  const { escala, valor: semana } = corte
  // Acumulado y pie siempre desde las semanas; selector, ranking y matriz en la escala elegida.
  const todas = vendedores.flatMap(v => v.filas)
  const tope = semanaTope(todas)
  const todasEscala = escala === 'periodo' ? vendedores.flatMap(v => v.periodos) : todas
  const enCurso = semanaEnCurso(todasEscala)
  const opciones = opcionesSemana(todasEscala)
  // Fila de referencia (fechas y estado) de lo elegido: son iguales para los cuatro.
  const semanaRef = todasEscala.find(f => f.semana === semana) ?? null

  const ranking: FilaRanking[] = useMemo(
    () => vendedores.map(v => {
      const enEscala = escala === 'periodo' ? v.periodos : v.filas
      return { ...v, enEscala, actual: enEscala.find(f => f.semana === semana) ?? null, acum: acumuladoTemporada(v.filas) }
    }),
    [vendedores, escala, semana],
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
      <section id="resumen-semana" className="scroll-mt-4 pb-5">
        <SelectorSemana opciones={opciones} actual={enCurso?.semana ?? null} corte={corte} />
        {/* Nivel del equipo: mismos cortes (<50 / 50–80 / ≥80) sobre la suma de lo elegido. */}
        {semanaRef && <ResumenSemana prefijo="Equipo · " fila={semanaRef} suma={semanaEquipo} hoy={hoy} />}
      </section>

      <section className="border-t border-[var(--cc-line)] pb-5 pt-5">
        <Titulo
          extra={
            <div className="flex items-center gap-1">
              <BotonOrden activo={orden === 'semana'} desc={desc} onClick={() => cambiarOrden('semana')}>{escala === 'periodo' ? '% mes' : '% semana'}</BotonOrden>
              <BotonOrden activo={orden === 'acumulado'} desc={desc} onClick={() => cambiarOrden('acumulado')}>% acumulado</BotonOrden>
              <button
                type="button"
                onClick={() => exportarCsv(ordenado)}
                className="ml-1 inline-flex min-h-[34px] items-center gap-1.5 rounded-[8px] border border-[var(--cc-line)] px-3 text-[13px] font-bold text-[var(--cc-ink)] hover:bg-[var(--cc-card-2)]"
              >
                <Download size={13} className="text-[var(--cc-gold)]" /> CSV
              </button>
            </div>
          }
        >
          Ranking por vendedor
        </Titulo>
        <TablaRanking ranking={ordenado} nombre={semanaRef?.nombre ?? ''} />
      </section>

      <MatrizSemaforos
        ranking={ordenado}
        semanaActual={enCurso?.semana ?? null}
        semanaElegida={semana}
        porMes={escala === 'periodo'}
        onSemana={s => {
          corte.onValor(s)
          document.getElementById('resumen-semana')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }}
        onElegir={onElegir}
      />

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
      className="inline-flex min-h-[34px] items-center gap-1 rounded-[8px] px-2.5 text-[13px] font-bold transition-colors"
      style={{
        background: activo ? 'var(--cc-gold-soft)' : 'transparent',
        color: activo ? 'var(--m-oro-texto)' : 'var(--cc-ink-2)',
      }}
    >
      {children}
      {activo && <Flecha size={12} />}
    </button>
  )
}

// ── Ranking ──────────────────────────────────────────────────────────────────

const COLS_RANKING =
  'grid-cols-[20px_minmax(0,1fr)_auto_16px] lg:grid-cols-[24px_minmax(0,1.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_72px_minmax(0,1.1fr)_64px_20px]'

function TablaRanking({ ranking, nombre }: { ranking: FilaRanking[]; nombre: string }) {
  // Tocar una región abre a quién le vendió (y el cliente nuevo); "Ver metas de…" despliega sus metas ahí mismo.
  const [abierto, setAbierto] = useState<string | null>(null)
  return (
    <div>
      <div className={`hidden ${COLS_RANKING} gap-x-4 border-b border-[var(--cc-line)] px-3 pb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--cc-ink-3)] lg:grid`}>
        <span>#</span><span>Vendedor</span><span>{nombre} · Ventas / Meta</span><span /><span>Avance</span>
        <span>Acumulado temporada</span><span className="text-right">Clientes</span><span />
      </div>
      {ranking.map((r, i) => {
        const a = r.actual
        const futura = a?.estado === 'futura'
        const nivel = a ? nivelDeSemana(a) : null
        const pAcum = pct(r.acum.realNeto, r.acum.metaNeto)
        return (
          <div key={r.userId}>
          <button
            type="button"
            onClick={() => setAbierto(abierto === r.userId ? null : r.userId)}
            aria-expanded={abierto === r.userId}
            className={`grid w-full ${COLS_RANKING} min-h-[60px] items-center gap-x-4 border-b border-[var(--cc-line-soft)] px-3 py-2.5 text-left hover:bg-[var(--cc-card-2)] lg:min-h-[52px] lg:py-2 ${abierto === r.userId ? 'bg-[var(--cc-card-2)]' : ''}`}
          >
            <span className="text-[14px] font-bold tabular-nums text-[var(--cc-ink-3)]">{i + 1}</span>

            <span className="flex min-w-0 flex-col lg:contents">
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-bold text-[var(--cc-ink)]">{etiquetaVendedor(r.vendedor)}</span>
                <span className="block truncate text-[13px] font-medium text-[var(--cc-ink-2)]">{r.territorio}</span>
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="truncate text-[13px] font-medium tabular-nums text-[var(--cc-ink-2)] sm:text-[14px]">
                  {!a ? '—' : futura ? (
                    <>Meta <strong className="font-bold text-[var(--cc-ink)]">{clp(a.metaNeto)}</strong></>
                  ) : (
                    <><strong className="font-bold text-[var(--cc-ink)]">{clp(a.realNeto)}</strong> / {clp(a.metaNeto)}</>
                  )}
                </span>
                {a && !futura && <PorEntregar monto={a.realNetoPorEntregar} className="text-[12px]" />}
              </span>
              <span className="hidden lg:block">{a && !futura && <BarraNivel valor={a.pctNeto} alto={7} />}</span>
              {/* En móvil, el acumulado va en una tercera línea */}
              <span className="truncate text-[12px] font-medium tabular-nums text-[var(--cc-ink-2)] lg:hidden">
                Acum. {clp(r.acum.realNeto)} · <PctNivel valor={pAcum} />
              </span>
            </span>

            <span className="flex flex-col items-end gap-0.5 lg:items-start">
              <span
                className="flex items-center gap-1.5 text-[15px] font-bold tabular-nums"
                style={{ color: nivel ? NIVEL_COLOR[nivel] : 'var(--cc-ink-3)' }}
                title={nivel ? NIVEL_LABEL[nivel] : undefined}
              >
                <span className="size-2.5 rounded-full" style={{ background: nivel ? NIVEL_BARRA[nivel] : 'var(--cc-neutral)' }} />
                {a && !futura ? pctTxt(a.pctNeto) : '—'}
              </span>
              <span className="text-[12px] font-medium tabular-nums text-[var(--cc-ink-2)] lg:hidden">
                {!a ? '' : futura ? `meta ${entero(a.metaClientes)} nuevos` : `${entero(a.realClientes)}/${entero(a.metaClientes)} nuevos`}
              </span>
            </span>

            <span className="hidden truncate text-[14px] font-medium tabular-nums text-[var(--cc-ink-2)] lg:block">
              <strong className="font-bold text-[var(--cc-ink)]">{clp(r.acum.realNeto)}</strong> · <PctNivel valor={pAcum} />
            </span>
            <span className="hidden text-right text-[14px] font-bold tabular-nums text-[var(--cc-ink)] lg:block">
              {!a ? '—' : futura ? (
                <span className="font-medium text-[var(--cc-ink-2)]">meta {entero(a.metaClientes)}</span>
              ) : (
                <>{entero(a.realClientes)}<span className="font-medium text-[var(--cc-ink-2)]">/{entero(a.metaClientes)}</span></>
              )}
            </span>
            <ChevronDown
              size={17}
              className={`justify-self-end text-[var(--cc-ink-2)] transition-transform ${abierto === r.userId ? 'rotate-180' : ''}`}
            />
          </button>
          {abierto === r.userId && a && (
            <DetalleClientes
              userId={r.userId}
              desde={a.fechaInicio}
              hasta={a.fechaFin}
              nombre={nombreEnFrase(a)}
              etiqueta={etiquetaVendedor(r.vendedor)}
              metas={<MetasVendedor r={r} />}
            />
          )}
          </div>
        )
      })}
    </div>
  )
}

/** Lo central de la vista del vendedor (semanas/meses + acumulado), para desplegarlo dentro del ranking. */
function MetasVendedor({ r }: { r: FilaRanking }) {
  const semanas = [...r.enEscala].sort((a, b) => a.semana - b.semana)
  const [abierta, setAbierta] = useState<number | null>(r.actual?.semana ?? null)
  const porMes = semanas[0]?.tipo === 'periodo'
  return (
    <div className="flex flex-col">
      <p className="pb-2 text-[13px] font-bold text-[var(--cc-ink)]">{porMes ? 'Meses de la temporada (24→23)' : 'Semanas de la temporada'}</p>
      <TablaSemanas semanas={semanas} abierta={abierta} onToggle={n => setAbierta(abierta === n ? null : n)} />
      <div className="mt-4">
        <FranjaAcumulado a={r.acum} />
      </div>
    </div>
  )
}

// ── Matriz de semáforos ──────────────────────────────────────────────────────

const MARCAS = new Set([1, 5, 10, 15, 20, 25])

function MatrizSemaforos({
  ranking, semanaActual, semanaElegida, porMes, onSemana, onElegir,
}: {
  ranking: FilaRanking[]; semanaActual: number | null; semanaElegida: number; porMes: boolean
  onSemana: (semana: number) => void; onElegir: (userId: string) => void
}) {
  const marcada = (s: number) => s === semanaActual || s === semanaElegida
  const cerca = (s: number) => [semanaActual, semanaElegida].some(m => m !== null && Math.abs(s - m) <= 2)
  const numSemanas = Math.max(porMes ? 1 : 25, ...ranking.flatMap(r => r.enEscala.map(f => f.semana)))
  const cortos = new Map(ranking.flatMap(r => r.enEscala.map(f => [f.semana, f.corto] as const)))
  const semanas = Array.from({ length: numSemanas }, (_, i) => i + 1)
  const columnas = `minmax(64px, 140px) repeat(${numSemanas}, minmax(0, 1fr))`

  return (
    <section className="border-t border-[var(--cc-line)] pb-5 pt-5">
      <Titulo
        extra={
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] font-medium text-[var(--cc-ink-2)]">
            {(['verde', 'naranjo', 'rojo'] as const).map(s => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className="size-3 rounded-[3px]" style={{ background: NIVEL_BARRA[s] }} />
                {s === 'verde' ? '≥80%' : s === 'naranjo' ? '50–80%' : '<50%'}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="size-3 rounded-[3px] bg-[var(--cc-neutral-soft)]" /> Futura
            </span>
          </div>
        }
      >
        {porMes ? 'Semáforo por mes (24→23)' : 'Semáforo por semana'}
      </Titulo>

      <div className="grid items-center gap-[2px] md:gap-[3px]" style={{ gridTemplateColumns: columnas }}>
        <span />
        {semanas.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => onSemana(s)}
            aria-label={`Ver ${cortos.get(s) ?? s}`}
            className="flex min-h-[20px] justify-center overflow-visible whitespace-nowrap text-[11px] tabular-nums"
            style={{
              color: s === semanaElegida ? 'var(--cc-ink)' : s === semanaActual ? 'var(--m-oro-texto)' : 'var(--cc-ink-2)',
              fontWeight: marcada(s) ? 800 : 500,
            }}
          >
            {porMes ? cortos.get(s) ?? s : marcada(s) || (MARCAS.has(s) && !cerca(s)) ? s : ''}
          </button>
        ))}

        {ranking.map(r => {
          const porSemana = new Map(r.enEscala.map(f => [f.semana, f]))
          return (
            <FilaMatriz key={r.userId} r={r} onElegir={onElegir}>
              {semanas.map(s => {
                const f = porSemana.get(s)
                const nivel = f ? nivelDeSemana(f) : null
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onSemana(s)}
                    title={f ? `${f.corto} · ${nivel ? `${pctTxt(f.pctNeto)} · ${NIVEL_LABEL[nivel]}` : 'futura'}` : `${s} · sin meta`}
                    aria-label={`Ver ${f?.corto ?? s}`}
                    className="h-5 rounded-[3px] md:h-6"
                    style={{
                      background: nivel ? NIVEL_BARRA[nivel] : 'var(--cc-neutral-soft)',
                      outline: s === semanaElegida ? '2px solid var(--cc-ink)' : s === semanaActual ? '1.5px solid var(--cc-gold)' : undefined,
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
        className="min-h-[32px] truncate pr-2 text-left text-[13px] font-bold text-[var(--cc-ink)] md:text-[14px]"
        title={`${etiquetaVendedor(r.vendedor)} · ${r.territorio}`}
      >
        {nombreCorto(r.vendedor)}
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
    'Territorio', 'Vendedor', 'Semana / mes', 'Desde', 'Hasta',
    'Meta neto', 'Real neto', 'Por entregar neto', '% neto', 'Meta litros', 'Real litros', '% litros',
    'Meta clientes nuevos', 'Real clientes nuevos', 'Nivel',
    'Acum meta neto', 'Acum real neto', 'Acum % neto',
  ]
  const filas = ranking.map(r => {
    const a = r.actual
    return [
      r.territorio, etiquetaVendedor(r.vendedor), a ? a.nombre : '', a?.fechaInicio ?? '', a?.fechaFin ?? '',
      a ? Math.round(a.metaNeto) : '', a ? Math.round(a.realNeto) : '', a ? Math.round(a.realNetoPorEntregar) : '', a ? dec(a.pctNeto) : '',
      a ? dec(a.metaLitros) : '', a ? dec(a.realLitros) : '', a ? dec(a.pctLitros) : '',
      a?.metaClientes ?? '', a?.realClientes ?? '', a && a.estado !== 'futura' ? NIVEL_LABEL[nivelPorPct(a.pctNeto)] : '',
      Math.round(r.acum.metaNeto), Math.round(r.acum.realNeto), dec(pct(r.acum.realNeto, r.acum.metaNeto)),
    ]
  })
  const escapar = (v: string | number) => {
    const s = String(v)
    return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [encabezado, ...filas].map(f => f.map(escapar).join(';')).join('\r\n')
  const corto = ranking.find(r => r.actual)?.actual?.corto
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `metas-temporada-${corto ?? 'equipo'}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
