import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerUser } from '@/lib/auth'
import { vendedorCanonico } from '@/lib/types'

/**
 * POST /api/deudores/contacto  { cliente, contacto, cargo?, telefono? }
 *
 * Guarda el nombre de la persona con la que se habla de pagos en ese cliente.
 *
 * Vive en su propia tabla (`contactos_cobranza`) y NO en `clientes.contacto`
 * a propósito: el sync horario del ERP hace upsert de TODAS las columnas de
 * `clientes` con lo que trae el Excel, y ese Excel no tiene columna Contacto —
 * hoy los 171 deudores tienen `clientes.contacto` en null por eso mismo. Un
 * nombre guardado ahí se borraría solo dentro de la hora siguiente.
 *
 * Mandar `contacto` vacío borra el registro (así se corrige un nombre mal
 * cargado sin dejar una fila fantasma).
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { cliente?: string; contacto?: string; cargo?: string; telefono?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido' }, { status: 400 })
  }

  const cliente = body.cliente?.trim()
  if (!cliente) return NextResponse.json({ error: 'Falta el cliente' }, { status: 400 })

  // Ver la nota en /api/deudores/detalle: sin este catch, un entorno sin
  // SUPABASE_SERVICE_KEY devuelve un 500 con el cuerpo vacío.
  let supabase: ReturnType<typeof createAdminClient>
  try {
    supabase = createAdminClient()
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }

  // Mismo scope de cartera que el resto del módulo: un vendedor sólo edita
  // los contactos de sus propios clientes.
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

  const contacto = body.contacto?.trim() ?? ''

  if (!contacto) {
    const { error } = await supabase.from('contactos_cobranza').delete().eq('nombre_fantasia', cliente)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, contacto: null })
  }

  const fila = {
    nombre_fantasia: cliente,
    contacto,
    cargo: body.cargo?.trim() || null,
    telefono: body.telefono?.trim() || null,
    actualizado_por: user.nombre ?? null,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('contactos_cobranza')
    .upsert(fila, { onConflict: 'nombre_fantasia' })
    .select('contacto, cargo, telefono, updated_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, contacto: data })
}
