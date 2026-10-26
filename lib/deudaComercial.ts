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
import { esLineaMaquila, reconstruirCobranza, sumarDias, type DeudorEntrada, type FilaVenta } from '@/lib/cobranza'
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

type DeudorRow = {
  nombre_fantasia: string
  deuda_vencida: number | null
  saldo_total?: number | null
  external_fecha?: string | null
}

export interface CalculoMaquila {
  /** { nombre_fantasia → plata vencida que es maquila }. Sólo los que tienen. */
  maquilaPorCliente: Record<string, number>
  /** Clientes cuya venta reconstruida es 100% maquila (nunca compraron cerveza ni kombucha). */
  soloMaquila: Set<string>
  /**
   * { nombre_fantasia → vencimiento real, contado desde la entrega }. Se
   * aplica a las filas con `conVencimientoReal` antes de mostrarlas.
   */
  vencimientoPorCliente: Record<string, VencimientoReal>
}

export interface VencimientoReal {
  /** Plata que el ERP da por vencida pero que todavía no vence. */
  noExigible: number
  /** Días de mora reales del documento más antiguo (0 = vence hoy). */
  diasMora: number
}

const COLUMNAS_VENTA_COBRANZA =
  'nombre_fantasia, pedido, fecha_pedido, fecha_entrega, producto, envase, categoria_producto, litros, total_sin_impuesto, numero_factura'
const DEUDORES_POR_CONSULTA = 25
const FILAS_POR_PAGINA = 1000

/**
 * Las ventas que hacen falta para reconstruir la deuda de cada deudor: desde
 * 10 días antes de su remito más antiguo con saldo (lo anterior ya está
 * pagado). Se agrupan deudores con ventanas parecidas para no pedir una
 * consulta por cliente (~190), y se pagina porque Supabase corta en 1000.
 */
async function ventasParaCobranza(
  supabase: SupabaseClient,
  deudores: DeudorRow[],
): Promise<Map<string, FilaVenta[]>> {
  const desdeDe = (d: DeudorRow) =>
    d.external_fecha ? sumarDias(String(d.external_fecha).slice(0, 10), -10) : null
  const ordenados = [...deudores].sort((a, b) => (desdeDe(a) ?? '').localeCompare(desdeDe(b) ?? ''))
  const grupos: DeudorRow[][] = []
  for (let i = 0; i < ordenados.length; i += DEUDORES_POR_CONSULTA) {
    grupos.push(ordenados.slice(i, i + DEUDORES_POR_CONSULTA))
  }

  const porCliente = new Map<string, FilaVenta[]>()
  await Promise.all(grupos.map(async grupo => {
    const desde = desdeDe(grupo[0]) // el más antiguo del grupo
    for (let pagina = 0; ; pagina++) {
      let q = supabase
        .from('ventas')
        .select(COLUMNAS_VENTA_COBRANZA)
        .in('nombre_fantasia', grupo.map(d => d.nombre_fantasia))
        .order('id')
        .range(pagina * FILAS_POR_PAGINA, (pagina + 1) * FILAS_POR_PAGINA - 1)
      if (desde) q = q.gte('fecha_pedido', desde)
      const { data, error } = await q
      if (error) throw new Error(`ventas para cobranza: ${error.message}`)
      for (const v of (data ?? []) as unknown as (FilaVenta & { nombre_fantasia: string })[]) {
        const arr = porCliente.get(v.nombre_fantasia)
        if (arr) arr.push(v)
        else porCliente.set(v.nombre_fantasia, [v])
      }
      if (!data || data.length < FILAS_POR_PAGINA) break
    }
  }))
  return porCliente
}

/**
 * Ajusta las filas del ERP al vencimiento real: `deuda_vencida` deja fuera lo
 * que todavía no vence (pasa a ser saldo por vencer, así `saldo_total` no
 * cambia) y `dias_mora` trae los días contados desde la entrega. `dias_mora`
 * null ⇒ no se pudo reconstruir; la pantalla cae al estimado del ERP.
 */
export function conVencimientoReal<T extends { nombre_fantasia: string; deuda_vencida: number | null }>(
  filas: T[],
  vencimientoPorCliente: Record<string, VencimientoReal>,
): (T & { dias_mora: number | null })[] {
  return filas.map(d => {
    const v = vencimientoPorCliente[d.nombre_fantasia]
    if (!v) return { ...d, dias_mora: null }
    return {
      ...d,
      deuda_vencida: Math.round(Math.max(0, (Number(d.deuda_vencida) || 0) - v.noExigible)),
      dias_mora: v.diasMora,
    }
  })
}

/**
 * Maquila (co-packing a terceros): el ERP la factura al mismo cliente, así
 * que entra en `deuda_vencida`, pero no es cobranza del área comercial.
 *
 * De paso reconstruye la deuda de cada deudor con vencida para corregir su
 * vencimiento: el ERP cuenta la mora desde el pedido y el crédito corre desde
 * la entrega (ver lib/cobranza.ts). Sin esto la lista mostraba días de mora
 * inflados y daba por vencidas facturas que todavía no vencían.
 */
