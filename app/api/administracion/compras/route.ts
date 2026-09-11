import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

const ESTADOS = ['comprometida', 'estimada', 'pagada'] as const

/**
 * POST /api/administracion/compras — registra un pago a proveedor para el
 * dashboard de flujo de caja. `fecha_pago` es la que manda (cuándo sale la
 * plata); `fecha_documento` es opcional y sólo alimenta el DPO del ciclo de
 * conversión de efectivo.
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Sólo administradores' }, { status: 403 })

  let body: {
    proveedor?: string; descripcion?: string; monto?: number
    fecha_pago?: string; fecha_documento?: string | null; estado?: string; categoria?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 })
  }

  const proveedor = (body.proveedor ?? '').trim()
  if (!proveedor) return NextResponse.json({ error: 'Falta el proveedor' }, { status: 400 })

  const monto = Number(body.monto)
  if (!Number.isFinite(monto) || monto <= 0) {
    return NextResponse.json({ error: 'El monto debe ser mayor que cero' }, { status: 400 })
  }

  const fechaPago = (body.fecha_pago ?? '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPago)) {
    return NextResponse.json({ error: 'Fecha de pago inválida' }, { status: 400 })
  }

  const fechaDoc = body.fecha_documento ? String(body.fecha_documento).slice(0, 10) : null
  if (fechaDoc && !/^\d{4}-\d{2}-\d{2}$/.test(fechaDoc)) {
    return NextResponse.json({ error: 'Fecha de factura inválida' }, { status: 400 })
  }

  const estado = ESTADOS.includes(body.estado as typeof ESTADOS[number])
    ? body.estado as typeof ESTADOS[number]
    : 'comprometida'

  const admin = createAdminClient()
  const { data, error } = await admin.from('compras_comprometidas').insert({
    proveedor,
    descripcion: body.descripcion ?? null,
    monto,
    fecha_pago: fechaPago,
    fecha_documento: fechaDoc,
    estado,
    categoria: body.categoria ?? null,
    creado_por: user.id,
  }).select('id').maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id ?? null })
}
