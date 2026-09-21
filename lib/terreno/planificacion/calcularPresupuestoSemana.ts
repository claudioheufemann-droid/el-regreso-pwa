import type { ComidasDia, DiaPresupuesto, PoliticaGastos, ResultadoDia, ResultadoSemana } from './types'

/**
 * Comidas de un día, según la política (PDF "Políticas de Control de Gastos").
 *
 * Regla unificada que reproduce el caso de aceptación del prompt (520km, 4 almuerzos, 1
 * cena, 1 desayuno = $179.000) sin inventar una tercera regla para viajes de más de una
 * noche — se deriva del mismo principio día por día:
 *   - Almuerzo: 1 si el día tiene paradas planificadas (está en terreno, no de
 *     escritorio — un día de "seguimiento y cierre" sin paradas no genera almuerzo
 *     aunque sea parte de la semana laboral).
 *   - Desayuno: 1 sólo si el vendedor durmió fuera la noche ANTERIOR a este día
 *     (no aplica al primer día de un viaje), salvo que el alojamiento lo incluya.
 *   - Once/cena: 1 sólo si el vendedor duerme fuera ESTA noche (`pernocta`).
 *
 * Con esto: "mismo día" (sin pernocta antes ni después) = 1 almuerzo, nada más.
 * "Salida mañana, regreso noche del día siguiente" (2 filas: día1 pernocta=true,
 * día2 pernocta=false con noche anterior fuera) = 2 almuerzos + 1 cena + 1 desayuno,
 * exactamente el ejemplo del PDF. Se generaliza sola a N noches sin caso especial.
 */
function calcularComidasDia(
  dia: DiaPresupuesto,
  durmioFueraNocheAnterior: boolean,
  politica: PoliticaGastos,
): ComidasDia {
  const almuerzos = dia.cantidad_paradas > 0 ? 1 : 0
  const desayunos = durmioFueraNocheAnterior && !dia.desayuno_incluido_alojamiento ? 1 : 0
  const cenasOnce = dia.pernocta ? 1 : 0
  const montoComidasClp =
    almuerzos * politica.monto_almuerzo_clp +
    desayunos * politica.monto_desayuno_clp +
    cenasOnce * politica.monto_once_cena_clp
  return { almuerzos, desayunos, cenasOnce, montoComidasClp }
}

/**
 * Motor de presupuesto semanal. `dias` debe venir ordenado por fecha ascendente y
 * pertenecer a UN solo plan (una semana). No usa línea recta como km pagable: un día con
 * `km_pagable_m: null` (proveedor de rutas no configurado o cálculo no confirmado) no
 * suma monto de km y queda marcado `pendienteDeCalculo` — nunca se autoriza un
 * presupuesto incompleto en silencio.
 */
export function calcularPresupuestoSemana(
  dias: DiaPresupuesto[],
  politica: PoliticaGastos,
): ResultadoSemana {
  const ordenados = [...dias].sort((a, b) => a.fecha.localeCompare(b.fecha))

  const resultado: ResultadoDia[] = ordenados.map((dia, i) => {
    const durmioFueraNocheAnterior = i > 0 ? ordenados[i - 1].pernocta : false
    const comidas = calcularComidasDia(dia, durmioFueraNocheAnterior, politica)

    const pendienteDeCalculo = dia.km_pagable_m === null
    const montoKmClp = pendienteDeCalculo
      ? null
      : Math.round((dia.km_pagable_m! / 1000) * politica.tarifa_km_clp)
    const montoPeajesClp = dia.peajes_estimados_clp
    const montoDiaClp = pendienteDeCalculo
      ? null
      : montoKmClp! + montoPeajesClp + comidas.montoComidasClp

    return {
      plan_dia_id: dia.id,
      fecha: dia.fecha,
      comidas,
      kmPagableM: dia.km_pagable_m,
      montoKmClp,
      montoPeajesClp,
      montoDiaClp,
      pendienteDeCalculo,
    }
  })

  const montoTotalKmClp = resultado.reduce((s, d) => s + (d.montoKmClp ?? 0), 0)
  const montoTotalPeajesClp = resultado.reduce((s, d) => s + d.montoPeajesClp, 0)
  const montoTotalComidasClp = resultado.reduce((s, d) => s + d.comidas.montoComidasClp, 0)
  const montoAlojamientoEstimadoClp = ordenados.reduce((s, d) => s + (d.hotel_estimado_clp ?? 0), 0)
  const algunDiaPendienteDeCalculo = resultado.some(d => d.pendienteDeCalculo)

  return {
    dias: resultado,
    montoTotalKmClp,
    montoTotalPeajesClp,
    montoTotalComidasClp,
    // Alojamiento NUNCA se suma acá — se muestra aparte (reembolso posterior, ciclo del martes).
    montoTotalClp: montoTotalKmClp + montoTotalPeajesClp + montoTotalComidasClp,
    montoAlojamientoEstimadoClp,
    algunDiaPendienteDeCalculo,
  }
}
