import { describe, expect, it } from 'vitest'
import { cobrosConfirmados, fechaCobroEsperada, perfilesPago, semanasHasta } from '../cajaCobrada'
import type { FacturaImpaga } from '../proyeccionCobros'

// 2026-10-05 es lunes. Emisión común para comparar plazos.
const HOY = '2026-10-05'
const HASTA = '2026-12-31'
const EMISION = '2026-10-05'

const pactados = new Map([
  ['plazo1', 1], ['plazo7', 7], ['plazo15', 15], ['plazo30', 30],
  ['moroso', 15], ['adelantado', 30], ['nuevo', 7], ['nuevo moroso', 7],
])

// Días reales ponderados (emisión → pago). Los cuatro "plazoN" pagan exacto al vencimiento.
const perfiles = perfilesPago({
  pagos: [
    { cliente: 'plazo1', pagos: 10, monto: 1_000_000, diasPonderado: 1 },
    { cliente: 'plazo7', pagos: 10, monto: 1_000_000, diasPonderado: 7 },
    { cliente: 'plazo15', pagos: 10, monto: 1_000_000, diasPonderado: 15 },
    { cliente: 'plazo30', pagos: 10, monto: 1_000_000, diasPonderado: 30 },
    { cliente: 'moroso', pagos: 8, monto: 2_000_000, diasPonderado: 45 }, // +30 días
    { cliente: 'adelantado', pagos: 6, monto: 1_000_000, diasPonderado: 22 }, // −8 días
    { cliente: 'nuevo', pagos: 2, monto: 500_000, diasPonderado: 40 }, // historial insuficiente
  ],
  pactadoPorCliente: pactados,
  morosos: new Set(['moroso', 'nuevo moroso']),
  pactadoPorDefecto: 15,
})

describe('perfilesPago', () => {
  it('usa el desvío propio con 3+ pagos', () => {
    expect(perfiles.perfilDe('plazo30')).toMatchObject({ fuente: 'propio', pactado: 30, desvio: 0 })
    expect(perfiles.perfilDe('Moroso')).toMatchObject({ fuente: 'propio', desvio: 30, segmento: 'moroso' })
  })

  it('cliente que paga antes: desvío negativo', () => {
    expect(perfiles.perfilDe('adelantado').desvio).toBe(-8)
  })

  it('historial insuficiente: toma el desvío de su segmento, no el propio', () => {
    const p = perfiles.perfilDe('nuevo')
    expect(p.fuente).toBe('segmento')
    expect(p.segmento).toBe('cumple')
    // cumple = plazo1..30 (desvío 0, $4M) + adelantado (−8, $1M) → −1,6 ponderado
    expect(p.desvio).toBeCloseTo(-1.6, 5)
    expect(perfiles.perfilDe('nuevo moroso')).toMatchObject({ fuente: 'segmento', segmento: 'moroso', desvio: 30 })
  })

  it('cliente sin ficha usa el plazo por defecto', () => {
    expect(perfiles.perfilDe('desconocido').pactado).toBe(15)
  })
})

describe('fechaCobroEsperada', () => {
  it.each([
    ['plazo1', '2026-10-06'],
    ['plazo7', '2026-10-12'],
    ['plazo15', '2026-10-20'],
    ['plazo30', '2026-11-04'],
  ])('%s cobra al vencimiento', (cliente, esperado) => {
    expect(fechaCobroEsperada(EMISION, perfiles.perfilDe(cliente)).cobro).toBe(esperado)
  })

  it('moroso: vencimiento + 30 días de atraso', () => {
    const r = fechaCobroEsperada(EMISION, perfiles.perfilDe('moroso'))
    expect(r.vencimiento).toBe('2026-10-20')
    expect(r.cobro).toBe('2026-11-19') // 45 días, jueves
  })

  it('el que paga antes cobra antes del vencimiento', () => {
    const r = fechaCobroEsperada(EMISION, perfiles.perfilDe('adelantado'))
    expect(r.vencimiento).toBe('2026-11-04')
    expect(r.cobro).toBe('2026-10-27')
  })

  it('fin de semana se corre al lunes', () => {
    // emisión jueves 8-oct + 2 días = sábado 10 → lunes 12
    expect(fechaCobroEsperada('2026-10-08', { pactado: 2, desvio: 0 }).cobro).toBe('2026-10-12')
  })

  it('nunca antes de la emisión', () => {
    expect(fechaCobroEsperada(EMISION, { pactado: 7, desvio: -20 }).cobro).toBe(EMISION)
  })
})

describe('cobrosConfirmados', () => {
  const f = (cliente: string, fechaEntrega: string, bruto: number): FacturaImpaga => ({ cliente, fechaEntrega, bruto })
  const facturas = new Map<string, FacturaImpaga>([
    ['F1', f('plazo1', EMISION, 100)],
    ['F7', f('plazo7', EMISION, 700)],
    ['F15', f('plazo15', EMISION, 1500)],
    ['F30', f('plazo30', EMISION, 3000)],
    ['VIEJA', f('plazo7', '2026-09-01', 50)], // debió pagarse el 8-sep
    ['LEJOS', f('plazo30', '2026-12-20', 999)], // vence en enero
  ])
  const r = cobrosConfirmados({ facturas, perfiles, hoyISO: HOY, hastaISO: HASTA })
  const sem = (lunes: string) => r.semanas.find(s => s.lunes === lunes)!

  it('asigna cada factura a la semana ISO de su cobro', () => {
    expect(sem('2026-10-05')).toMatchObject({ confirmado: 100, semanaIso: 41 })
    expect(sem('2026-10-12').confirmado).toBe(700)
    expect(sem('2026-10-19').confirmado).toBe(1500)
    expect(sem('2026-11-02').confirmado).toBe(3000)
  })

  it('lo atrasado y lo posterior al horizonte quedan aparte, y nada se pierde', () => {
    expect(r.atrasado).toMatchObject({ monto: 50, facturas: 1 })
    expect(r.despuesDelHorizonte).toMatchObject({ monto: 999, facturas: 1 })
    const enSemanas = r.semanas.reduce((s, x) => s + x.confirmado, 0)
    expect(enSemanas + r.atrasado.monto + r.despuesDelHorizonte.monto).toBe(r.total)
  })

  it('las semanas van de la actual al 31-dic', () => {
    const s = semanasHasta(HOY, HASTA)
    expect(s[0].lunes).toBe('2026-10-05')
    expect(s[s.length - 1].lunes).toBe('2026-12-28')
  })
})
