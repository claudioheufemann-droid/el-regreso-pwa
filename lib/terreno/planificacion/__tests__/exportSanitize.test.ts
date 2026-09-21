import { describe, it, expect } from 'vitest'
import { celdaSegura, filaSegura } from '../exportSanitize'

describe('celdaSegura — protección contra inyección de fórmulas', () => {
  it.each(['=SUM(A1:A9)', '+1+1', '-cmd|calc', '@SUM(1,1)', '\tformula', '\rformula'])(
    'antepone apóstrofo a un valor peligroso: %s',
    (valor) => {
      expect(celdaSegura(valor)).toBe(`'${valor}`)
    },
  )

  it('no toca texto normal', () => {
    expect(celdaSegura('Fruteria Los Robles')).toBe('Fruteria Los Robles')
  })

  it('no toca números, booleanos ni null/undefined', () => {
    expect(celdaSegura(15000)).toBe(15000)
    expect(celdaSegura(true)).toBe(true)
    expect(celdaSegura(null)).toBe(null)
    expect(celdaSegura(undefined)).toBe(undefined)
  })
})

describe('filaSegura — aplica la sanitización a toda una fila', () => {
  it('sanitiza sólo los campos string peligrosos, deja el resto intacto', () => {
    const fila = { Vendedor: '=HYPERLINK("http://evil")', Monto: 15000, Aprobado: true, Nota: null as string | null }
    expect(filaSegura(fila)).toEqual({
      Vendedor: "'=HYPERLINK(\"http://evil\")",
      Monto: 15000,
      Aprobado: true,
      Nota: null,
    })
  })
})
