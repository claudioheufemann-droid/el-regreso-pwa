import { describe, it, expect } from 'vitest'
import { calcularPresupuestoSemana } from '../calcularPresupuestoSemana'
import type { DiaPresupuesto, PoliticaGastos } from '../types'

const politica: PoliticaGastos = {
  id: 'p1', version: 1, vigente_desde: '2026-07-21', vigente_hasta: null,
  tarifa_km_clp: 150, monto_almuerzo_clp: 15000, monto_desayuno_clp: 5000,
  monto_once_cena_clp: 10000, tope_alojamiento_noche_clp: 60000,
  umbral_autorizacion_previa_clp: 250000, reglas_itinerario: {}, activa: true,
}

function dia(overrides: Partial<DiaPresupuesto> & { id: string; fecha: string }): DiaPresupuesto {
  return {
    pernocta: false, regreso_mismo_dia: true, desayuno_incluido_alojamiento: false,
    hotel_estimado_clp: null, peajes_estimados_clp: 0, km_pagable_m: 0,
    requiere_revision_comidas: false, cantidad_paradas: 0,
    ...overrides,
  }
}

describe('calcularPresupuestoSemana — caso de aceptación del prompt (punto 13)', () => {
  it('520km + $26.000 peajes + 4 almuerzos + 1 cena + 1 desayuno = $179.000 de fondo; alojamiento $55.000 aparte; total $234.000', () => {
    const dias: DiaPresupuesto[] = [
      dia({ id: 'lun', fecha: '2026-09-28', peajes_estimados_clp: 3000, km_pagable_m: 40000, cantidad_paradas: 3 }),
      dia({ id: 'mar', fecha: '2026-09-29', peajes_estimados_clp: 3000, km_pagable_m: 120000, cantidad_paradas: 4 }),
      dia({ id: 'mie', fecha: '2026-09-30', pernocta: true, regreso_mismo_dia: false, hotel_estimado_clp: 55000, peajes_estimados_clp: 10000, km_pagable_m: 180000, cantidad_paradas: 3 }),
      dia({ id: 'jue', fecha: '2026-10-01', regreso_mismo_dia: false, peajes_estimados_clp: 10000, km_pagable_m: 180000, cantidad_paradas: 4 }),
      dia({ id: 'vie', fecha: '2026-10-02' }), // seguimiento y cierre, sin paradas → sin almuerzo
    ]

    const r = calcularPresupuestoSemana(dias, politica)

    expect(r.dias.reduce((s, d) => s + d.comidas.almuerzos, 0)).toBe(4)
    expect(r.dias.reduce((s, d) => s + d.comidas.cenasOnce, 0)).toBe(1)
    expect(r.dias.reduce((s, d) => s + d.comidas.desayunos, 0)).toBe(1)
    expect(r.montoTotalKmClp).toBe(78000)
    expect(r.montoTotalPeajesClp).toBe(26000)
    expect(r.montoTotalComidasClp).toBe(75000)
    expect(r.montoTotalClp).toBe(179000)
    expect(r.montoAlojamientoEstimadoClp).toBe(55000)
    expect(r.montoTotalClp + r.montoAlojamientoEstimadoClp).toBe(234000)
    expect(r.algunDiaPendienteDeCalculo).toBe(false)
  })
})

describe('calcularPresupuestoSemana — reglas de comidas', () => {
  it('mismo día (sin pernocta antes ni después): sólo almuerzo', () => {
    const r = calcularPresupuestoSemana([dia({ id: 'd1', fecha: '2026-09-28', cantidad_paradas: 2 })], politica)
    expect(r.dias[0].comidas).toEqual({ almuerzos: 1, desayunos: 0, cenasOnce: 0, montoComidasClp: 15000 })
  })

  it('día sin paradas (seguimiento de escritorio) no genera almuerzo aunque sea semana laboral', () => {
    const r = calcularPresupuestoSemana([dia({ id: 'd1', fecha: '2026-09-28', cantidad_paradas: 0 })], politica)
    expect(r.dias[0].comidas.almuerzos).toBe(0)
    expect(r.montoTotalComidasClp).toBe(0)
  })

  it('desayuno se resta si el alojamiento lo incluye', () => {
    const dias: DiaPresupuesto[] = [
      dia({ id: 'd1', fecha: '2026-09-28', pernocta: true, regreso_mismo_dia: false, cantidad_paradas: 1 }),
      dia({ id: 'd2', fecha: '2026-09-29', regreso_mismo_dia: false, desayuno_incluido_alojamiento: true, cantidad_paradas: 1 }),
    ]
    const r = calcularPresupuestoSemana(dias, politica)
    expect(r.dias[1].comidas.desayunos).toBe(0)
  })

  it('se generaliza sola a 3 noches seguidas sin caso especial', () => {
    const dias: DiaPresupuesto[] = [
      dia({ id: 'd1', fecha: '2026-09-28', pernocta: true, regreso_mismo_dia: false, cantidad_paradas: 1 }),
      dia({ id: 'd2', fecha: '2026-09-29', pernocta: true, regreso_mismo_dia: false, cantidad_paradas: 1 }),
      dia({ id: 'd3', fecha: '2026-09-30', pernocta: true, regreso_mismo_dia: false, cantidad_paradas: 1 }),
      dia({ id: 'd4', fecha: '2026-10-01', regreso_mismo_dia: false, cantidad_paradas: 1 }),
    ]
    const r = calcularPresupuestoSemana(dias, politica)
    expect(r.dias.reduce((s, d) => s + d.comidas.almuerzos, 0)).toBe(4)
    expect(r.dias.reduce((s, d) => s + d.comidas.cenasOnce, 0)).toBe(3)
    expect(r.dias.reduce((s, d) => s + d.comidas.desayunos, 0)).toBe(3)
  })
})

describe('calcularPresupuestoSemana — km pendiente de calcular', () => {
  it('un día con km_pagable_m null nunca suma monto de km ni autoriza el día, y queda marcado pendiente', () => {
    const r = calcularPresupuestoSemana([dia({ id: 'd1', fecha: '2026-09-28', km_pagable_m: null, cantidad_paradas: 1 })], politica)
    expect(r.dias[0].montoKmClp).toBeNull()
    expect(r.dias[0].montoDiaClp).toBeNull()
    expect(r.dias[0].pendienteDeCalculo).toBe(true)
    expect(r.algunDiaPendienteDeCalculo).toBe(true)
    // El total de la semana NUNCA inventa un cero para el día pendiente — lo omite del km, no lo cuenta como $0 "calculado".
    expect(r.montoTotalKmClp).toBe(0)
  })
})

describe('calcularPresupuestoSemana — alojamiento nunca se suma al fondo', () => {
  it('monto_total_clp excluye siempre el alojamiento, aunque haya varias noches', () => {
    const dias: DiaPresupuesto[] = [
      dia({ id: 'd1', fecha: '2026-09-28', pernocta: true, regreso_mismo_dia: false, hotel_estimado_clp: 40000, cantidad_paradas: 1 }),
      dia({ id: 'd2', fecha: '2026-09-29', regreso_mismo_dia: false, hotel_estimado_clp: 40000, cantidad_paradas: 1 }),
    ]
    const r = calcularPresupuestoSemana(dias, politica)
    expect(r.montoAlojamientoEstimadoClp).toBe(80000)
    expect(r.montoTotalClp).toBe(r.montoTotalKmClp + r.montoTotalPeajesClp + r.montoTotalComidasClp)
  })
})
