/**
 * Preguntas de ejemplo que se muestran en el chat. Archivo aparte de
 * sistema.ts a propósito: este SÍ viaja al navegador, y sistema.ts (reglas,
 * glosario, prompt) no debe terminar en el JavaScript público.
 */
/** Para un vendedor (modo cartera): sólo preguntas sobre sus propios clientes. */
export const SUGERENCIAS_VENDEDOR = [
  '¿Cuáles de mis clientes están por pedir esta semana?',
  '¿Qué le ofrezco a mis clientes que están por pedir?',
  '¿Qué facturas vencidas tengo por cobrar?',
  '¿Cómo voy en el período comparado con el anterior?',
]

export const SUGERENCIAS = [
  '¿Qué clientes están por pedir esta semana?',
  'Hazme la lista para marcar de los pedidos que van en el camión',
  '¿Cuánto nos deben en total y quiénes son los que más deben?',
  '¿Qué clientes dejaron de comprar hace más de 2 meses?',
  '¿Cuáles son los 10 mejores clientes de los últimos 90 días?',
  '¿Cuánto vendimos por mes desde enero?',
  '¿Cuánto cobramos cada semana este mes?',
]
