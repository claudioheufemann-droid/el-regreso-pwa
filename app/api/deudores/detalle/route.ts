import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { vendedorCanonico } from '@/lib/types'
import { reconstruirCobranza, type FilaVenta } from '@/lib/cobranza'

/**
 * GET /api/deudores/detalle?cliente=<nombre_fantasia>
 *
 * Devuelve las facturas vencidas de un deudor con su detalle de productos y
 * precios, más el contacto de cobranza. Se pide bajo demanda (al desplegar la
 * tarjeta del cliente) y no en la carga de /ventas/deudores: son ~170 deudores
 * y traer todas sus líneas de venta de entrada serían varios MB por pantalla.
 *
 * La reconstrucción vive en lib/cobranza.ts — ahí está explicado por qué hace
 * falta y contra qué se validó.
 */
export async function GET(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const cliente = new URL(req.url).searchParams.get('cliente')?.trim()
  if (!cliente) return NextResponse.json({ error: 'Falta el parámetro cliente' }, { status: 400 })

  // createAdminClient tira si falta SUPABASE_SERVICE_KEY (pasa en entornos
  // locales sin el .env completo). Sin este catch el 500 sale con el cuerpo
  // vacío y el panel muestra "Unexpected end of JSON input" en vez del motivo.
  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  const { data: deudor, error: errDeudor } = await supabase
    .from('deudores')
    .select('*')
    .eq('nombre_fantasia', cliente)
    .maybeSingle()

  if (errDeudor) return NextResponse.json({ error: errDeudor.message }, { status: 500 })
  if (!deudor) return NextResponse.json({ error: 'Cliente sin deuda registrada' }, { status: 404 })

  // Scope de cartera — mismo criterio que /ventas/deudores/page.tsx: el
  // service-role saltea RLS, así que el permiso se chequea acá a mano.
  if (!user.isAdmin) {
    const mios = user.vendedoresErp.map(vendedorCanonico)
    if (!mios.includes(vendedorCanonico(deudor.vendedor))) {
      return NextResponse.json({ error: 'Ese cliente no es de tu cartera' }, { status: 403 })
    }
  }

  // Sólo se necesitan las ventas desde el documento más antiguo con saldo: lo
  // anterior ya está pagado, por definición del informe del ERP.
  const desde = deudor.external_fecha ? String(deudor.external_fecha).slice(0, 10) : null

  let qVentas = supabase
    .from('ventas')
    .select('pedido, fecha_pedido, producto, envase, categoria_producto, litros, total_sin_impuesto')
    .eq('nombre_fantasia', cliente)
    .order('fecha_pedido', { ascending: false })
  if (desde) qVentas = qVentas.gte('fecha_pedido', desde)

  const [{ data: ventas, error: errVentas }, { data: contacto }] = await Promise.all([
    qVentas,
    supabase
      .from('contactos_cobranza')
      .select('contacto, cargo, telefono, updated_at')
      .eq('nombre_fantasia', cliente)
      .maybeSingle(),
  ])

  if (errVentas) return NextResponse.json({ error: errVentas.message }, { status: 500 })

  const detalle = reconstruirCobranza(deudor, (ventas ?? []) as FilaVenta[])

  return NextResponse.json({
    cliente,
    razonSocial: deudor.razon_social ?? null,
    telefono: deudor.telefono ?? null,
    email: deudor.email ?? null,
    localidad: deudor.localidad ?? null,
    deudaVencida: Number(deudor.deuda_vencida) || 0,
    saldoTotal: Number(deudor.saldo_total) || 0,
    contacto: contacto ?? null,
    detalle,
  })
}
