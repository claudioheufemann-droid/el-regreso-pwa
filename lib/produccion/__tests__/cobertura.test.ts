import { describe, expect, it } from 'vitest'
import {
  calcularCobertura, aSugerencias, demandaProyectadaEnPeriodo, diasHabilesEntre,
  sumarDiasHabilesISO, restarDiasHabilesISO, type SerieDemanda, type ColchonEnvase, type AvanceCiclo,
} from '../cobertura'

// Ciclo de octubre: 24-sep → 23-oct. Hoy lunes 5-oct-2026.
const avance: AvanceCiclo = { mes: '2026-10-01', diasHabilesTranscurridos: 8, diasHabilesEnCiclo: 22 }
const HOY = '2026-10-05'

const serie = (producto: string, envase: string, litrosMesEnCurso: number, forecast: Record<string, number>): SerieDemanda => ({
  producto, envaseBucket: envase, categoria: 'cerveza', litrosMesEnCurso,
  puntos: Object.entries(forecast).map(([mes, litros]) => ({ mes, tipo: 'forecast' as const, litros, litrosMin: litros * 0.8, litrosMax: litros * 1.2, estacionalidad: null })),
})
const colchon = (producto: string, envase: string, stock: number | null, ss: number, rop: number, extra: Partial<ColchonEnvase> = {}): ColchonEnvase => ({
  producto, envase, categoria: 'cerveza', stockActualLitros: stock, stockActualUnidades: stock != null ? Math.round(stock / 30) : null,
  litrosEnProduccion: 0, stockSeguridadLitros: ss, puntoReordenLitros: rop, leadTimeSemanas: 4, ...extra,
})

describe('fechas hábiles', () => {
  it('suma y resta saltando el fin de semana', () => {
    expect(sumarDiasHabilesISO('2026-10-02', 1)).toBe('2026-10-05') // viernes → lunes
    expect(restarDiasHabilesISO('2026-10-05', 1)).toBe('2026-10-02')
    expect(diasHabilesEntre('2026-10-05', '2026-10-09')).toBe(5)
  })
})

describe('demandaProyectadaEnPeriodo', () => {
  it('usa el ritmo real en el ciclo en curso y el forecast en los siguientes, prorrateados', () => {
    const s = serie('Fisura', 'barril_30', 80, { '2026-11-01': 310 })
    // ciclo en curso completo: 80/8 × 22 = 220 L en 30 días (24-sep → 23-oct)
    expect(demandaProyectadaEnPeriodo(s, avance, '2026-09-24', '2026-10-23')).toBeCloseTo(220, 6)
    // 24-oct → 23-nov es el ciclo de noviembre (31 días): mitad ≈ 155
    expect(demandaProyectadaEnPeriodo(s, avance, '2026-10-24', '2026-11-08')).toBeCloseTo(310 * 16 / 31, 6)
  })
})

describe('calcularCobertura', () => {
  const series = [
    serie('Fisura', 'barril_30', 80, { '2026-11-01': 300, '2026-12-01': 300 }),
    serie('Fisura', 'barril_50', 16, { '2026-11-01': 60, '2026-12-01': 60 }),
    serie('Fisura', 'lata', 40, { '2026-11-01': 150, '2026-12-01': 150 }),
    serie('Mocho English', 'barril_30', 8, { '2026-11-01': 30, '2026-12-01': 30 }),
  ]
  const colchones = [
    colchon('Fisura', 'barril_30', 100, 120, 200),
    colchon('Fisura', 'barril_50', 50, 30, 50),
    colchon('Fisura', 'lata', 600, 80, 150, { stockActualUnidades: 1600 }),
    colchon('Mocho English', 'barril_30', 900, 20, 40),
    colchon('Experimental', 'barril_30', null, 10, 20),
  ]
  const r = calcularCobertura(series, colchones, avance, { hoyISO: HOY, hastaISO: '2026-12-23' })
  const fisura = r.find(p => p.producto === 'Fisura')!

  it('suma barril 30 y 50 en una sola familia; la lata va aparte', () => {
    expect(fisura.familias.map(f => f.familia)).toEqual(['barril', 'lata'])
    const barril = fisura.familias[0]
    expect(barril.disponibleLitros).toBe(150)
    expect(barril.stockSeguridadLitros).toBe(150)
    expect(barril.litrosPorUnidad).toBe(30)
    expect(fisura.familias[1].litrosPorUnidad).toBeCloseTo(600 / 1600, 6)
  })

  it('el barril bajo el punto de reorden con la fecha límite vencida queda urgente, y manda en el producto', () => {
    const barril = fisura.familias[0]
    expect(barril.ritmoDiario).toBeGreaterThan(0)
    expect(barril.fechaLimiteCocer! <= HOY).toBe(true) // 150 L a ~12 L/día ≈ 13 días < 20 de lead time
    expect(barril.estado).toBe('urgente')
    expect(fisura.estado).toBe('urgente')
  })

  it('a producir = demanda hasta la fecha + colchón − disponible', () => {
    const barril = fisura.familias[0]
    expect(barril.aProducirLitros).toBe(Math.round(barril.demandaHorizonte + 150 - 150))
    expect(fisura.aProducirLitros).toBe(fisura.familias.reduce((s, f) => s + f.aProducirLitros, 0))
  })

  it('mucho stock y poca venta: cubierto', () => {
    const mocho = r.find(p => p.producto === 'Mocho English')!
    expect(mocho.estado).toBe('ok')
    expect(mocho.aProducirLitros).toBe(0)
    expect(mocho.lineaFija).toBe(true)
  })

  it('sin stock cargado: sin_dato, y no inventa días de cobertura', () => {
    const exp = r.find(p => p.producto === 'Experimental')!
    expect(exp.estado).toBe('sin_dato')
    expect(exp.diasCobertura).toBeNull()
  })

  it('ordena urgentes primero y los cubiertos al final', () => {
    expect(r[0].producto).toBe('Fisura')
    expect(r[r.length - 1].producto).toBe('Mocho English')
  })

  it('las sugerencias para el modal traen una fila por familia con necesidad', () => {
    const sug = aSugerencias(fisura, HOY)
    expect(sug.length).toBeGreaterThan(0)
    expect(sug[0]).toMatchObject({ producto: 'Fisura', envase: 'barril_30', atrasado: true })
  })
})
