import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { BANCOS, type BancoId } from '@/lib/administracion/finanzas'

export const dynamic = 'force-dynamic'

/**
 * POST /api/administracion/caja-saldo — registra el saldo de UN banco a una
 * fecha. Es el punto de partida del saldo acumulado del dashboard de flujo de
 * caja: ningún informe automatizado entrega saldo de cuenta corriente, así
 * que este dato sólo puede venir cargado a mano (o, más adelante, de un sync
 * dedicado por banco — hoy no existe).
 *
 * La empresa opera 3 cuentas reales (Banco de Chile, Santander, Itaú) desde
 * el 23-sep-2026, cada una con su propio saldo — antes esta tabla asumía una
 * sola cuenta. Una fila por (fecha, banco): volver a guardar el mismo día
 * para el mismo banco corrige el valor en vez de duplicarlo.
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Sólo administradores' }, { status: 403 })

  let body: { fecha?: string; saldo?: number; banco?: string; nota?: string }
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
  const banco = body.banco as BancoId
  if (!BANCOS.includes(banco)) {
    return NextResponse.json({ error: `Banco inválido: debe ser ${BANCOS.join(', ')}` }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('caja_saldos')
    .upsert({ fecha, banco, saldo, nota: body.nota ?? null, creado_por: user.id }, { onConflict: 'fecha,banco' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, fecha, banco, saldo })
}
