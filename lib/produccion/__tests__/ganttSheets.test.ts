import { describe, it, expect } from 'vitest'
import { construirLotes, interpretarTexto } from '../ganttSheets'

const ferm = [
  { nombre: 'Fermentador K-1', capacidad_litros: 2000, categoria: 'kombucha' },
  { nombre: 'Fermentador K-6', capacidad_litros: 1300, categoria: 'kombucha' },
  { nombre: 'Fermentador T1', capacidad_litros: 1500, categoria: 'cerveza' },
]

describe('interpretarTexto', () => {
  it('lee nombre corto y litros, con o sin espacio', () => {
    expect(interpretarTexto('BERRY 2000 L')).toEqual({ producto: 'Kombucha Berry Menta', litros: 2000 })
    expect(interpretarTexto('PIÑA1200 L')).toEqual({ producto: 'Kombucha Experimental Piña Albahaca', litros: 1200 })
    expect(interpretarTexto('MAQUI  1200 L')).toEqual({ producto: 'Kombucha Maqui', litros: 1200 })
    expect(interpretarTexto('LEMON 2000L')).toEqual({ producto: 'Kombucha Lemon', litros: 2000 })
  })
  it('sin receta conocida conserva el nombre del Sheets', () => {
    expect(interpretarTexto('Red el growler ')).toEqual({ producto: 'Red El Growler', litros: null })
    expect(interpretarTexto('Por Definir 1200 L')).toEqual({ producto: 'Por definir', litros: 1200 })
  })
})

describe('construirLotes', () => {
  const hoy = '2026-10-09'

  it('arma el lote con días inclusivos y litros del texto o del tanque', () => {
    const { lotes, omitidas } = construirLotes([
      { tanque: 'Fermentador K-1', inicio: '2026-10-16', fin: '2026-10-29', texto: 'BERRY 2000 L' },
      { tanque: 'Fermentador T1', inicio: '2026-10-01', fin: '2026-10-25', texto: 'PORTER' },
    ], ferm, [], hoy)
    expect(omitidas).toEqual([])
    expect(lotes[0]).toMatchObject({ clave_externa: 'sheets:Fermentador K-1:2026-10-16', dias_ocupacion: 14, litros_planificados: 2000, categoria: 'kombucha' })
    expect(lotes[1]).toMatchObject({ producto: 'Porter', litros_planificados: 1500, categoria: 'cerveza', dias_ocupacion: 25 })
  })

  it('no sube barras que ya terminaron y omite tanques desconocidos', () => {
    const { lotes, omitidas } = construirLotes([
      { tanque: 'Fermentador K-1', inicio: '2026-09-04', fin: '2026-09-17', texto: 'BERRY 2000 L' },
      { tanque: 'Fermentador Z-9', inicio: '2026-10-20', fin: '2026-10-30', texto: 'LEMON 1000 L' },
    ], ferm, [], hoy)
    expect(lotes).toEqual([])
    expect(omitidas.map(o => o.motivo)).toEqual(['tanque desconocido'])
  })

  it('lo real manda: omite la barra que choca con un lote en curso del mismo tanque', () => {
    const { lotes, omitidas } = construirLotes([
      { tanque: 'Fermentador K-1', inicio: '2026-10-02', fin: '2026-10-15', texto: 'MARACUYA 2000 L' },
      { tanque: 'Fermentador K-1', inicio: '2026-10-16', fin: '2026-10-29', texto: 'BERRY 2000 L' },
    ], ferm, [{ fermentador: 'Fermentador K-1', fecha_inicio: '2026-09-28', dias: 12 }], hoy)
    // en curso 28-sep + 12 días → hasta el 9-oct: choca con la primera, no con la segunda
    expect(omitidas).toHaveLength(1)
    expect(omitidas[0].motivo).toContain('en curso')
    expect(lotes.map(l => l.fecha_planificada)).toEqual(['2026-10-16'])
  })
})
