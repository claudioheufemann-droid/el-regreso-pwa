/**
 * lib/deudaComercial.ts — La deuda del ÁREA COMERCIAL, tal como la muestra
 * /ventas/deudores (tarjetas "Todos / Claudio / Nicol / Marcelo / Marion /
 * Yadro").
 *
 * Existe para que la pantalla y la notificación diaria (/api/cron/cartera-diaria)
 * hablen de la MISMA plata. Antes el cron sumaba `deuda_vencida` cruda de toda
 * la tabla —incluía maquila, incobrables y pseudo-vendedores del ERP— y el
 * número que llegaba al celular no calzaba con el de la pantalla (pedido de
 * Claudio, 2026-09-24).
 *
 * Regla (idéntica a DeudoresVendedorClient.tsx → conDeudaComercial +
 * resumenCarteras):
 *   1. Clientes 100% maquila se sacan enteros.
 *   2. Al resto se le descuenta la maquila vencida de su deuda.
 *   3. Sólo cuentan las carteras de VENDEDORES_CARTERA_COBRANZA.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { esLineaMaquila, maquilaVencidaDe, type FilaVenta } from '@/lib/cobranza'
import { VENDEDORES_CARTERA_COBRANZA, grupoCarteraDe, vendedorCanonico } from '@/lib/types'

/**
 * Quién ve la deuda de TODAS las carteras en /ventas/deudores (y abre el
 * detalle/contacto de cualquier cliente). Los admin siempre; además una lista
 * puntual de gente de Administración que cobra pero no debe ser admin del
 * resto de la app. Karla Morales entra con la cuenta genérica pagos@, pero su
 * perfil en public.users tiene su propio email, que es lo que se compara acá
 * (pedido de Claudio, 2026-09-25).
 */
const EMAILS_VEN_DEUDA_GLOBAL = ['karla.morales@elregresobeer.com']

export function puedeVerDeudaGlobal(user: { isAdmin: boolean; email: string }): boolean {
  return user.isAdmin || EMAILS_VEN_DEUDA_GLOBAL.includes(user.email.toLowerCase())
}

type DeudorRow = { nombre_fantasia: string; deuda_vencida: number | null }

export interface CalculoMaquila {
  /** { nombre_fantasia → plata vencida que es maquila }. Sólo los que tienen. */
  maquilaPorCliente: Record<string, number>
  /** Clientes cuya venta reconstruida es 100% maquila (nunca compraron cerveza ni kombucha). */
  soloMaquila: Set<string>
}

/**
 * Maquila (co-packing a terceros): el ERP la factura al mismo cliente, así
 * que entra en `deuda_vencida`, pero no es cobranza del área comercial.
 * Barato: sólo un puñado de deudores tiene maquila.
 */
export async function calcularMaquila(
  supabase: SupabaseClient,
  deudores: DeudorRow[],
): Promise<CalculoMaquila> {
  if (deudores.length === 0) return { maquilaPorCliente: {}, soloMaquila: new Set() }

  // Paso 1: qué deudores tienen alguna venta de maquila (sin filtrar por deuda:
  // un cliente 100% maquila igual hay que detectarlo aunque su deuda no esté
  // vencida todavía).
  const { data: filasMaquila } = await supabase
    .from('ventas')
    .select('nombre_fantasia')
    .or('producto.ilike.%maquila%,producto.ilike.%latas finales%')
    .in('nombre_fantasia', deudores.map(d => d.nombre_fantasia))

  const clientes = [...new Set((filasMaquila ?? []).map(f => f.nombre_fantasia as string))]
  if (clientes.length === 0) return { maquilaPorCliente: {}, soloMaquila: new Set() }

  // Paso 2: TODA su venta reconstruida — sirve para (a) saber cuáles facturas
  // de maquila siguen impagas y (b) si alguna vez vendieron algo que no sea
  // maquila (si no, el cliente entero se saca de Deudores).
  const { data: ventas } = await supabase
    .from('ventas')
    .select('nombre_fantasia, pedido, fecha_pedido, producto, envase, categoria_producto, litros, total_sin_impuesto')
    .in('nombre_fantasia', clientes)

  const porCliente = new Map<string, FilaVenta[]>()
  for (const v of (ventas ?? []) as (FilaVenta & { nombre_fantasia: string })[]) {
    const arr = porCliente.get(v.nombre_fantasia)
    if (arr) arr.push(v)
    else porCliente.set(v.nombre_fantasia, [v])
  }

  const soloMaquila = new Set<string>()
  for (const nombre of clientes) {
    const filas = porCliente.get(nombre) ?? []
    if (filas.length > 0 && filas.every(f => esLineaMaquila(f.producto))) soloMaquila.add(nombre)
  }

  const maquilaPorCliente: Record<string, number> = {}
  for (const d of deudores) {
    if ((Number(d.deuda_vencida) || 0) <= 0) continue
    if (!porCliente.has(d.nombre_fantasia)) continue
    const monto = maquilaVencidaDe(
      d as Parameters<typeof maquilaVencidaDe>[0],
      porCliente.get(d.nombre_fantasia) ?? [],
    )
    if (monto > 0) maquilaPorCliente[d.nombre_fantasia] = monto
  }
  return { maquilaPorCliente, soloMaquila }
}

export interface ClienteDeudaComercial {
  nombre: string
  /** Nombre canónico de la cartera ("Nicol Delgado"). */
  vendedor: string
  /** Deuda vencida sin maquila, redondeada. */
  vencida: number
}

export interface CarteraDeudaComercial {
  vendedor: string
  /** Deudores de la cartera (con o sin plata vencida) — el "19 deudores" de la tarjeta. */
  deudores: number
  vencida: number
}

export interface ResumenDeudaComercial {
  total: { deudores: number; vencida: number }
  /** Siempre todas las carteras de cobranza, de mayor a menor deuda vencida. */
  carteras: CarteraDeudaComercial[]
  /** Clientes con deuda vencida comercial > 0. */
  clientes: ClienteDeudaComercial[]
}

export async function resumenDeudaComercial(supabase: SupabaseClient): Promise<ResumenDeudaComercial> {
  const { data } = await supabase.from('deudores').select('*')
  const deudores = (data ?? []) as (DeudorRow & { vendedor: string | null })[]
  const { maquilaPorCliente, soloMaquila } = await calcularMaquila(supabase, deudores)

  const acc = new Map<string, CarteraDeudaComercial>(
    VENDEDORES_CARTERA_COBRANZA.map(v => [v, { vendedor: v, deudores: 0, vencida: 0 }]),
  )
  const clientes: ClienteDeudaComercial[] = []

  for (const d of deudores) {
    if (soloMaquila.has(d.nombre_fantasia)) continue
    if (grupoCarteraDe(d.vendedor) !== 'vendedor') continue
    const fila = acc.get(vendedorCanonico(d.vendedor))
    if (!fila) continue
    const maquila = maquilaPorCliente[d.nombre_fantasia] ?? 0
    const vencida = Math.round(Math.max(0, (d.deuda_vencida || 0) - maquila))
    fila.deudores++
    fila.vencida += vencida
    if (vencida > 0) clientes.push({ nombre: d.nombre_fantasia, vendedor: fila.vendedor, vencida })
  }

  const carteras = [...acc.values()].sort((a, b) => b.vencida - a.vencida)
  const total = carteras.reduce(
    (t, c) => ({ deudores: t.deudores + c.deudores, vencida: t.vencida + c.vencida }),
    { deudores: 0, vencida: 0 },
  )
  return { total, carteras, clientes }
}
