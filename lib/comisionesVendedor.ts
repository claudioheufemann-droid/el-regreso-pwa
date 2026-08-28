/**
 * lib/comisionesVendedor.ts — Remuneración variable de vendedores de
 * terreno bajo la cláusula TERCERA de su contrato (Yadro Fabijancic y
 * Marcelo Diaz, contratos 13-07-2026, texto idéntico en ambos).
 *
 * Mismo criterio que lib/comisiones.ts (contrato de Claudio): es plata
 * real, cualquier cambio acá debe verificarse contra el contrato y
 * contra la base antes de mergear.
 *
 * Decisiones de negocio acordadas con Claudio el 2026-08-07 (el
 * contrato no se puede calcular sin ellas):
 *
 *  1. Canal comercial → la base no tiene campo "canal" (lo más cercano
 *     es `ventas.categoria_negocio`, el rubro del local). Mapeo
 *     acordado: HORECA+Tradicional = Bar, Restaurante, Cafetería,
 *     Botillería, Minimarket, Almacén, Actividades Turísticas, y
 *     cualquier categoría no reconocida (default a la tasa alta, nunca
 *     a la baja). Retail+Distribuidor = Supermercado, Distribuidor.
 *     Ver supabase/migrations/comision_vendedor_contrato_tercera.sql.
 *  2. "Al día" para el Bono Cobranza → mismo criterio que el contrato
 *     de Claudio: sin deuda vencida en `deudores` (foto del saldo
 *     actual, no hay registro de pagos por venta).
 *  3. "Cliente activo" para el Bono Retención → mismo criterio que la
 *     activación de cartera de Claudio: ≥2 interacciones en Terreno +
 *     ≥1 pedido en el período.
 *  4. Período → el 24→23 de la app, igual que el resto del dashboard
 *     (el contrato dice "venta neta mensual" sin fijar el corte).
 *  5. Bono Apertura Cadena Retail → queda FUERA del cálculo automático:
 *     el propio contrato lo condiciona a "evaluación y aprobación de
 *     la Gerencia Comercial", no es una regla mecánica. Se muestra
 *     como nota informativa.
 */

/**
 * Vendedores bajo la cláusula TERCERA — Yadro y Marcelo por nombre propio.
 * Marion Meza (Los Lagos) aparece como 'Los Lagos' porque así es como el ERP
 * registra sus ventas (`ventas.vendedor_actual`), no por su nombre — mismo
 * valor que ya usa `VENDEDORES_COMISIONABLES` (lib/comisiones.ts). Nicol
 * Delgado aparece con su email porque así quedan sus ventas en el ERP (no
 * "Los Rios": ese valor no existe ni una sola vez en `ventas.vendedor_actual`
 * — su fila en `users.vendedores_erp` estaba mal cargada y se corrigió el
 * 2026-08-28 al mismo tiempo que esto). Decisión de Claudio 2026-08-28: Nicol
 * y Marion tienen el mismo contrato tipo que Yadro/Marcelo (mismos tramos y
 * bonos), sólo cambia a quién se le atribuye.
 */
export const VENDEDORES_CONTRATO_TERCERA = ['Yadro Fabijancic', 'Marcelo Diaz', 'nicol.delgado@elregresobeer.com', 'Los Lagos'] as const

/**
 * Variantes con que cada vendedor aparece en `ventas.vendedor_actual` /
 * `clientes.vendedor` — mismo dato que `users.vendedores_erp`, pero acá
 * hace falta hardcodeado: cuando un ADMIN pide la comisión de otro
 * vendedor (módulo /ventas/comisiones) no hay sesión de ese vendedor de
 * la cual leer su `vendedoresErp`, así que no hay otra fuente posible.
 * Yadro tiene dos por un typo histórico en el ERP ("Fabijancic" vs
 * "Favijancic"); si a futuro aparece una variante nueva, agregarla acá
 * Y al arreglo `vendedores_erp` de su fila en `users`.
 */
export const VENDEDOR_ERP_VARIANTES: Record<string, string[]> = {
  'Yadro Fabijancic': ['Yadro Fabijancic', 'Yadro Favijancic'],
  'Marcelo Diaz': ['Marcelo Diaz'],
  'nicol.delgado@elregresobeer.com': ['nicol.delgado@elregresobeer.com'],
  'Los Lagos': ['Los Lagos'],
}

/** Cláusula SEGUNDA — remuneración fija bruta mensual (igual en ambos contratos). */
export const SUELDO_BASE_BRUTO = 592_885

/**
 * Cláusula TERCERA — comisión escalonada. El TOTAL de venta neta del mes
 * (ambos canales sumados) determina el tramo; dentro del tramo, cada
 * canal tiene su propia tasa.
 */
export const TRAMOS_COMISION = [
  { nombre: 'Tramo 1', techo: 15_000_000, horecaTradicional: 0.0220, retailDistribuidor: 0.0147 },
  { nombre: 'Tramo 2', techo: 25_000_000, horecaTradicional: 0.0257, retailDistribuidor: 0.0161 },
  { nombre: 'Tramo 3', techo: 40_000_000, horecaTradicional: 0.0293, retailDistribuidor: 0.0183 },
  { nombre: 'Tramo 4', techo: Infinity,   horecaTradicional: 0.0330, retailDistribuidor: 0.0220 },
] as const

export function tramoDe(ventaTotal: number) {
  return TRAMOS_COMISION.find(t => ventaTotal <= t.techo) ?? TRAMOS_COMISION[TRAMOS_COMISION.length - 1]
}

