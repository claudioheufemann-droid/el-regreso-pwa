import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * POST /api/administracion/caja-saldo — registra el saldo bancario a una
 * fecha. Es el punto de partida del saldo acumulado del dashboard de flujo de
 * caja: el ERP no entrega saldo de cuenta corriente por ningún informe, así
 * que este dato sólo puede venir cargado a mano.
 *
 * Una fila por fecha: volver a guardar el mismo día corrige el valor en vez
 * de duplicarlo.
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Sólo administradores' }, { status: 403 })

  let body: { fecha?: string; saldo?: number; nota?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const fecha = (body.fecha ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }
  const saldo = Number(body.saldo)
  if (!Number.isFinite(saldo)) {
    return NextResponse.json({ error: 'Saldo inválido' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('caja_saldos')
    .upsert({ fecha, saldo, nota: body.nota ?? null, creado_por: user.id }, { onConflict: 'fecha' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, fecha, saldo })
}
