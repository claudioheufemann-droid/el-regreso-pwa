/**
 * lib/administracion/flujoSemanal.ts — utilidades de semanas y compras que quedaron
 * del antiguo dashboard de Flujo de Caja. El motor de caja ahora es
 * lib/administracion/cajaCobrada.ts (auditoría del 2-oct-2026: se retiraron
 * construirFlujoSemanal, el aging, el semáforo y el ciclo de conversión, que
 * duplicaban o contradecían otras vistas).
 */
import { lunesDe } from './finanzas'

export interface EntradaCompra {
  monto: number
  fecha_pago: string
  fecha_documento: string | null
  estado: 'comprometida' | 'estimada' | 'pagada'
}

/** Suma `n` días corridos a una fecha ISO. */
function sumarDiasISO(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
}

/** Lista de lunes consecutivos: `atras` semanas hacia atrás desde la actual y
 *  `adelante` hacia adelante (incluye la actual). */
export function semanasRodantes(hoyISO: string, atras: number, adelante: number): string[] {
  const base = lunesDe(hoyISO)
  const out: string[] = []
  for (let i = -atras; i <= adelante; i++) out.push(sumarDiasISO(base, i * 7))
  return out
}

/** DPO: promedio de días entre la factura del proveedor y su pago. Sólo
 *  cuenta las compras que tienen ambas fechas. */
export function calcularDiasPagoProveedores(compras: EntradaCompra[]): number | null {
  const dias: number[] = []
  for (const c of compras) {
    if (!c.fecha_documento) continue
    const d = Math.round(
      (Date.parse(`${c.fecha_pago}T00:00:00Z`) - Date.parse(`${c.fecha_documento}T00:00:00Z`)) / 86_400_000
    )
    if (d >= 0 && d <= 365) dias.push(d)
  }
  if (dias.length === 0) return null
  return Math.round(dias.reduce((s, d) => s + d, 0) / dias.length)
}
