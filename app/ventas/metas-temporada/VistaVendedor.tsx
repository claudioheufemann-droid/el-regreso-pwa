'use client'

import { useState } from 'react'
import { AlertTriangle, Target } from 'lucide-react'
import {
  type FilaMeta, type Escala,
  semanaEnCurso, semanaInicial, acumuladoTemporada, acumular, dosRojasSeguidas,
} from './tipos'
import {
  type Corte,
  ResumenSemana, SelectorSemana, opcionesSemana, TablaSemanas,
  FranjaAcumulado, PieTemporada, Titulo,
} from './ui'

/**
 * Pantalla de metas de UN vendedor. La usa el vendedor (sus filas vienen ya
 * acotadas por RLS) y el admin al elegir a alguien en el selector — así el
 * admin ve exactamente lo mismo que esa persona.
 * `filas` = semanas del plan; `periodos` = las mismas metas por período 24→23.
 * Acumulado, pie y alerta de semanas rojas salen siempre de las semanas.
 */
export default function VistaVendedor({
  filas, periodos, hoy, corte,
}: {
  filas: FilaMeta[]; periodos: FilaMeta[]; hoy: string; corte: Corte
}) {
  const semanas = [...filas].sort((a, b) => a.semana - b.semana)
  const porMes = corte.escala === 'periodo'
  const enEscala = porMes ? [...periodos].sort((a, b) => a.semana - b.semana) : semanas
  const actual = semanaEnCurso(enEscala)
  const [abierta, setAbierta] = useState<{ escala: Escala; n: number } | null>(() => {
    const s = semanaEnCurso(semanas)
    return s ? { escala: 'semana', n: s.semana } : null
  })

  if (semanas.length === 0) return <SinMetas />

  const elegida = enEscala.find(f => f.semana === corte.valor) ?? enEscala.find(f => f.semana === semanaInicial(enEscala)) ?? null
  const total = acumular(semanas)
  const acumulado = acumuladoTemporada(semanas)
  const abiertaAqui = abierta?.escala === corte.escala ? abierta.n : null

  return (
    <div className="flex flex-col">
      {dosRojasSeguidas(semanas) && <AlertaRojas />}

      <section className="pb-5">
        <SelectorSemana opciones={opcionesSemana(enEscala)} actual={actual?.semana ?? null} corte={{ ...corte, valor: elegida?.semana ?? corte.valor }} />
        {elegida && <ResumenSemana fila={elegida} suma={acumular([elegida])} hoy={hoy} />}
      </section>

      <section className="border-t border-[var(--cc-line)] pb-5 pt-5">
        <Titulo>{porMes ? 'Meses de la temporada (24→23)' : 'Semanas de la temporada'}</Titulo>
        <TablaSemanas
          semanas={enEscala}
          abierta={abiertaAqui}
          onToggle={n => setAbierta(abiertaAqui === n ? null : { escala: corte.escala, n })}
        />
      </section>

      <FranjaAcumulado a={acumulado} />
      <PieTemporada metaNeto={total.metaNeto} metaLitros={total.metaLitros} realNeto={acumulado.realNeto} />
    </div>
  )
}

function AlertaRojas() {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-[10px] border px-4 py-3"
      style={{ background: 'var(--m-rojo-suave)', borderColor: 'rgba(200,30,30,0.35)' }}
    >
      <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--m-rojo)]" />
      <p className="text-[14px] font-medium leading-snug text-[var(--cc-ink)]">
        <strong className="font-bold">Dos semanas cerradas seguidas bajo el 80% de la meta.</strong>{' '}
        Coordina una llamada con la gerencia comercial para ajustar el plan.
      </p>
    </div>
  )
}

export function SinMetas() {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--cc-gold-soft)]">
        <Target size={20} className="text-[var(--cc-gold)]" />
      </div>
      <p className="text-[15px] font-semibold text-[var(--cc-ink)]">No hay metas cargadas para esta temporada</p>
      <p className="mt-1 max-w-[340px] text-[14px] font-medium text-[var(--cc-ink-2)]">
        El plan de venta oct 2026 – mar 2027 se asigna por vendedor. Si crees que es un error, avísale a la gerencia comercial.
      </p>
    </div>
  )
}
