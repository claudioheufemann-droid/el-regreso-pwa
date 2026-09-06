import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearEventoLote } from '@/lib/google-calendar'

/**
 * GET/POST /api/produccion/plan
 *
 * Cola priorizada de cocciones planificadas (tabla plan_produccion) — ver el
 * comentario extenso en la migración. Mismo patrón de auth que el resto de
 * Producción (getServerUser + service-role): en modo demo no hay sesión real
 * de Supabase, así que RLS `authenticated` bloquearía cualquier escritura
 * directa desde el cliente.
 */
function puedeGestionar(user: { isAdmin: boolean; macroArea: string | null }) {
  return user.isAdmin || user.macroArea === 'produccion'
}

// En modo demo `user.id` es el string literal 'demo', no un uuid — la
// columna creado_por acepta null para ese caso (ver control-comercial/reportes).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET() {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('plan_produccion')
    .select('*')
    .in('estado', ['planificado', 'en_curso'])
    .order('prioridad', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

interface CrearLotePlan {
  producto: string
  categoria: 'cerveza' | 'kombucha'
  litrosPlanificados: number
  fechaPlanificada: string
  origen?: 'sugerido' | 'manual'
  motivo?: string | null
  observaciones?: string | null
  /** Sólo para el detalle del evento de Google Calendar — no se persisten
   *  como columnas propias, son datos derivados del forecast en el momento
   *  de confirmar la sugerencia. */
  necesidadCubrir?: number | null
  cubreHasta?: string | null
}

export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: CrearLotePlan
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  if (!body.producto || !body.categoria || !body.litrosPlanificados || !body.fechaPlanificada) {
    return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
  }
  if (body.litrosPlanificados <= 0) {
    return NextResponse.json({ error: 'Los litros planificados deben ser mayores a 0' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Nueva fila SIEMPRE al final de la cola activa — el usuario reordena
  // después si quiere adelantarla. Evita que dos altas simultáneas elijan la
  // misma prioridad (a diferencia de calcularla en el cliente).
  const { data: maxRow } = await admin
    .from('plan_produccion')
    .select('prioridad')
    .in('estado', ['planificado', 'en_curso'])
    .order('prioridad', { ascending: false })
    .limit(1)
    .maybeSingle()
  const prioridad = (maxRow?.prioridad ?? -1) + 1

  const { data, error } = await admin
    .from('plan_produccion')
    .insert({
      producto: body.producto,
      categoria: body.categoria,
      litros_planificados: body.litrosPlanificados,
      fecha_planificada: body.fechaPlanificada,
      prioridad,
      origen: body.origen ?? 'manual',
      motivo: body.motivo ?? null,
      observaciones: body.observaciones ?? null,
      creado_por: UUID_RE.test(user.id) ? user.id : null,
    })
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sincronización con Google Calendar: mejor esfuerzo — si falla (o no está
  // configurada la cuenta de servicio) el lote igual queda creado, sólo sin
  // evento. Nunca debe tumbar el alta del lote.
  const googleEventId = await crearEventoLote({
    producto: data.producto, categoria: data.categoria,
    litrosPlanificados: Number(data.litros_planificados), fechaPlanificada: String(data.fecha_planificada).slice(0, 10),
    origen: data.origen, motivo: data.motivo,
    necesidadCubrir: body.necesidadCubrir ?? null, cubreHasta: body.cubreHasta ?? null,
  })
  if (googleEventId) {
    await admin.from('plan_produccion').update({ google_event_id: googleEventId }).eq('id', data.id)
    data.google_event_id = googleEventId
  }

  return NextResponse.json(data, { status: 201 })
}
