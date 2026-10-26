import { describe, expect, it } from 'vitest'
import { armarCobrosSemanales } from '../cobrosSemanales'
import type { FacturaCalendario } from '../proyeccionCobros'

const f = (factura: string, vence: string, bruto: number): FacturaCalendario => ({
  cliente: `Cliente ${factura}`, factura, bruto, fechaEsperada: vence, fechaEsperadaPactada: vence,
  diasCredito: 30, diasAtraso: 0, diasAtrasoPactado: 0,
})

// Miércoles 28-oct-2026: semana en curso = lun 26-oct → dom 1-nov.
const hoy = '2026-10-28'

describe('armarCobrosSemanales', () => {
  const r = armarCobrosSemanales({
    hoyISO: hoy,
    pendientes: [
      f('A', '2026-10-20', 1000), // venció la semana pasada → vencido antes
      f('B', '2026-10-27', 2000), // venció ayer, sigue impaga → cuenta en la semana en curso
      f('C', '2026-10-30', 3000), // vence el viernes
      f('D', '2026-10-31', 4000), // vence sábado → se cobra el lunes 2-nov
    ],
    pagos: [
      { fecha: '2026-10-23', cliente: 'Teja Market', monto: 500 },
      { fecha: '2026-10-26', cliente: 'El Growler', monto: 700 },
      { fecha: '2026-10-28', cliente: 'Bar 55', monto: 300 },
    ],
  })
  const semana = (lunes: string) => r.semanas.find(s => s.lunes === lunes)!

  it('marca la semana en curso y suma lo que entró + lo que falta', () => {
    const s = semana('2026-10-26')
    expect(s.estado).toBe('en_curso')
    expect(s.numero).toBe(44)
    expect(s.domingo).toBe('2026-11-01')
    expect(s.entro).toBe(1000)
    expect(s.porEntrar).toBe(5000)
    expect(s.total).toBe(6000)
    expect(s.dias[1].porEntrar).toBe(2000) // martes: vencida sin pagar
    expect(s.dias[3].entro).toBeNull() // jueves todavía no pasa
  })

  it('el vencimiento de fin de semana pasa al lunes siguiente', () => {
    expect(semana('2026-11-02').dias[0].porEntrar).toBe(4000)
    expect(semana('2026-10-26').dias[5].porEntrar).toBe(0)
  })

  it('lo vencido antes de esta semana va aparte y la semana pasada sólo muestra lo que entró', () => {
    expect(r.vencidoAntes).toEqual({ monto: 1000, facturas: 1 })
    const pasada = semana('2026-10-19')
    expect(pasada.estado).toBe('pasada')
    expect(pasada.entro).toBe(500)
    expect(pasada.porEntrar).toBe(0)
  })

  it('deja fuera PDV, BaseCamp y enlatado móvil (pagos y facturas)', () => {
    const otro = armarCobrosSemanales({
      hoyISO: hoy,
      pendientes: [
        { ...f('E', '2026-10-30', 9000), cliente: 'EWU Ginger Beer' },
        { ...f('G', '2026-10-30', 8000), cliente: 'BaseCamp El Regreso' },
        f('H', '2026-10-30', 100),
      ],
      pagos: [
        { fecha: '2026-10-26', cliente: 'Cliente PDV', monto: 1 },
        { fecha: '2026-10-26', cliente: 'EWU Ginger Beer', monto: 2 },
        { fecha: '2026-10-26', cliente: 'Cervecera Bundor SPA', monto: 4 },
        { fecha: '2026-10-26', cliente: 'BaseCamp El Regreso', monto: 8 },
        { fecha: '2026-10-26', cliente: 'Cliente Feria', monto: 16 },
        { fecha: '2026-10-26', cliente: 'Teja Market', monto: 32 },
      ],
    })
    const s = otro.semanas.find(x => x.estado === 'en_curso')!
    expect(s.entro).toBe(32)
    expect(s.porEntrar).toBe(100)
  })

  it('con los filtros suma cada tipo de venta por separado', () => {
    const pagos = [
      { fecha: '2026-10-26', cliente: 'Cliente PDV', monto: 100 },
      { fecha: '2026-10-26', cliente: 'EWU Ginger Beer', monto: 200 },
      { fecha: '2026-10-26', cliente: 'Teja Market', monto: 400 },
      { fecha: '2026-10-26', cliente: 'BaseCamp El Regreso', monto: 999 }, // cuenta interna: nunca cuenta
    ]
    const contado = {
      mostradorSemanal: 700, patronMostrador: [1, 1, 1, 1, 1, 1, 1].map(x => x / 7),
      ventasBasecamp: { '2026-10-26': 50 }, ultimaFechaBasecamp: '2026-10-26',
      basecampSemanal: 1400, patronBasecamp: [1, 1, 1, 1, 1, 1, 1].map(x => x / 7),
    }
    const todo = armarCobrosSemanales({ hoyISO: hoy, pendientes: [{ ...f('B', '2026-10-30', 3000), cliente: 'Cervecera Bundor SPA' }], pagos, contado, segmentos: ['fabrica', 'enlatado', 'pdv', 'basecamp'] })
    const s = todo.semanas.find(x => x.estado === 'en_curso')!
    expect(s.dias[0].entroPor).toEqual({ fabrica: 400, enlatado: 200, pdv: 100, basecamp: 50 })
    // PDV: lunes y martes ya pasaron (hoy es miércoles), se estima de miércoles a domingo: 5 × 100.
    expect(s.totalPor.pdv).toBe(100 + 500)
    // BaseCamp: cargado sólo hasta el lunes → martes a domingo estimados: 6 × 200.
    expect(s.totalPor.basecamp).toBe(50 + 1200)
    expect(s.totalPor.enlatado).toBe(200 + 3000)

    const soloPdv = armarCobrosSemanales({ hoyISO: hoy, pendientes: [f('C', '2026-10-30', 3000)], pagos, contado, segmentos: ['pdv'] })
    const p = soloPdv.semanas.find(x => x.estado === 'en_curso')!
    expect(p.entro).toBe(100)
    expect(p.porEntrar).toBe(500)
    expect(p.facturas).toBe(0)
  })

  it('muestra al menos 5 semanas hacia adelante y el último pago cargado', () => {
    expect(r.semanas.filter(s => s.estado !== 'pasada')).toHaveLength(5)
    expect(r.ultimoPago).toBe('2026-10-28')
  })
})
