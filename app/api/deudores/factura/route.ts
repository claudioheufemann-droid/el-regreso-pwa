import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { vendedorCanonico } from '@/lib/types'

/**
 * POST /api/deudores/factura  { cliente, pedido, numeroFactura }
 *
 * Guarda el N° de factura que el ERP le puso a un pedido, para que se pueda
 * buscar ese documento directamente en Gestión Cervecera. El informe de
 * ventas no lo trae (sólo el N° de pedido) — ver la nota en
 * supabase/migrations/facturas_pedido.sql sobre por qué vive en su propia
 * tabla y no en `ventas`.
 *
 * Mandar `numeroFactura` vacío borra el registro (corrige un número mal
 * cargado sin dejar una fila fantasma).
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { cliente?: string; pedido?: string; numeroFactura?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const cliente = body.cliente?.trim()
  const pedido = body.pedido?.trim()
  if (!cliente) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })
  if (!pedido) return NextResponse.json({ error: 'Falta el pedido' }, { status: 400 })

  // Ver la nota en /api/deudores/detalle: sin este catch, un entorno sin
  // SUPABASE_SERVICE_KEY devuelve un 500 con el cuerpo vacío.
  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  // Mismo scope de cartera que el resto del módulo: un vendedor sólo carga
  // facturas de sus propios clientes.
  const { data: deudor } = await supabase
    .from('deudores')
    .select('vendedor')
    .eq('nombre_fantasia', cliente)
    .maybeSingle()

  if (!deudor) return NextResponse.json({ error: 'Cliente sin deuda registrada' }, { status: 404 })

  if (!user.isAdmin) {
    const mios = user.vendedoresErp.map(vendedorCanonico)
    if (!mios.includes(vendedorCanonico(deudor.vendedor))) {
      return NextResponse.json({ error: 'Ese cliente no es de tu cartera' }, { status: 403 })
    }
  }

  const numeroFactura = body.numeroFactura?.trim() ?? ''

  if (!numeroFactura) {
    const { error } = await supabase.from('facturas_pedido').delete().eq('pedido', pedido)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, numeroFactura: null })
  }

  const fila = {
    pedido,
    numero_factura: numeroFactura,
    actualizado_por: user.nombre ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('facturas_pedido')
    .upsert(fila, { onConflict: 'pedido' })
    .select('numero_factura')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, numeroFactura: data.numero_factura })
}
