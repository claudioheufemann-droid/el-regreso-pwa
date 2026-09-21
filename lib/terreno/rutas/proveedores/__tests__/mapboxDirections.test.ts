import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mapboxDirectionsProvider } from '../mapboxDirections'

/**
 * No necesita un MAPBOX_ACCESS_TOKEN real: simula la respuesta de la API con la forma
 * exacta que documenta Mapbox Directions v5, para probar que el código de integración
 * (armado de la URL, parseo de distancia/tramos, manejo de errores) es correcto de
 * antemano. Lo único que falta cuando Claudio consiga el token es pegarlo en el
 * entorno — este archivo es la prueba de que, ese día, "simplemente va a funcionar".
 */

const origenValdivia = { lat: -39.8142, lng: -73.2459 }
const paradaOsorno = { lat: -40.5738, lng: -73.1367 }

function mockFetchOk(body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    statusText: 'OK',
    json: () => Promise.resolve(body),
  })
}

describe('mapboxDirectionsProvider.disponible', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('false sin MAPBOX_ACCESS_TOKEN configurado', () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', '')
    expect(mapboxDirectionsProvider.disponible()).toBe(false)
  })

  it('true con MAPBOX_ACCESS_TOKEN configurado', () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'pk.test_token')
    expect(mapboxDirectionsProvider.disponible()).toBe(true)
  })
})

describe('mapboxDirectionsProvider.calcularRuta', () => {
  const fetchOriginal = global.fetch

  beforeEach(() => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', 'pk.test_token')
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    global.fetch = fetchOriginal
  })

  it('rechaza sin token, sin llamar a la red', async () => {
    vi.stubEnv('MAPBOX_ACCESS_TOKEN', '')
    global.fetch = vi.fn()
    await expect(mapboxDirectionsProvider.calcularRuta(origenValdivia, [paradaOsorno])).rejects.toThrow(/MAPBOX_ACCESS_TOKEN/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rechaza con menos de 2 puntos (origen solo, sin paradas ni destino)', async () => {
    global.fetch = vi.fn()
    await expect(mapboxDirectionsProvider.calcularRuta(origenValdivia, [])).rejects.toThrow(/al menos 2 puntos/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rechaza con más de 25 puntos (límite real de la API) sin llamar a la red', async () => {
    global.fetch = vi.fn()
    const paradas = Array.from({ length: 26 }, () => paradaOsorno)
    await expect(mapboxDirectionsProvider.calcularRuta(origenValdivia, paradas)).rejects.toThrow(/Demasiadas paradas/)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('arma la URL con coordenadas en orden lng,lat (el que exige Mapbox) y el access_token', async () => {
    const fetchMock = mockFetchOk({
      routes: [{ distance: 78234.5, duration: 4210.2, legs: [{ distance: 78234.5, duration: 4210.2 }] }],
    })
    global.fetch = fetchMock

    await mapboxDirectionsProvider.calcularRuta(origenValdivia, [], paradaOsorno)

    const urlLlamada = fetchMock.mock.calls[0][0] as string
    expect(urlLlamada).toContain(`${origenValdivia.lng},${origenValdivia.lat}`)
    expect(urlLlamada).toContain(`${paradaOsorno.lng},${paradaOsorno.lat}`)
    expect(urlLlamada).toContain('access_token=pk.test_token')
    expect(urlLlamada).toMatch(/^https:\/\/api\.mapbox\.com\/directions\/v5\/mapbox\/driving\//)
  })

  it('parsea distancia total, duración y tramos de una respuesta real de Directions v5 (Valdivia → 2 paradas → Osorno)', async () => {
    global.fetch = mockFetchOk({
      routes: [{
        distance: 210530.8,
        duration: 9840.4,
        legs: [
          { distance: 52000.1, duration: 2100.0 },
          { distance: 98000.3, duration: 4200.0 },
          { distance: 60530.4, duration: 3540.4 },
        ],
      }],
    })

    const parada2 = { lat: -40.1, lng: -73.0 }
    const r = await mapboxDirectionsProvider.calcularRuta(origenValdivia, [paradaOsorno, parada2], origenValdivia)

    expect(r.distanciaTotalM).toBe(210531) // redondeado
    expect(r.duracionTotalS).toBe(9840)
    expect(r.tramos).toHaveLength(3)
    expect(r.tramos[0]).toEqual({ desdeIndice: 0, hastaIndice: 1, distanciaM: 52000, duracionS: 2100 })
    expect(r.tramos[2]).toEqual({ desdeIndice: 2, hastaIndice: 3, distanciaM: 60530, duracionS: 3540 })
    // Suma de tramos = distancia total (ningún metro se pierde ni se inventa al redondear por tramo).
    const sumaTramos = r.tramos.reduce((s, t) => s + t.distanciaM, 0)
    expect(Math.abs(sumaTramos - r.distanciaTotalM)).toBeLessThanOrEqual(1)
  })

  it('rechaza con un mensaje claro si Mapbox responde sin rutas (ej. NoRoute, token inválido)', async () => {
    global.fetch = mockFetchOk({ code: 'NoRoute', message: 'No route found' })
    await expect(mapboxDirectionsProvider.calcularRuta(origenValdivia, [paradaOsorno])).rejects.toThrow(/No route found/)
  })

  it('rechaza si la respuesta HTTP no es ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, statusText: 'Unauthorized', json: () => Promise.resolve({ message: 'Not Authorized - Invalid Token' }),
    })
    await expect(mapboxDirectionsProvider.calcularRuta(origenValdivia, [paradaOsorno])).rejects.toThrow(/Invalid Token/)
  })
})
