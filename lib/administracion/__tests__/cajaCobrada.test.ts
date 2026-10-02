import { describe, expect, it } from 'vitest'
import { armarCajaCobrada, cobrosConfirmados, cobrosProyectados, fechaCobroEsperada, mixDePlazos, perfilesPago, repartirEnDias, semanasHasta } from '../cajaCobrada'
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

describe('mixDePlazos', () => {
  it('reparte la venta por plazo y mide los días reales de cada tramo', () => {
    const mix = mixDePlazos([
      { cliente: 'plazo7', bruto: 300 },
      { cliente: 'plazo30', bruto: 600 },
      { cliente: 'adelantado', bruto: 100 }, // pactado 30, paga a 22
      { cliente: 'Cliente PDV', bruto: 5000 }, // contado: no entra
    ], perfiles)
    expect(mix.map(t => t.pactado)).toEqual([7, 30])
    expect(mix[0]).toMatchObject({ participacion: 0.3, diasMedios: 7 })
    expect(mix[1].participacion).toBeCloseTo(0.7, 10)
    expect(mix[1].diasMedios).toBeCloseTo((600 * 30 + 100 * 22) / 700, 10)
  })
})

describe('repartirEnDias', () => {
  it('respeta el patrón semanal y no reparte antes de `desde`', () => {
    const patron = [1, 1, 1, 1, 1, 0, 0] // sólo lun-vie
    const r = repartirEnDias('2026-10-05', '2026-10-11', 500, patron, '2026-10-07')
    expect(r.map(x => x.fecha)).toEqual(['2026-10-07', '2026-10-08', '2026-10-09'])
    expect(r.reduce((s, x) => s + x.monto, 0)).toBeCloseTo(500, 10)
  })

  it('sin patrón útil reparte parejo lun-vie', () => {
    const r = repartirEnDias('2026-10-10', '2026-10-12', 90, [0, 0, 0, 0, 0, 1, 1], '2026-10-01')
    expect(r).toEqual([{ fecha: '2026-10-10', monto: 45 }, { fecha: '2026-10-11', monto: 45 }])
  })
})

describe('cobrosProyectados', () => {
  const mix = [{ pactado: 7, participacion: 0.5, diasMedios: 7 }, { pactado: 30, participacion: 0.5, diasMedios: 30 }]
  it('aplica el mix a la venta del forecast y el perfil del cliente a los pedidos', () => {
    const r = cobrosProyectados({
      emisiones: [
        { fecha: '2026-10-05', bruto: 1000, origen: 'forecast' },
        { fecha: '2026-10-05', bruto: 200, origen: 'pedido', cliente: 'moroso' },
      ],
      mix, perfiles, hastaISO: HASTA,
    })
    expect(r.porSemana.get('2026-10-12')).toBe(500) // +7 días
    expect(r.porSemana.get('2026-11-02')).toBe(500) // +30 días, miércoles 4-nov
    expect(r.porSemana.get('2026-11-16')).toBe(200) // moroso: 45 días
    expect(r.total).toBe(1200)
  })

  it('lo que se cobraría después del horizonte queda aparte', () => {
    const r = cobrosProyectados({ emisiones: [{ fecha: '2026-12-20', bruto: 100, origen: 'forecast' }], mix, perfiles, hastaISO: HASTA })
    expect(r.despuesDelHorizonte).toBe(50)
    expect(r.cobros.reduce((s, c) => s + c.monto, 0)).toBe(50)
  })
})

describe('armarCajaCobrada', () => {
  const facturas = new Map<string, FacturaImpaga>([
    ['A', { cliente: 'plazo7', fechaEntrega: '2026-10-05', bruto: 700 }],
    ['B', { cliente: 'plazo30', fechaEntrega: '2026-12-15', bruto: 300 }], // cobra el 14-ene
    ['C', { cliente: 'plazo7', fechaEntrega: '2026-09-01', bruto: 50 }], // atrasada
  ])
  const confirmados = cobrosConfirmados({ facturas, perfiles, hoyISO: HOY, hastaISO: HASTA })
  const mix = [{ pactado: 7, participacion: 1, diasMedios: 7 }]
  const emisiones = [{ fecha: '2026-10-20', bruto: 1000, origen: 'forecast' as const }, { fecha: '2026-12-28', bruto: 400, origen: 'forecast' as const }]
  const proyectados = cobrosProyectados({ emisiones, mix, perfiles, hastaISO: HASTA })
  const caja = armarCajaCobrada({
    confirmados, proyectados, emisiones, contadoSemanal: 70, salidasPorSemana: new Map([['2026-10-12', 100]]),
    saldoInicialBanco: 5000, hoyISO: HOY, hastaISO: HASTA, realMesEnCurso: { facturado: 10, cobrado: 20 },
  })

  it('separa confirmado, proyectado y contado, y acumula desde el saldo de bancos', () => {
    const s = caja.semanas.find(x => x.lunes === '2026-10-12')!
    expect(s).toMatchObject({ confirmado: 700, proyectado: 0, contado: 70, salidas: 100, neto: 670 })
    expect(caja.semanas[0].acumulado).toBe(5000 + 70) // semana del 5-oct: sólo contado
  })

  it('tabla mensual: facturado vs cobrado y saldo por cobrar al cierre', () => {
    const oct = caja.meses.find(m => m.mes === '2026-10')!
    expect(oct).toMatchObject({ facturado: 1010, cobrado: 1720 }) // 1000 + real 10 | 700 + 1000 + real 20
    expect(oct.saldoCierre).toBe(1050 + 1000 - 1700) // cartera inicial + facturado − cobrado futuros
    expect(caja.meses.map(m => m.mes)).toEqual(['2026-10', '2026-11', '2026-12'])
  })

  it('cuadra: cartera inicial + facturado = cobrado + saldo por cobrar', () => {
    expect(caja.cuadratura.ok).toBe(true)
    // saldo final = atrasada C (50) + B en enero (300) + lo del 28-dic que se cobra en enero (400)
    expect(caja.cuadratura.saldoFinal).toBe(750)
  })

  it('falla con mensaje claro si se pierde plata en el reparto', () => {
    const roto = armarCajaCobrada({
      confirmados, proyectados: { ...proyectados, cobros: proyectados.cobros.slice(1) }, emisiones, contadoSemanal: 0,
      salidasPorSemana: new Map(), saldoInicialBanco: null, hoyISO: HOY, hastaISO: HASTA, realMesEnCurso: { facturado: 0, cobrado: 0 },
    })
    expect(roto.cuadratura.ok).toBe(false)
    expect(roto.cuadratura.mensaje).toMatch(/No cuadra por \$1\.000/)
  })
})
