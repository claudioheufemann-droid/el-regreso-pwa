import { describe, expect, it } from 'vitest'
import { construirEscenarios, type DatosCajaCobrada } from '../cajaCobradaDatos'

/** Sólo los campos que usa construirEscenarios. */
const datos = (meses: { mes: string; mayoristas: number; enlatado: number; real?: number }[], atrasado: number) =>
  ({
    mesesPorGrupo: meses.map(m => ({ ...m, real: m.real ?? 0, facturas: m.mayoristas / 2, venta: m.mayoristas / 2 + m.enlatado - (m.real ?? 0), atrasadas: 0 })),
    caja: { atrasado: { monto: atrasado, facturas: 1, detalle: [] }, cuadratura: { carteraInicial: atrasado + 50 } },
    fuenteVenta: { modo: 'litros', precioLitro: 3800, ciclosPrecio: 3, precioImplicitoFinanzas: 4150, diferenciaFinanzas: 0.09 },
  }) as unknown as DatosCajaCobrada

describe('construirEscenarios', () => {
  const base = datos([{ mes: '2026-10', mayoristas: 100, enlatado: 10, real: 20 }, { mes: '2026-11', mayoristas: 200, enlatado: 20 }], 1000)
  const cobros = [
    { mes: '2026-07-01', cliente: 'EWU Ginger Beer', monto: 30 },
    { mes: '2026-08-01', cliente: 'EWU Ginger Beer', monto: 60 },
    { mes: '2026-09-01', cliente: 'EWU Ginger Beer', monto: 90 },
    { mes: '2026-10-01', cliente: 'EWU Ginger Beer', monto: 25 }, // ya pagado este mes
    { mes: '2025-10-01', cliente: 'Bar X', monto: 500 },
    { mes: '2025-10-01', cliente: 'Cervecera Bundor SPA', monto: 40 },
    { mes: '2025-10-01', cliente: 'Cliente PDV', monto: 999 }, // contado: no cuenta
  ]
  const r = construirEscenarios(base, cobros, '2026-10-02')
  const [bajo, b, alto] = r.escenarios

  it('base: EWU a su promedio de los 3 meses cerrados, descontando lo ya pagado en el mes', () => {
    expect(r.supuestos.ewu).toMatchObject({ min: 30, promedio: 60, max: 90, meses: 3 })
    expect(b.meses[0].ewu).toBe(35) // 60 − 25
    expect(b.meses[1].ewu).toBe(60)
    expect(b.meses[0].total).toBe(100 + 10 + 35)
  })

  it('bajo y alto = base ± error del backtest de cada horizonte, sin tocar lo ya cobrado', () => {
    const t0 = b.meses[0].total, t1 = b.meses[1].total
    expect(bajo.meses[0].total).toBeCloseTo(20 + (t0 - 20) * (1 - 0.24), 6)
    expect(alto.meses[0].total).toBeCloseTo(20 + (t0 - 20) * (1 + 0.24), 6)
    expect(alto.meses[1].total).toBeCloseTo(t1 * (1 + 0.23), 6)
    expect(bajo.meses[0].real).toBe(20)
    for (const e of [bajo, alto]) for (const m of e.meses) expect(m.mayoristas + m.enlatado).toBeCloseTo(m.total, 6)
  })

  it('la composición suma el total', () => {
    for (const e of r.escenarios) for (const m of e.meses) expect(m.real + m.facturas + m.atrasadas + m.venta + m.ewu).toBeCloseTo(m.total, 6)
  })

  it('año anterior: sólo crédito, separado mayoristas / enlatado', () => {
    expect(r.anioAnterior[0]).toMatchObject({ mes: '2026-10', mayoristas: 500, enlatado: 40, total: 540 })
  })
})