/** Tabla de tramos por monto, compartida por Bono Apertura y Bono Recompra. */
interface TierMonto { min: number; max: number; bono: number }

export const BONO_APERTURA_TIERS: TierMonto[] = [
  { min: 100_000, max: 300_000, bono: 14_670 },
  { min: 300_001, max: 1_000_000, bono: 29_330 },
  { min: 1_000_001, max: Infinity, bono: 58_670 },
]

export const BONO_RECOMPRA_TIERS: TierMonto[] = [
  { min: 100_000, max: 300_000, bono: 7_335 },
  { min: 300_001, max: 1_000_000, bono: 14_670 },
  { min: 1_000_001, max: Infinity, bono: 29_330 },
]

/** Bajo $100.000 el contrato no define tramo — no paga bono. */
function bonoDeTabla(monto: number, tabla: TierMonto[]): number {
  return tabla.find(t => monto >= t.min && monto <= t.max)?.bono ?? 0
}

/** Cláusula TERCERA — Bono de Cobranza, según % de cartera con venta que está al día. */
export const BONO_COBRANZA_TIERS = [
  { minimoPct: 90, bono: 180_000 },
  { minimoPct: 80, bono: 130_000 },
  { minimoPct: 70, bono: 80_000 },
] as const

/** Cláusula TERCERA — Bono de Retención de Cliente. */
export const BONO_RETENCION = { minimoPct: 80, monto: 100_000 } as const

/** Cliente activo = al menos estas interacciones en CRM + pedidos en el mes (mismo criterio que Claudio). */
export const ACTIVO_MIN_INTERACCIONES = 2
export const ACTIVO_MIN_PEDIDOS = 1

// ─── Tipos ──────────────────────────────────────────────────────────────────

export type Canal = 'horeca_tradicional' | 'retail_distribuidor'

export interface CanalVenta {
  canal: Canal
  ventaNeta: number
  litros: number
  pedidos: number
}

export interface EventoApertura {
  tipo: 'apertura' | 'recompra'
  cliente: string
  fecha: string
  monto: number
}

/** Misma forma que CarteraComision (lib/comisiones.ts) — se reutiliza la RPC comision_gerente_cartera. */
export interface CarteraVendedor {
  clientesConVenta: number
  clientesAlDia: number
  clientesCartera: number
  clientesActivos: number
  interacciones: number
}

export interface PorEntregarVendedor {
  ventaNeta: number
  litros: number
  pedidos: number
}

export interface ResumenComisionVendedor {
  ventaNeta: number
  ventaHorecaTradicional: number
  ventaRetailDistribuidor: number
  tramo: string
  tasaHorecaTradicional: number
  tasaRetailDistribuidor: number
  comision: number

  aperturas: EventoApertura[]
  bonoApertura: number
  recompras: EventoApertura[]
  bonoRecompra: number

  pctAlDia: number
  bonoCobranza: number
  proximaCobranza: { minimoPct: number; bono: number } | null

  pctActivacion: number
  bonoRetencion: number

  /** Comisión + bonos que hoy califican. Bruto, antes de imposiciones. */
  variableTotal: number
}

// ─── Cálculo ────────────────────────────────────────────────────────────────

export function calcularResumenVendedor(
  canales: CanalVenta[],
  eventos: EventoApertura[],
  cartera: CarteraVendedor,
): ResumenComisionVendedor {
  const ventaHorecaTradicional = canales.find(c => c.canal === 'horeca_tradicional')?.ventaNeta ?? 0
  const ventaRetailDistribuidor = canales.find(c => c.canal === 'retail_distribuidor')?.ventaNeta ?? 0
  const ventaNeta = ventaHorecaTradicional + ventaRetailDistribuidor

  const tramo = tramoDe(ventaNeta)
  const comision = ventaHorecaTradicional * tramo.horecaTradicional
    + ventaRetailDistribuidor * tramo.retailDistribuidor

  const aperturas = eventos.filter(e => e.tipo === 'apertura')
  const bonoApertura = aperturas.reduce((s, e) => s + bonoDeTabla(e.monto, BONO_APERTURA_TIERS), 0)
  const recompras = eventos.filter(e => e.tipo === 'recompra')
  const bonoRecompra = recompras.reduce((s, e) => s + bonoDeTabla(e.monto, BONO_RECOMPRA_TIERS), 0)

  const pctAlDia = cartera.clientesConVenta > 0
    ? (cartera.clientesAlDia / cartera.clientesConVenta) * 100
    : 0
  const bonoCobranza = BONO_COBRANZA_TIERS.find(t => pctAlDia >= t.minimoPct)?.bono ?? 0
  const proximaCobranza = [...BONO_COBRANZA_TIERS].reverse().find(t => pctAlDia < t.minimoPct) ?? null

  const pctActivacion = cartera.clientesCartera > 0
    ? (cartera.clientesActivos / cartera.clientesCartera) * 100
    : 0
  const bonoRetencion = pctActivacion >= BONO_RETENCION.minimoPct ? BONO_RETENCION.monto : 0

  return {
    ventaNeta,
    ventaHorecaTradicional,
    ventaRetailDistribuidor,
    tramo: tramo.nombre,
    tasaHorecaTradicional: tramo.horecaTradicional,
    tasaRetailDistribuidor: tramo.retailDistribuidor,
    comision,
    aperturas,
    bonoApertura,
    recompras,
    bonoRecompra,
    pctAlDia,
    bonoCobranza,
    proximaCobranza,
    pctActivacion,
    bonoRetencion,
    variableTotal: comision + bonoApertura + bonoRecompra + bonoCobranza + bonoRetencion,
  }
}

export const fComision = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`
