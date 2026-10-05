import { describe, expect, it } from 'vitest'
import { ciclosDisponibles, impagoDe, resumirPagadoCiclo, totalDe, type FilaPagadoCiclo } from '../pagadoPorCiclo'

const SEP = '2026-09-01'
const f = (vendedor: string, cliente: string, estado: FilaPagadoCiclo['estado'], litros: number, neto = litros * 3000, ciclo = SEP, facturas = 1): FilaPagadoCiclo =>
  ({ ciclo, vendedor, cliente, estado, facturas, litros, neto })

const filas: FilaPagadoCiclo[] = [
  f('Nicol', 'Bar Uno', 'pagada', 100),
  f('Nicol', 'Bar Uno', 'vencida', 50),
  f('Nicol', 'Bar Dos', 'vencida', 80, 240_000, SEP, 2),
  f('Claudio', 'Super Grande', 'en_plazo', 500),
  f('Claudio', 'Super Chico', 'sin_plazo', 10),
  // fuera: cuentas internas y otro ciclo
  f('Sin vendedor', 'Cliente PDV', 'pagada', 900),
  f('Sin vendedor', 'BaseCamp El Regreso', 'en_plazo', 300),
  f('Nicol', 'Bar Uno', 'vencida', 999, 0, '2026-08-01'),
]

describe('resumirPagadoCiclo', () => {
  const r = resumirPagadoCiclo(filas, SEP)

  it('saca PDV, BaseCamp y otros ciclos', () => {
    expect(r.vendedores.map(v => v.vendedor)).toEqual(['Claudio', 'Nicol'])
    expect(totalDe(r.total.litros)).toBe(740)
  })

  it('separa pagado, vencido, en plazo y sin plazo', () => {
    expect(r.total.litros).toEqual({ pagada: 100, vencida: 130, en_plazo: 500, sin_plazo: 10 })
    expect(impagoDe(r.total.litros)).toBe(640)
  })

  it('ordena el detalle con lo vencido primero y cuenta clientes vencidos', () => {
    const nicol = r.vendedores.find(v => v.vendedor === 'Nicol')!
    expect(nicol.detalle.map(c => c.cliente)).toEqual(['Bar Dos', 'Bar Uno'])
    expect(nicol.clientesVencidos).toBe(2)
    expect(nicol.detalle[0].facturasImpagas).toBe(2)
    expect(r.total.clientesVencidos).toBe(2)
  })

  it('un ciclo sin datos da tabla vacía', () => {
    expect(resumirPagadoCiclo(filas, '2025-01-01').vendedores).toEqual([])
  })
})

describe('ciclosDisponibles', () => {
  it('del más reciente al más antiguo, sin repetir', () => {
    expect(ciclosDisponibles(filas)).toEqual([SEP, '2026-08-01'])
  })
})
