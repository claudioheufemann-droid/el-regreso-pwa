/**
 * lib/comisiones.ts — Remuneración variable del Gerente Comercial.
 *
 * Traduce la cláusula NOVENA del contrato de Claudio Heufemann (04-05-2026)
 * a cálculo. Es plata real: cualquier cambio acá debe verificarse contra el
 * contrato y contra la base antes de mergear.
 *
 * Decisiones acordadas con Claudio el 2026-08-06 (el contrato no se puede
 * calcular sin ellas):
 *
 *  1. Qué ventas cuentan → las del EQUIPO COMERCIAL, identificado por
 *     `vendedor_actual`. La base NO tiene campo "canal" (lo más cercano es
 *     `categoria_negocio`, que es el rubro del local, no el canal), así que
 *     los canales del contrato se representan con la lista de vendedores.
 *  2. "Venta neta que cumple políticas de cobranza" → venta de clientes SIN
 *     deuda vencida. No existe registro de pagos por venta en la base (sólo
 *     `deudores`, una foto del saldo actual), así que ésta es la
 *     aproximación más fiel posible.
 *  3. Período → el 24→23 de la app, igual que el resto del dashboard.
 */

/**
 * Vendedores cuya venta comisiona. Fuente única: se pasa por parámetro a las
 * funciones SQL, así que ajustar esta lista basta — no hay que migrar la base.
 *
 * Nombres tal como los reporta el ERP en `ventas.vendedor_actual`.
 * "Transición 1" y "Transición 2" son carteras traspasadas que hoy atienden
 * Los Ríos y Los Lagos (confirmado por Claudio). "Equipo Ventas",
 * "CERVECERÍA", "No indica" e "Inactivo" quedan fuera a propósito.
 *
 * Corrección 2026-08-28: acá decía 'Los Rios', pero ese valor no existe ni
 * una sola vez en `ventas.vendedor_actual` — las ventas de Nicol Delgado
 * (Los Ríos) quedan con su email, `nicol.delgado@elregresobeer.com` (773
 * filas). Con 'Los Rios' su venta nunca sumó a la comisión de Claudio; no se
 * sabe desde cuándo. Ver [[project_modulo_comisiones_acceso]].
 */
export const VENDEDORES_COMISIONABLES = [
  'Yadro Fabijancic',
  'Marcelo Diaz',
  'Claudio Heufemann',
  'nicol.delgado@elregresobeer.com',
  'Los Lagos',
  'OnLine',
  'Transición 1',
  'Transición 2',
] as const

/**
 * Quién tiene acceso al módulo /ventas/comisiones — remuneración de TODO el
 * equipo comercial (Claudio, Marcelo, Yadro), no sólo la propia. Decisión de
 * Claudio 2026-08-28: sólo él, Douglas, Benjamín y Mariel — el acceso ya no
 * es parcial (antes Benjamín entraba al módulo pero no veía la tarjeta de
 * Claudio; hoy quien entra ve todo, o no entra).
 *
 * A propósito NO se reutiliza `puede_ver_margenes`: ese permiso es de
 * Rentabilidad (costos/márgenes internos), un tema distinto — ampliarlo le
 * habría dado a Mariel acceso a Rentabilidad también, que no es lo que se
 * pidió. Tampoco se amplía `ve_comision_gerente`: ese flag decide además si
 * la tarjeta de Claudio se MONTA en el dashboard normal de /ventas
 * (VentasHoyClient → veComision), que debe seguir siendo sólo de Claudio.
 * El acceso extra de este módulo es una lista puntual, aparte.
 */
const EMAILS_VEN_COMISIONES_EQUIPO = [
  'douglas@elregresobeer.com',
  'benja.alarcon@elregresobeer.com',
  'mariel.lillo@elregresobeer.com',
]

export function puedeVerComisionesEquipo(user: { veComisionGerente: boolean; email: string }): boolean {
  return user.veComisionGerente || EMAILS_VEN_COMISIONES_EQUIPO.includes(user.email)
}

