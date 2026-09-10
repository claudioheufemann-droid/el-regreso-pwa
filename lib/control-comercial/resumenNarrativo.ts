// Resumen ejecutivo automático (spec §35) — frases generadas a partir de
// datos reales ya calculados, nunca texto decorativo/inventado.

export function generarResumenNarrativo(input: {
  periodoNombre: string
  ventaClp: number
  crecimientoYoyPct: number | null
  cumplimientoMetaPct: number | null
  clientesNuevos: number
  clientesConsolidados: number
  cobranzaRecuperada: number | null
  cuentasRegularizadas: number | null
  deudaVencidaVariacionPct: number | null
  barrilesRecuperados: number | null
  barrilesCriticos: number
}): string {
  const clp = (n: number) => n.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 })
  const frases: string[] = []

  let f1 = `Las ventas de ${input.periodoNombre} alcanzaron ${clp(input.ventaClp)}`
  if (input.crecimientoYoyPct !== null) {
    f1 += `, representando ${input.crecimientoYoyPct >= 0 ? 'un crecimiento' : 'una caída'} de ${Math.abs(input.crecimientoYoyPct).toFixed(1)}% respecto del mismo período del año anterior`
  }
  if (input.cumplimientoMetaPct !== null) {
    f1 += ` y un cumplimiento de ${input.cumplimientoMetaPct.toFixed(0)}% del presupuesto`
  }
  frases.push(f1 + '.')

  if (input.clientesNuevos > 0) {
    frases.push(`Se incorporaron ${input.clientesNuevos} clientes nuevos, de los cuales ${input.clientesConsolidados} realizaron una segunda compra dentro de 60 días.`)
  }

  if (input.cobranzaRecuperada !== null && input.cuentasRegularizadas !== null) {
    frases.push(`Se recuperaron ${clp(input.cobranzaRecuperada)} de deuda vencida y se regularizaron ${input.cuentasRegularizadas} cuentas.`)
  }
  if (input.deudaVencidaVariacionPct !== null) {
    frases.push(`La cartera vencida ${input.deudaVencidaVariacionPct <= 0 ? 'disminuyó' : 'aumentó'} ${Math.abs(input.deudaVencidaVariacionPct).toFixed(1)}%.`)
  }

  if (input.barrilesRecuperados !== null) {
    frases.push(`Se recuperaron ${input.barrilesRecuperados} barriles y permanecen ${input.barrilesCriticos} en estado crítico.`)
  } else if (input.barrilesCriticos > 0) {
    frases.push(`Permanecen ${input.barrilesCriticos} barriles en estado crítico (+90 días fuera).`)
  }

  return frases.join(' ')
}
