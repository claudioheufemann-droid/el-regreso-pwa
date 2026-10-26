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
    expect(s.porCobrar).toBe(5000)
    expect(s.total).toBe(6000)
    expect(s.dias[1].porCobrar).toBe(2000) // martes: vencida sin pagar
    expect(s.dias[3].entro).toBeNull() // jueves todavía no pasa
  })

  it('el vencimiento de fin de semana pasa al lunes siguiente', () => {
    expect(semana('2026-11-02').dias[0].porCobrar).toBe(4000)
    expect(semana('2026-10-26').dias[5].porCobrar).toBe(0)
  })

  it('lo vencido antes de esta semana va aparte y la semana pasada sólo muestra lo que entró', () => {
    expect(r.vencidoAntes).toEqual({ monto: 1000, facturas: 1 })
    const pasada = semana('2026-10-19')
    expect(pasada.estado).toBe('pasada')
    expect(pasada.entro).toBe(500)
    expect(pasada.porCobrar).toBe(0)
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
    expect(s.porCobrar).toBe(100)
  })

  it('muestra al menos 5 semanas hacia adelante y el último pago cargado', () => {
    expect(r.semanas.filter(s => s.estado !== 'pasada')).toHaveLength(5)
    expect(r.ultimoPago).toBe('2026-10-28')
  })
})
