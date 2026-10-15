'use client'

import { useState } from 'react'
import { AlertTriangle, Target } from 'lucide-react'
import {
  type FilaMeta,
  rangoFechas, diasHabilesRestantes,
  semanaEnCurso, acumuladoTemporada, acumular, dosRojasSeguidas,
  SEMAFORO_COLOR,
} from './tipos'
import {
  EncabezadoSemana, Indicadores, indicadoresDe, LineaRitmo, TablaSemanas,
  FranjaAcumulado, PieTemporada, Titulo, ORO,
} from './ui'

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

  const total = acumular(semanas)
  const acumulado = acumuladoTemporada(semanas)

  return (
    <div className="flex flex-col">
      {dosRojasSeguidas(semanas) && <AlertaRojas />}

      {actual ? <SemanaActual fila={actual} hoy={hoy} /> : <SinSemanaEnCurso filas={semanas} />}

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

function SemanaActual({ fila, hoy }: { fila: FilaMeta; hoy: string }) {
  // La vista decide "en curso" con CURRENT_DATE del servidor (UTC); de noche en
  // Chile ya puede ser el día siguiente allá. Nunca contar antes del inicio.
  const dias = diasHabilesRestantes(hoy > fila.fechaInicio ? hoy : fila.fechaInicio, fila.fechaFin)
  const colorNeto = fila.semaforo ? SEMAFORO_COLOR[fila.semaforo] : ORO
  return (
    <section className="pb-5">
      <EncabezadoSemana fila={fila} />
      <Indicadores items={indicadoresDe(acumular([fila]), colorNeto)} />
      <LineaRitmo falta={fila.metaNeto - fila.realNeto} dias={dias} />
    </section>
  )
}

function AlertaRojas() {
  return (
    <div
      role="alert"
      className="mb-5 flex items-start gap-3 rounded-[10px] border px-4 py-3"
      style={{ background: 'var(--cc-red-soft)', borderColor: 'rgba(220,38,38,0.25)' }}
    >
      <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[var(--cc-red)]" />
      <p className="text-[13px] leading-snug text-[var(--cc-ink)]">
        <strong className="font-semibold">Dos semanas cerradas seguidas en rojo.</strong>{' '}
        Coordina una llamada con la gerencia comercial para ajustar el plan.
      </p>
    </div>
  )
}

function SinSemanaEnCurso({ filas }: { filas: FilaMeta[] }) {
  const todasFuturas = filas.every(f => f.estado === 'futura')
  return (
    <section className="pb-5">
      <p className="text-[20px] font-bold tracking-[-0.02em] text-[var(--cc-ink)]">Sin semana en curso</p>
      <p className="mt-1 text-[13px] text-[var(--cc-ink-2)]">
        {todasFuturas
          ? `La temporada parte el ${rangoFechas(filas[0].fechaInicio, filas[0].fechaInicio)}.`
          : 'La temporada terminó. Este es el resultado final.'}
      </p>
    </section>
  )
}

export function SinMetas() {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-3 flex size-11 items-center justify-center rounded-full bg-[var(--cc-gold-soft)]">
        <Target size={20} className="text-[var(--cc-gold)]" />
      </div>
      <p className="text-[15px] font-semibold text-[var(--cc-ink)]">No hay metas cargadas para esta temporada</p>
      <p className="mt-1 max-w-[320px] text-[13px] text-[var(--cc-ink-2)]">
        El plan de venta oct 2026 – mar 2027 se asigna por vendedor. Si crees que es un error, avísale a la gerencia comercial.
      </p>
    </div>
  )
}
