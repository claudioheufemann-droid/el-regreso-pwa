import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/** PATCH: actualizar precio, stock o cuántas van por lata de un ítem de envase
 *  (latas, etiquetas, tapas — tabla produccion_envase). Mismo permiso que el
 *  resto de Producción: administradores y equipo de Producción. */
export async function PATCH(req: Request) {
  const user = await getServerUser()
  if (!user || !(user.isAdmin || user.macroArea === 'produccion')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  let body: { clave?: string; precioUnitario?: number | null; stockUnidades?: number | null; porLata?: number }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }
  if (!body.clave) return NextResponse.json({ error: 'Falta la clave del ítem' }, { status: 400 })

  const numeroOpcional = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0)
  const cambios: Record<string, unknown> = { actualizado_at: new Date().toISOString(), actualizado_por: user.id }
  if (body.precioUnitario !== undefined) {
    if (!numeroOpcional(body.precioUnitario)) return NextResponse.json({ error: 'Precio inválido' }, { status: 400 })
    cambios.precio_unitario = body.precioUnitario
  }
  if (body.stockUnidades !== undefined) {
    if (!numeroOpcional(body.stockUnidades)) return NextResponse.json({ error: 'Stock inválido' }, { status: 400 })
    cambios.stock_unidades = body.stockUnidades
  }
  if (body.porLata !== undefined) {
    if (!(typeof body.porLata === 'number' && body.porLata > 0)) return NextResponse.json({ error: 'Cantidad por lata inválida' }, { status: 400 })
    cambios.por_lata = body.porLata
  }

  const admin = createAdminClient()
  const { data, error } = await admin.from('produccion_envase').update(cambios).eq('clave', body.clave).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