/** Cláusula SEGUNDA — remuneración fija bruta mensual. */
export const SUELDO_BASE_BRUTO = 2_311_375

/** Cláusula NOVENA — 1% de la venta neta comisionable. */
export const TASA_COMISION = 0.01

/**
 * Bonos por escala de venta neta: SOSTENIDOS y NO ACUMULATIVOS — al alcanzar
 * un peldaño, ese bono reemplaza al anterior (no se suman).
 *
 * El umbral se mide sobre la venta neta FACTURADA del equipo (el contrato
 * habla de "el tramo de facturación neta alcanzado"), no sobre la
 * comisionable: la escala mide volumen logrado, la comisión mide cobrado.
 */
export const ESCALAS_VENTA = [
  { piso: 100_000_000, bono: 650_000, nombre: 'Escala 3' },
  { piso:  75_000_000, bono: 500_000, nombre: 'Escala 2' },
  { piso:  50_000_000, bono: 350_000, nombre: 'Escala 1' },
] as const

/** Cláusula NOVENA — bono por comportamiento de pago de la cartera. */
export const BONO_PAGO = { monto: 150_000, minimoAlDiaPct: 90 } as const

/** Cláusula NOVENA — bono por activación de cartera en el CRM. */
export const ESCALAS_ACTIVACION = [
  { minimoPct: 85, bono: 200_000 },
  { minimoPct: 75, bono: 100_000 },
] as const

/** Cliente activo = al menos estas interacciones en CRM + pedidos en el mes. */
export const ACTIVO_MIN_INTERACCIONES = 2
export const ACTIVO_MIN_PEDIDOS = 1

// ─── Tipos ──────────────────────────────────────────────────────────────────

export interface ClienteComision {
  cliente: string
  vendedor: string
  ventaNeta: number
  litros: number
  pedidos: number
  deudaVencida: number
  saldoTotal: number
  comisiona: boolean
}

export interface ProductoComision {
  producto: string
  envase: string
  categoria: string
  ventaNeta: number
  litros: number
  clientes: number
}

export interface CarteraComision {
  clientesConVenta: number
  clientesAlDia: number
  clientesCartera: number
  clientesActivos: number
  interacciones: number
}

/**
 * Pedidos tomados por el equipo aún sin despachar — SOLO informativo.
 * "Lo que podría tener" cuando se entregue; la comisión nunca se calcula
 * sobre esto (pedido explícito de Claudio: siempre se toma en cuenta lo
 * que se entrega a los clientes, no lo pedido).
 */
export interface PorEntregarComision {
  ventaNeta: number
  litros: number
  pedidos: number
}

export interface ResumenComision {
  /** Venta neta ENTREGADA del equipo en el período — base del 1% (cláusula
   *  novena: "venta neta"), sin descontar por deuda vencida del cliente.
   *  Corrección 2026-08-06: la primera versión sólo comisionaba la venta de
   *  clientes sin deuda vencida ($50.168 sobre $10,86M en vez de $109.103);
   *  Claudio la corrigió — el 1% es sobre TODO lo entregado, la deuda
   *  vencida queda como alerta aparte, no como descuento de la comisión. */
  ventaNeta: number
  /** Venta entregada de clientes CON deuda vencida — sólo alerta de riesgo,
   *  ya no resta de `comision`. */
  ventaEnRiesgo: number
  comision: number

  escalaAlcanzada: string | null
  bonoEscala: number
  /** Cuánto falta de venta neta para el próximo peldaño (null si está en el tope). */
  faltaParaProximaEscala: number | null
  proximaEscala: string | null
  /** Lo que se ganaría al alcanzar proximaEscala (null si ya está en el tope). */
  proximaEscalaBono: number | null

  pctAlDia: number
  bonoPago: number

