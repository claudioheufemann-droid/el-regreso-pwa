/**
 * "¿Cuánta plata entra por pago de facturas, semana a semana?" — la vista
 * simple de la pestaña Caja (pedido de Claudio, 26-oct-2026: la planilla de
 * nueve columnas del modelo "no se entendía").
 *
 * Una sola regla, la misma de Deudores: cada factura por cobrar entra el día
 * que VENCE (emisión + días de crédito; si vence sábado o domingo, el lunes,
 * porque los clientes con crédito no pagan el fin de semana). Lo que ya pasó
 * no se estima: se muestra lo que de verdad entró (cobros_erp).
 *
 *   · Semana en curso: entró (lunes → hoy) + falta (lo que vence esta semana
 *     y sigue impago, incluido lo que venció el lunes y aún no llega).
 *   · Semanas que vienen: lo que vence en cada una.
 *   · Semana pasada: sólo lo que entró.
 *   · Lo vencido ANTES de esta semana no cae en ninguna: no hay fecha en que
 *     se pueda esperar, va aparte como "vencido sin pagar".
 *
 * Todo en bruto (con IVA/ILA): es lo que llega al banco. Código puro.
 */
import { lunesDe } from './finanzas'
import { semanaISO, siguienteHabil, sumarDiasISO } from './calendarioEntradas'
import type { FacturaCalendario } from './proyeccionCobros'

export interface FacturaDelDia {
  cliente: string
  factura: string
  bruto: number
  /** Vencimiento impreso (puede ser sábado/domingo: el día efectivo es el lunes). */
  vencimiento: string
  diasCredito: number
}

export interface DiaCobro {
  fecha: string
  /** 0 = lunes … 6 = domingo. */
  dow: number
  estado: 'pasado' | 'hoy' | 'futuro'
  /** Lo que entró de verdad ese día (pagos de clientes con crédito). null = día futuro. */
  entro: number | null
  /** Facturas que vencen ese día y siguen impagas. En un día pasado = vencieron sin pagar. */
  porCobrar: number
  facturas: FacturaDelDia[]
}

export interface SemanaCobro {
  lunes: string
  domingo: string
  numero: number
  estado: 'pasada' | 'en_curso' | 'proxima'
  /** Lo que ya entró (semana pasada o en curso). */
  entro: number
  /** Lo que vence en la semana y sigue impago. */
  porCobrar: number
  /** entro + porCobrar: lo que debería entrar en total en la semana. */
  total: number
  facturas: number
  dias: DiaCobro[]
}

export interface CobrosSemanales {
  semanas: SemanaCobro[]
  /** Facturas vencidas antes de la semana en curso y todavía impagas. */
  vencidoAntes: { monto: number; facturas: number }
  /** Último día con pagos cargados. */
  ultimoPago: string | null
}

export function armarCobrosSemanales({ pendientes, pagosPorDia, hoyISO, semanasAtras = 1, minSemanasAdelante = 5 }: {
  pendientes: FacturaCalendario[]
  /** Pagos de clientes con crédito por día (fecha → monto). */
  pagosPorDia: Record<string, number>
  hoyISO: string
  semanasAtras?: number
  minSemanasAdelante?: number
}): CobrosSemanales {
  const lunesHoy = lunesDe(hoyISO)

  const porDia = new Map<string, FacturaDelDia[]>()
  const vencidoAntes = { monto: 0, facturas: 0 }
  let ultimoLunes = sumarDiasISO(lunesHoy, (minSemanasAdelante - 1) * 7)
  for (const p of pendientes) {
    if (p.bruto <= 0) continue
    const dia = siguienteHabil(p.fechaEsperadaPactada)
    if (dia < lunesHoy) { vencidoAntes.monto += p.bruto; vencidoAntes.facturas++; continue }
    const lista = porDia.get(dia) ?? []
    lista.push({ cliente: p.cliente, factura: p.factura, bruto: p.bruto, vencimiento: p.fechaEsperadaPactada, diasCredito: p.diasCredito })
    porDia.set(dia, lista)
    const l = lunesDe(dia)
    if (l > ultimoLunes) ultimoLunes = l
  }

  const semanas: SemanaCobro[] = []
  for (let lunes = sumarDiasISO(lunesHoy, -7 * semanasAtras); lunes <= ultimoLunes; lunes = sumarDiasISO(lunes, 7)) {
    const estado: SemanaCobro['estado'] = lunes < lunesHoy ? 'pasada' : lunes === lunesHoy ? 'en_curso' : 'proxima'
    const dias: DiaCobro[] = Array.from({ length: 7 }, (_, i) => {
      const fecha = sumarDiasISO(lunes, i)
      const estadoDia: DiaCobro['estado'] = fecha < hoyISO ? 'pasado' : fecha === hoyISO ? 'hoy' : 'futuro'
      // La semana pasada sólo muestra lo que entró: lo que quedó impago va en "vencido antes".
      const facturas = estado === 'pasada' ? [] : (porDia.get(fecha) ?? []).slice().sort((a, b) => b.bruto - a.bruto)
      return {
        fecha, dow: i, estado: estadoDia,
        entro: estadoDia === 'futuro' ? null : Math.round(pagosPorDia[fecha] ?? 0),
        porCobrar: facturas.reduce((s, f) => s + f.bruto, 0),
        facturas,
      }
    })
    const entro = dias.reduce((s, d) => s + (d.entro ?? 0), 0)
    const porCobrar = dias.reduce((s, d) => s + d.porCobrar, 0)
    semanas.push({
      lunes, domingo: sumarDiasISO(lunes, 6), numero: semanaISO(lunes), estado,
      entro, porCobrar, total: entro + porCobrar,
      facturas: dias.reduce((s, d) => s + d.facturas.length, 0),
      dias,
    })
  }

  const fechasPago = Object.keys(pagosPorDia).filter(f => pagosPorDia[f] > 0).sort()
  return { semanas, vencidoAntes, ultimoPago: fechasPago.length ? fechasPago[fechasPago.length - 1] : null }
}
