'use client'

import { useState } from 'react'
import VistaEquipo, { type VendedorPlan } from '@/app/ventas/metas-temporada/VistaEquipo'
import type { Escala, FilaMeta, RetailCorte } from '@/app/ventas/metas-temporada/tipos'
import { pct } from '@/app/ventas/metas-temporada/tipos'

// Datos inventados con montos del tamaño real (millones) para probar anchos.
const HOY = '2026-11-12'

const SEMANAS: [number, string, string][] = [
  [4, '2026-10-19', '2026-10-23'],
  [5, '2026-10-26', '2026-11-01'],
  [6, '2026-11-02', '2026-11-08'],
  [7, '2026-11-09', '2026-11-15'],
  [8, '2026-11-16', '2026-11-22'],
  [9, '2026-11-23', '2026-11-23'],
]
const PERIODOS: [number, string, string, string][] = [
  [1, 'Octubre', '2026-09-24', '2026-10-23'],
  [2, 'Noviembre', '2026-10-24', '2026-11-23'],
  [3, 'Diciembre', '2026-11-24', '2026-12-23'],
]

const VENDEDORES = [
  { userId: 'u-rm', vendedor: 'Yadro', territorio: 'Metropolitana', meta: 3_030_000, avance: [0.9, 0.7, 1.08, 0.52] },
  { userId: 'u-ara', vendedor: 'Marcelo', territorio: 'La Araucanía', meta: 2_510_000, avance: [0.6, 0.55, 0.9, 0.28] },
  { userId: 'u-lagos', vendedor: 'Marion', territorio: 'Los Lagos', meta: 1_850_000, avance: [0.8, 0.4, 0.7, 0.22] },
  { userId: 'u-rios', vendedor: 'Nicol', territorio: 'Los Ríos', meta: 3_140_000, avance: [1.1, 0.5, 0.3, 0.14] },
]

function estadoDe(inicio: string, fin: string): FilaMeta['estado'] {
  return HOY > fin ? 'cerrada' : HOY >= inicio ? 'en_curso' : 'futura'
}

function fila(base: Partial<FilaMeta> & Pick<FilaMeta, 'id' | 'tipo' | 'nombre' | 'corto' | 'semana' | 'fechaInicio' | 'fechaFin' | 'metaNeto' | 'realNeto' | 'userId' | 'vendedor' | 'territorio'>): FilaMeta {
  const metaLitros = Math.round(base.metaNeto / 3380)
  const realLitros = Math.round((base.realNeto / 3380) * 10) / 10
  const estado = estadoDe(base.fechaInicio, base.fechaFin)
  return {
    metaClientes: 4, realClientes: estado === 'futura' ? 0 : 3,
    metaCajasKombucha: 0, metaCajasCerveza: 0, metaBarriles: 0,
    realCajasKombucha: 0, realCajasCerveza: 0, realBarriles: 0,
    realNetoPorEntregar: estado === 'en_curso' ? Math.round(base.realNeto * 0.6) : 0,
    metaLitros, realLitros,
    pctNeto: pct(base.realNeto, base.metaNeto),
    pctLitros: pct(realLitros, metaLitros),
    pctClientes: 75,
    estado,
    semaforo: null,
    ...base,
  }
}

function armarVendedores(): VendedorPlan[] {
  let id = 1
  return VENDEDORES.map(v => {
    const filas = SEMANAS.map(([n, ini, fin], i) => {
      const futura = estadoDe(ini, fin) === 'futura'
      const corta = ini === fin
      const meta = corta ? Math.round(v.meta / 5) : v.meta
      return fila({
        id: id++, tipo: 'semana', nombre: `Semana ${n}`, corto: `S${n}`, semana: n,
        fechaInicio: ini, fechaFin: fin, metaNeto: meta,
        realNeto: futura ? 0 : Math.round(meta * (v.avance[i] ?? 0.5)),
        userId: v.userId, vendedor: v.vendedor, territorio: v.territorio,
      })
    })
    const periodos = PERIODOS.map(([n, nombre, ini, fin]) => {
      const meta = v.meta * 4.4
      const futura = estadoDe(ini, fin) === 'futura'
      return fila({
        id: id++, tipo: 'periodo', nombre, corto: nombre.slice(0, 3), semana: n,
        fechaInicio: ini, fechaFin: fin, metaNeto: Math.round(meta),
        realNeto: futura ? 0 : Math.round(meta * (n === 1 ? 0.82 : 0.47)),
        userId: v.userId, vendedor: v.vendedor, territorio: v.territorio,
      })
    })
    return { userId: v.userId, vendedor: v.vendedor, territorio: v.territorio, filas, periodos }
  })
}

const RETAIL: RetailCorte[] = [
  { tipo: 'semana', n: 4, fechaInicio: '2026-10-19', fechaFin: '2026-10-23', neto: 1_200_000, netoPorEntregar: 0, litros: 340.2 },
  { tipo: 'semana', n: 5, fechaInicio: '2026-10-26', fechaFin: '2026-11-01', neto: 467_896, netoPorEntregar: 0, litros: 135.9 },
  { tipo: 'semana', n: 6, fechaInicio: '2026-11-02', fechaFin: '2026-11-08', neto: 5_560_659, netoPorEntregar: 0, litros: 1619.8 },
  { tipo: 'semana', n: 7, fechaInicio: '2026-11-09', fechaFin: '2026-11-15', neto: 0, netoPorEntregar: 0, litros: 0 },
  { tipo: 'periodo', n: 1, fechaInicio: '2026-09-24', fechaFin: '2026-10-23', neto: 9_800_000, netoPorEntregar: 0, litros: 2900 },
  { tipo: 'periodo', n: 2, fechaInicio: '2026-10-24', fechaFin: '2026-11-23', neto: 6_028_555, netoPorEntregar: 0, litros: 1755.7 },
]

export default function DevMetasClient() {
  const [vendedores] = useState(armarVendedores)
  const [escala, setEscala] = useState<Escala>('semana')
  const [valor, setValor] = useState(7)
  return (
    <div className="cc-root tw-spacing metas-claro w-full px-4 pt-4 md:px-6 lg:px-8" data-theme="light">
      <div className="mx-auto w-full max-w-[1400px]">
        <VistaEquipo
          vendedores={vendedores}
          retail={RETAIL}
          hoy={HOY}
          corte={{
            escala,
            onEscala: e => { setEscala(e); setValor(e === 'periodo' ? 2 : 7) },
            valor,
            onValor: setValor,
          }}
          onElegir={() => {}}
        />
      </div>
    </div>
  )
}
