/**
 * Protección contra inyección de fórmulas (CSV/Excel injection): un valor de texto que
 * empieza con `=`, `+`, `-`, `@`, tab o retorno de carro se interpreta como fórmula al
 * abrirse en Excel/Sheets. Se antepone un apóstrofo — Excel lo muestra como texto plano
 * y no evalúa nada. Sólo aplica a strings; números/fechas/booleanos no se tocan.
 */
export function celdaSegura(valor: unknown): unknown {
  if (typeof valor !== 'string') return valor
  if (/^[=+\-@\t\r]/.test(valor)) return `'${valor}`
  return valor
}

/** Aplica celdaSegura a todos los valores string de un objeto plano (una fila). */
export function filaSegura<T extends Record<string, unknown>>(fila: T): T {
  const resultado = {} as T
  for (const [k, v] of Object.entries(fila)) {
    (resultado as Record<string, unknown>)[k] = celdaSegura(v)
  }
  return resultado
}
