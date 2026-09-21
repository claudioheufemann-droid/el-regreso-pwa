import { describe, it, expect } from 'vitest'
import { requiereAutorizacionPrevia, incrementoAutorizado } from '../validarUmbrales'

describe('requiereAutorizacionPrevia — umbral estricto, nunca >=', () => {
  it('exactamente en el umbral NO requiere autorización (> estricto, no >=)', () => {
    expect(requiereAutorizacionPrevia(250000, 250000)).toBe(false)
  })
  it('un peso arriba del umbral sí requiere autorización', () => {
    expect(requiereAutorizacionPrevia(250001, 250000)).toBe(true)
  })
  it('bajo el umbral no requiere autorización', () => {
    expect(requiereAutorizacionPrevia(100000, 250000)).toBe(false)
  })
})

describe('incrementoAutorizado — el monto aprobado no puede crecer sin autorización previa', () => {
  it('un monto igual o menor al anterior siempre está autorizado, sin necesitar autorizaciones previas', () => {
    expect(incrementoAutorizado(100000, 100000, 0)).toEqual({ autorizado: true, incrementoClp: 0 })
    expect(incrementoAutorizado(100000, 90000, 0)).toEqual({ autorizado: true, incrementoClp: -10000 })
  })
  it('un incremento sin autorizaciones previas aprobadas queda bloqueado', () => {
    const r = incrementoAutorizado(100000, 150000, 0)
    expect(r.autorizado).toBe(false)
    expect(r.incrementoClp).toBe(50000)
  })
  it('un incremento cubierto exactamente por autorizaciones previas aprobadas se permite', () => {
    expect(incrementoAutorizado(100000, 150000, 50000).autorizado).toBe(true)
  })
  it('un incremento que excede lo autorizado previamente sigue bloqueado', () => {
    expect(incrementoAutorizado(100000, 200000, 50000).autorizado).toBe(false)
  })
})