  pctActivacion: number
  bonoActivacion: number
  /** Próximo peldaño de activación aún no alcanzado (null si ya está en el tope). */
  proximaActivacion: { minimoPct: number; bono: number } | null

  /** Comisión + bonos que hoy califican. Bruto, antes de imposiciones. */
  variableTotal: number
}

// ─── Cálculo ────────────────────────────────────────────────────────────────

export function escalaDe(ventaNeta: number) {
  return ESCALAS_VENTA.find(e => ventaNeta >= e.piso) ?? null
}

export function proximaEscalaDe(ventaNeta: number) {
  // ESCALAS_VENTA va de mayor a menor: la próxima es la más baja aún no alcanzada.
  const pendientes = [...ESCALAS_VENTA].reverse().filter(e => ventaNeta < e.piso)
  return pendientes[0] ?? null
}

export function bonoActivacionDe(pct: number): number {
  return ESCALAS_ACTIVACION.find(e => pct >= e.minimoPct)?.bono ?? 0
}

export function calcularResumen(
  clientes: ClienteComision[],
  cartera: CarteraComision,
): ResumenComision {
  const ventaNeta = clientes.reduce((s, c) => s + c.ventaNeta, 0)
  // El 1% (cláusula novena) es sobre TODA la venta neta entregada — la deuda
  // vencida de un cliente ya no descuenta de la comisión, queda sólo como
  // alerta (ver comentario en ResumenComision).
  const ventaEnRiesgo = clientes.filter(c => !c.comisiona).reduce((s, c) => s + c.ventaNeta, 0)

  const comision = ventaNeta * TASA_COMISION

  const escala = escalaDe(ventaNeta)
  const proxima = proximaEscalaDe(ventaNeta)

  const pctAlDia = cartera.clientesConVenta > 0
    ? (cartera.clientesAlDia / cartera.clientesConVenta) * 100
    : 0
  const bonoPago = pctAlDia > BONO_PAGO.minimoAlDiaPct ? BONO_PAGO.monto : 0

  const pctActivacion = cartera.clientesCartera > 0
    ? (cartera.clientesActivos / cartera.clientesCartera) * 100
    : 0
  const bonoActivacion = bonoActivacionDe(pctActivacion)
  // Próximo peldaño de activación aún no alcanzado — ESCALAS_ACTIVACION va de
  // mayor a menor umbral, así que se recorre al revés para encontrar el más
  // bajo que el % actual todavía no cumple.
  const proximaActivacion = [...ESCALAS_ACTIVACION].reverse().find(e => pctActivacion < e.minimoPct) ?? null

  const bonoEscala = escala?.bono ?? 0

  return {
    ventaNeta,
    ventaEnRiesgo,
    comision,
    escalaAlcanzada: escala?.nombre ?? null,
    bonoEscala,
    faltaParaProximaEscala: proxima ? proxima.piso - ventaNeta : null,
    proximaEscala: proxima?.nombre ?? null,
    proximaEscalaBono: proxima?.bono ?? null,
    pctAlDia,
    bonoPago,
    pctActivacion,
    bonoActivacion,
    proximaActivacion,
    variableTotal: comision + bonoEscala + bonoPago + bonoActivacion,
  }
}

/**
 * Proyección al cierre del período según el ritmo diario logrado.
 * Devuelve null si el período ya terminó o si aún no hay días transcurridos.
 */
export function proyectarAlCierre(valor: number, desde: string, hasta: string): number | null {
  const ini = new Date(desde + 'T00:00:00')
  const fin = new Date(hasta + 'T23:59:59')
  const hoy = new Date()
  if (hoy >= fin) return null
  const diaMs = 86_400_000
  const transcurridos = Math.max(1, Math.ceil((hoy.getTime() - ini.getTime()) / diaMs))
  const totales = Math.max(1, Math.ceil((fin.getTime() - ini.getTime()) / diaMs))
  if (transcurridos >= totales) return null
  return (valor / transcurridos) * totales
}

export const fComision = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
