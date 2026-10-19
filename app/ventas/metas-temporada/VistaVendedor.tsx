'use client'

import { useState } from 'react'
import { AlertTriangle, Target } from 'lucide-react'
import {
  type FilaMeta,
  semanaEnCurso, semanaInicial, acumuladoTemporada, acumular, dosRojasSeguidas,
} from './tipos'
import {
  ResumenSemana, SelectorSemana, opcionesSemana, TablaSemanas,
  FranjaAcumulado, PieTemporada, Titulo,
} from './ui'

/**
 * Pantalla de metas de UN vendedor. La usa el vendedor (sus filas vienen ya
 * acotadas por RLS) y el admin al elegir a alguien en el selector — así el
 * admin ve exactamente lo mismo que esa persona.
 */
export default function VistaVendedor({
  filas, hoy, semana, onSemana,
}: {
  filas: FilaMeta[]; hoy: string; semana: number; onSemana: (semana: number) => void
}) {
  const semanas = [...filas].sort((a, b) => a.semana - b.semana)
  const actual = semanaEnCurso(semanas)
  const [abierta, setAbierta] = useState<number | null>(actual?.semana ?? null)

  if (semanas.length === 0) return <SinMetas />

  const elegida = semanas.find(f => f.semana === semana) ?? semanas.find(f => f.semana === semanaInicial(semanas)) ?? semanas[0]
  const total = acumular(semanas)
  const acumulado = acumuladoTemporada(semanas)

  return (
    <div className="flex flex-col">
      {dosRojasSeguidas(semanas) && <AlertaRojas />}

      <section className="pb-5">
        <SelectorSemana opciones={opcionesSemana(semanas)} valor={elegida.semana} actual={actual?.semana ?? null} onCambiar={onSemana} />
        <ResumenSemana fila={elegida} suma={acumular([elegida])} hoy={hoy} />
      </section>

      <section className="border-t border-[var(--cc-line)] pb-5 pt-5">
        <Titulo>Semanas de la temporada</Titulo>
        <TablaSemanas
          semanas={semanas}
          abierta={abierta}
          onToggle={s => setAbierta(abierta === s ? null : s)}
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
