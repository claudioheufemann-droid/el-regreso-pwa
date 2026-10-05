import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import type { DatosCalendario } from '@/lib/administracion/calendarioEntradas'
import type { MesForecast } from '@/lib/administracion/forecastMensual'
import type { BancoId } from '@/lib/administracion/finanzas'
import type { ProyeccionCobros } from '@/lib/administracion/proyeccionCobros'
import AdministracionClient from './AdministracionClient'
import { cargarDatosAdministracion } from './cargarDatos'

export const dynamic = 'force-dynamic'

/** Un punto de la serie de ingresos: histórico real o proyección del modelo. */
export interface PuntoFinanzas {
  mes: string
  tipo: 'historico' | 'forecast'
  monto: number
  montoMin: number | null
  montoMax: number | null
  tendencia: number | null
  estacionalidad: number | null
}

export interface SerieFinanzas {
  id: string
  nivel: 'general' | 'categoria' | 'cliente' | 'restaurante' | 'compra'
  clave: string | null
  puntos: PuntoFinanzas[]
  /** Error del backtest walk-forward a 1 mes, en %. null = no alcanzó el
   *  historial para validar. */
  mape: number | null
  mesesHistorial: number | null
  /** Venta neta del ciclo EN CURSO, calculada en vivo — el modelo excluye el
   *  ciclo abierto a propósito, así que este número no sale de él. */
  montoCicloEnCurso: number
}

/** Una semana de la pestaña Forecast, para UN cliente. `real` es venta ya
 *  ocurrida (fecha de pedido dentro de esa semana); `proyectado*` sale de
 *  repartir el forecast MENSUAL de Prophet (por ciclo interno) en días
 *  dentro de ese ciclo y agruparlos por semana — no es un modelo semanal
 *  propio, es el mismo forecast mensual visto a otra escala. */
export interface SemanaForecastCliente {
  /** yyyy-mm-dd del lunes ISO de la semana. */
  inicio: string
  real: number | null
  proyectado: number | null
  proyectadoMin: number | null
  proyectadoMax: number | null
}

export interface ForecastCliente {
  nombre: string
  mape: number | null
  mesesHistorial: number | null
  semanas: SemanaForecastCliente[]
  /** 'neto' (sin IVA): clientes de `ventas` y compras. 'bruto': el restaurante, que viene de boletas con IVA incluido. */
  unidad: 'neto' | 'bruto'
  /** Proyección por ciclo (24→23) con su rango y el mismo ciclo del año anterior. */
  meses: MesForecast[]
}

export interface AvanceCiclo {
  ciclo: string
  diaActual: number
  diasEnCiclo: number
  diasHabilesTranscurridos: number
  diasHabilesEnCiclo: number
}

export interface ResumenDeuda {
  /** Dato duro del informe de Deudores del ERP: plata que ya venció y no
   *  entró. No sale de nuestra proyección. */
  vencida: number
  clientes: number
  ultimaCarga: string | null
}

/** Saldo de un banco a una fecha — ver BancoId/BANCOS en finanzas.ts. */
export interface SaldoBanco {
  banco: BancoId
  fecha: string
  saldo: number
}

/** Una semana de plata que EFECTIVAMENTE entró (tabla `cobros_erp`). */
export interface SemanaCobro {
  /** Lunes de la semana, yyyy-mm-dd. */
  semana: string
  total: number
  /** metodo → monto. Los métodos vienen normalizados por el parser. */
  porMetodo: Record<string, number>
  movimientos: number
}

/** Cómo paga UN cliente, medido contra sus pagos reales cruzados con la guía. */
export interface ComportamientoPago {
  cliente: string
  /** Pagos cruzados con su guía. Menos de 3 y la mediana es ruido. */
  muestras: number
  /** Días de pago: mediana (lo que se le muestra a una persona), percentil 25
   *  para el escenario optimista y 75/90 para el malo, y el promedio, que es
   *  el que mejor proyecta plata según el backtest — ver BACKTEST_MAE_SEMANAL. */
  p25: number
  p50: number
  p75: number
  p90: number
  promedio: number
  montoCruzado: number
  ultimoPago: string
  /** Plazo declarado en el maestro de clientes — null si la ficha no lo trae. */
  declarado: number | null
}

/**
 * Ingreso real de caja y comportamiento de pago, ambos derivados de
 * `cobros_erp` (informe "Movimientos Cta. Cte." del ERP). Es lo único que
 * responde "cuánta plata entró de verdad" — el resto del módulo trabaja con
 * ventas despachadas y deuda, que son promesas, no caja.
 */
export interface DatosCobros {
  hayDatos: boolean
  semanas: SemanaCobro[]
  comportamiento: ComportamientoPago[]
  /** Últimas 4 semanas cerradas vs. las 4 anteriores, para la variación. */
  totalUltimas4: number
  totalPrevias4: number
  promedioSemanal: number
  /** Mediana de días de pago de toda la cartera, ponderada por cliente. */
  medianaGlobal: number | null
  /** Mediana del plazo DECLARADO, para contrastar con el real. */
  declaradaGlobal: number | null
  ultimaFecha: string | null
  /** Cuánto debería entrar las próximas semanas, cruzando lo impago con el
   *  comportamiento de pago real de cada cliente. */
  proyeccion: ProyeccionCobros
  /** Plata YA cobrada esta semana (lunes a hoy), de `semanasCobro` — a
   *  diferencia de `totalUltimas4`, que a propósito excluye la semana en
   *  curso por estar a medias, esto SÍ la incluye: es justo lo que hace
   *  falta para responder "¿cuánto entra esta semana?" sumando lo ya
   *  cobrado más lo que `proyeccion.semanas[0]` todavía espera para el
   *  resto de la semana. */
  confirmadoEstaSemana: number
  /** Datos para el calendario de entradas día por día (CalendarioSemana). */
  calendario: DatosCalendario
}

/**
 * Módulo Administración y Finanzas — página "Finanzas". Solo administradores.
 *
 * Responde dos preguntas que el resto de la app no responde:
 *   · ¿Cuánta PLATA vamos a facturar? (mismo modelo Prophet que Producción,
 *     pero la unidad es la venta neta en $, no litros.)
 *   · ¿CUÁNDO entra esa plata a la caja? (días de pago del cliente aplicados
 *     sobre la fecha de entrega.)
 */
export default async function AdministracionPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/')

  return <AdministracionClient {...await cargarDatosAdministracion()} />
}
