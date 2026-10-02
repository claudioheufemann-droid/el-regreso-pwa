import { describe, expect, it } from 'vitest'
import { construirEscenarios, type DatosCajaCobrada } from '../cajaCobradaDatos'

/** Sólo los campos que usa construirEscenarios. */
const datos = (meses: { mes: string; mayoristas: number; enlatado: number }[], atrasado: number) =>
  ({ mesesPorGrupo: meses.map(m => ({ ...m, real: 0, facturas: 0, venta: m.mayoristas + m.enlatado })), ritmoCicloCredito: 900, caja: { atrasado: { monto: atrasado, facturas: 1, detalle: [] }, cuadratura: { carteraInicial: atrasado + 50 } } }) as unknown as DatosCajaCobrada

describe('construirEscenarios', () => {
  const base = datos([{ mes: '2026-10', mayoristas: 100, enlatado: 10 }, { mes: '2026-11', mayoristas: 200, enlatado: 20 }], 1000)
  const cons = datos([{ mes: '2026-10', mayoristas: 80, enlatado: 10 }, { mes: '2026-11', mayoristas: 90, enlatado: 20 }], 1000)
  const cobros = [
    { mes: '2026-07-01', cliente: 'EWU Ginger Beer', monto: 30 },
    { mes: '2026-08-01', cliente: 'EWU Ginger Beer', monto: 60 },
    { mes: '2026-09-01', cliente: 'EWU Ginger Beer', monto: 90 },
    { mes: '2026-10-01', cliente: 'EWU Ginger Beer', monto: 25 }, // ya pagado este mes
    { mes: '2025-10-01', cliente: 'Bar X', monto: 500 },
    { mes: '2025-10-01', cliente: 'Cervecera Bundor SPA', monto: 40 },
    { mes: '2025-10-01', cliente: 'Cliente PDV', monto: 999 }, // contado: no cuenta
  ]
  const r = construirEscenarios(base, cons, cobros, '2026-10-02')
  const [c, b, o] = r.escenarios

  it('EWU con su mínimo / promedio / máximo de los 3 meses cerrados, descontando lo ya pagado en el mes', () => {
    expect(r.supuestos.ewu).toMatchObject({ min: 30, promedio: 60, max: 90, meses: 3 })
    expect(c.meses[0].enlatado).toBe(10 + 5) // 30 − 25 ya pagado
    expect(b.meses[0].enlatado).toBe(10 + 35)
    expect(o.meses[1].enlatado).toBe(20 + 90)
  })

  it('conservador usa la venta al ritmo actual; cada escenario recupera lo atrasado a su ritmo medido', () => {
    expect(c.meses[0].atrasadas).toBeCloseTo(40, 6) // 4% de 1000
    expect(c.meses[1].mayoristas).toBeCloseTo(90 + 960 * 0.04, 6)
    expect(b.meses[0].atrasadas).toBeCloseTo(60, 6) // 6%
    expect(o.meses[0].mayoristas).toBeCloseTo(100 + 130, 6) // 13%
    expect(o.meses[1].mayoristas).toBeCloseTo(200 + 870 * 0.13, 6)
  })

  it('la composición suma el total y se informa lo que queda sin cobrar al cierre', () => {
    for (const m of b.meses) expect(m.real + m.facturas + m.atrasadas + m.venta + m.ewu).toBeCloseTo(m.total, 6)
    // cartera 1050 = 1000 atrasado + 50 al día (sin cobro en el horizonte en este caso de prueba)
    expect(r.supuestos.quedanAlCierre.base).toBeCloseTo(1050 - (60 + 940 * 0.06), 6)
  })

  it('año anterior: sólo crédito, separado mayoristas / enlatado', () => {
    expect(r.anioAnterior[0]).toMatchObject({ mes: '2026-10', mayoristas: 500, enlatado: 40, total: 540 })
  })
})
