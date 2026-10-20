import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/** POST: registrar una salida del lote (barriles o latas). No deja envasar más
 *  litros de los que tiene el lote (litros iniciales − merma). */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!user || !(user.isAdmin || user.macroArea === 'produccion')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  const { id } = await params

  let body: { formato?: 'barril' | 'lata' | 'botella'; capacidadMl?: number | null; unidades?: number; litros?: number; fecha?: string; observaciones?: string | null }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  if (!body.formato || !['barril', 'lata', 'botella'].includes(body.formato)) return NextResponse.json({ error: 'Formato inválido' }, { status: 400 })
  if (!(Number.isInteger(body.unidades) && (body.unidades as number) > 0)) return NextResponse.json({ error: 'Unidades inválidas' }, { status: 400 })
  if (!(typeof body.litros === 'number' && body.litros > 0)) return NextResponse.json({ error: 'Litros inválidos' }, { status: 400 })

  const admin = createAdminClient()
  const [lote, previo] = await Promise.all([
    admin.from('lotes').select('litros_iniciales, litros_merma').eq('id', id).single(),
    admin.from('lote_envasado').select('litros').eq('lote_id', id),
  ])
  if (lote.error) return NextResponse.json({ error: 'Lote no encontrado' }, { status: 404 })

  const yaEnvasado = (previo.data ?? []).reduce((s, e) => s + Number(e.litros), 0)
  const disponible = Number(lote.data.litros_iniciales) - Number(lote.data.litros_merma) - yaEnvasado
  if (body.litros > disponible + 0.001) {
    return NextResponse.json({ error: `El lote solo tiene ${Math.max(0, Math.round(disponible))} L por envasar` }, { status: 409 })
  }

  const { data, error } = await admin.from('lote_envasado').insert({
    lote_id: id,
    formato: body.formato,
    capacidad_ml: body.capacidadMl ?? null,
    unidades: body.unidades,
    litros: body.litros,
    ...(body.fecha ? { fecha: body.fecha } : {}),
    observaciones: body.observaciones ?? null,
  }).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
