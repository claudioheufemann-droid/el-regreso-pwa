import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function puedeGestionar(user: { isAdmin: boolean; macroArea: string | null }) {
  return user.isAdmin || user.macroArea === 'produccion'
}

/**
 * POST /api/produccion/plan/reordenar
 *
 * Recibe la cola COMPLETA en el orden nuevo (array de ids) y reescribe
 * `prioridad` como 0..N-1 en ese orden — un solo reordenamiento (mover un
 * lote arriba o abajo) reescribe a todos los que quedaron atrás, así nunca
 * hay huecos ni empates que resolver a mano. Más simple y robusto que
 * mantener una prioridad fraccional o desplazar sólo un rango.
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: { ids: string[] }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: 'Falta la lista de ids' }, { status: 400 })
  }

  const admin = createAdminClient()
  for (let i = 0; i < body.ids.length; i++) {
    const { error } = await admin.from('plan_produccion').update({ prioridad: i }).eq('id', body.ids[i])
    if (error) return NextResponse.json({ error: `Fila ${i}: ${error.message}` }, { status: 500 })
  }
  return NextResponse.json({ ok: true, total: body.ids.length })
}