export async function calcularMaquila(
  supabase: SupabaseClient,
  deudores: DeudorRow[],
): Promise<CalculoMaquila> {
  if (deudores.length === 0) return { maquilaPorCliente: {}, soloMaquila: new Set(), vencimientoPorCliente: {} }

  const conVencida = deudores.filter(d => (Number(d.deuda_vencida) || 0) > 0)
  const ventasCobranza = await ventasParaCobranza(supabase, conVencida)
  const maquilaPorCliente: Record<string, number> = {}
  const vencimientoPorCliente: Record<string, VencimientoReal> = {}
  for (const d of conVencida) {
    const ventas = ventasCobranza.get(d.nombre_fantasia)
    if (!ventas?.length) continue
    const r = reconstruirCobranza(d as unknown as DeudorEntrada, ventas)
    if (r.maquilaVencida > 0) maquilaPorCliente[d.nombre_fantasia] = r.maquilaVencida
    vencimientoPorCliente[d.nombre_fantasia] = { noExigible: r.vencidoNoExigible, diasMora: r.diasMoraMaxima }
  }

  // Paso 1: qué deudores tienen alguna venta de maquila (sin filtrar por deuda:
  // un cliente 100% maquila igual hay que detectarlo aunque su deuda no esté
  // vencida todavía).
  const { data: filasMaquila } = await supabase
    .from('ventas')
    .select('nombre_fantasia')
    .or('producto.ilike.%maquila%,producto.ilike.%latas finales%')
    .in('nombre_fantasia', deudores.map(d => d.nombre_fantasia))

  const clientes = [...new Set((filasMaquila ?? []).map(f => f.nombre_fantasia as string))]
  if (clientes.length === 0) return { maquilaPorCliente, soloMaquila: new Set(), vencimientoPorCliente }

  // Paso 2: TODA su venta — si nunca compraron algo que no sea maquila, el
  // cliente entero se saca de Deudores.
  const { data: ventas } = await supabase
    .from('ventas')
    .select('nombre_fantasia, producto')
    .in('nombre_fantasia', clientes)

  const porCliente = new Map<string, Pick<FilaVenta, 'producto'>[]>()
  for (const v of (ventas ?? []) as { nombre_fantasia: string; producto: string }[]) {
    const arr = porCliente.get(v.nombre_fantasia)
    if (arr) arr.push(v)
    else porCliente.set(v.nombre_fantasia, [v])
  }

  const soloMaquila = new Set<string>()
  for (const nombre of clientes) {
    const filas = porCliente.get(nombre) ?? []
    if (filas.length > 0 && filas.every(f => esLineaMaquila(f.producto))) soloMaquila.add(nombre)
  }

  return { maquilaPorCliente, soloMaquila, vencimientoPorCliente }
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
  /**
   * Saldo por cobrar de la cartera (vencido + por vencer), sin maquila. Base
   * del "% de la cartera vencida" = vencida / saldo.
   */
  saldo: number
}

export interface ResumenDeudaComercial {
  total: { deudores: number; vencida: number; saldo: number }
  /** Siempre todas las carteras de cobranza, de mayor a menor deuda vencida. */
  carteras: CarteraDeudaComercial[]
  /** Clientes con deuda vencida comercial > 0. */
  clientes: ClienteDeudaComercial[]
}

export async function resumenDeudaComercial(supabase: SupabaseClient): Promise<ResumenDeudaComercial> {
  const { data } = await supabase.from('deudores').select('*')
  const filasERP = (data ?? []) as (DeudorRow & { vendedor: string | null })[]
  const { maquilaPorCliente, soloMaquila, vencimientoPorCliente } = await calcularMaquila(supabase, filasERP)
  const deudores = conVencimientoReal(filasERP, vencimientoPorCliente)

  const acc = new Map<string, CarteraDeudaComercial>(
    VENDEDORES_CARTERA_COBRANZA.map(v => [v, { vendedor: v, deudores: 0, vencida: 0, saldo: 0 }]),
  )
  const clientes: ClienteDeudaComercial[] = []

  for (const d of deudores) {
    if (soloMaquila.has(d.nombre_fantasia)) continue
    if (grupoCarteraDe(d.vendedor) !== 'vendedor') continue
    const fila = acc.get(vendedorCanonico(d.vendedor))
    if (!fila) continue
    const maquila = maquilaPorCliente[d.nombre_fantasia] ?? 0
    const vencida = Math.round(Math.max(0, (d.deuda_vencida || 0) - maquila))
    // El saldo nunca queda bajo lo vencido (el ERP a veces trae saldo_total
    // desfasado), así el % no pasa de 100.
    const saldo = Math.max(vencida, Math.round((Number(d.saldo_total) || 0) - maquila))
    fila.deudores++
    fila.vencida += vencida
    fila.saldo += saldo
    if (vencida > 0) clientes.push({ nombre: d.nombre_fantasia, vendedor: fila.vendedor, vencida })
  }

  const carteras = [...acc.values()].sort((a, b) => b.vencida - a.vencida)
  const total = carteras.reduce(
    (t, c) => ({ deudores: t.deudores + c.deudores, vencida: t.vencida + c.vencida, saldo: t.saldo + c.saldo }),
    { deudores: 0, vencida: 0, saldo: 0 },
  )
  return { total, carteras, clientes }
}
