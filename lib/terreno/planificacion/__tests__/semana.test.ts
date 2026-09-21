import { describe, it, expect } from 'vitest'
import { semanaLunes, semanaSiguienteLunes, fechaLimitePresentacion, esEntregaTardia } from '../semana'

describe('semanaLunes — lunes de la semana en calendario de Santiago', () => {
  it('un lunes es lunes de sí mismo', () => {
    expect(semanaLunes('2026-09-28')).toBe('2026-09-28')
  })
  it('cualquier día de la semana cae en el mismo lunes', () => {
    expect(semanaLunes('2026-10-02')).toBe('2026-09-28') // viernes
    expect(semanaLunes('2026-10-04')).toBe('2026-09-28') // domingo
  })
})

describe('semanaSiguienteLunes — la semana que se presenta el viernes', () => {
  it('desde un lunes, la siguiente semana empieza 7 días después', () => {
    expect(semanaSiguienteLunes('2026-09-21')).toBe('2026-09-28')
  })
  it('desde un viernes (día de entrega), apunta al lunes de la semana entrante', () => {
    expect(semanaSiguienteLunes('2026-09-25')).toBe('2026-09-28')
  })
})

describe('fechaLimitePresentacion — viernes anterior (cambio operativo de Claudio vs. el PDF)', () => {
  it('el viernes anterior a un lunes es 3 días antes', () => {
    expect(fechaLimitePresentacion('2026-09-28')).toBe('2026-09-25')
  })
})

describe('esEntregaTardia', () => {
  it('presentar el mismo viernes límite NO es tardío', () => {
    expect(esEntregaTardia('2026-09-25T18:00:00Z', '2026-09-25')).toBe(false)
  })
  it('presentar el sábado siguiente al límite SÍ es tardío', () => {
    expect(esEntregaTardia('2026-09-26T10:00:00Z', '2026-09-25')).toBe(true)
  })
})
