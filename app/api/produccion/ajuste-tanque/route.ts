import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST/DELETE /api/produccion/ajuste-tanque
 *
 * Corrige a mano la fecha de un lote FÍSICO ya en fermentación, detectado
 * desde el informe del ERP (ver la migración ajuste_lote_tanque_fechas_manuales
 * y el bloque 'en_tanque' en ProduccionClient.tsx / GanttProduccion.tsx).
 *
 * No toca config_produccion_producto: ese default alimenta el forecast de
 * stock de seguridad y las alarmas de quiebre para TODOS los lotes futuros
 * del producto, y esto es una corrección de UN lote puntual.
 *
 * Mismo patrón de auth que el resto de Producción (getServerUser +
 * service-role): en modo demo no hay sesión real de Supabase, así que RLS
 * `authenticated` bloquearía cualquier escritura directa desde el cliente.
 */
function puedeGestionar(user: { isAdmin: boolean; macroArea: string | null }) {
  return user.isAdmin || user.macroArea === 'produccion'
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/

interface AjusteBody {
  tanque: string
  codigoLote: string
  fechaInicioManual?: string | null
  fechaEmbarriladoManual?: string | null
}

export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: AjusteBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (!body.tanque || !body.codigoLote) {
    return NextResponse.json({ error: 'Faltan tanque y código de lote' }, { status: 400 })
  }
  const inicio = body.fechaInicioManual ?? null
  const embarrillado = body.fechaEmbarriladoManual ?? null
  if (!inicio && !embarrillado) {
    return NextResponse.json({ error: 'Hay que corregir al menos una fecha' }, { status: 400 })
  }
  if ((inicio && !FECHA_RE.test(inicio)) || (embarrillado && !FECHA_RE.test(embarrillado))) {
    return NextResponse.json({ error: 'Fecha inválida' }, { status: 400 })
  }
  if (inicio && embarrillado && embarrillado <= inicio) {
    return NextResponse.json({ error: 'El embarrilado tiene que ser después del inicio' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('ajuste_lote_tanque')
    .upsert({
      tanque: body.tanque,
      codigo_lote: body.codigoLote,
      fecha_inicio_manual: inicio,
      fecha_embarrillado_manual: embarrillado,
      actualizado_at: new Date().toISOString(),
      actualizado_por: UUID_RE.test(user.id) ? user.id : null,
    }, { onConflict: 'tanque,codigo_lote' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

/** Restablece un lote a la fecha que calcula la app (ERP + duración del
 *  producto) — borra el ajuste en vez de dejarlo en null, para no confundir
 *  "nunca se corrigió" con "se corrigió a nulo". */
export async function DELETE(req: Request) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const tanque = searchParams.get('tanque')
  const codigoLote = searchParams.get('codigoLote')
  if (!tanque || !codigoLote) return NextResponse.json({ error: 'Faltan tanque y código de lote' }, { status: 400 })

  const admin = createAdminClient()
  const { error } = await admin
    .from('ajuste_lote_tanque')
    .delete()
    .eq('tanque', tanque)
    .eq('codigo_lote', codigoLote)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
