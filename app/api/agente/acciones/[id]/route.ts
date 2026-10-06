import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { accesoAsistente } from '@/lib/agente/alcance'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendPushToUser } from '@/lib/push'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agente/acciones/[id]  { accion: 'confirmar' | 'descartar' }
 *
 * Ejecuta (o descarta) una acción que propuso el Asistente de datos: crear una
 * tarea para un vendedor, o crear/cancelar un aviso semanal. Lo dispara una
 * persona desde la tarjeta del chat, nunca el modelo. Sólo admin y sólo quien
 * la pidió; `pendiente → ejecutando` con actualización condicional (sin doble
 * ejecución). Ver lib/agente/consultas/acciones.ts.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  // Sólo acceso completo (admin o puede_usar_asistente): el modo vendedor no tiene acciones.
  if (accesoAsistente(user) !== 'completo') return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const { id } = await params
  const body = await req.json().catch(() => null) as { accion?: unknown } | null
  if (body?.accion !== 'confirmar' && body?.accion !== 'descartar') return NextResponse.json({ error: 'Acción inválida.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: accion } = await admin.from('agente_acciones').select('id, creado_por, tipo, titulo, datos, estado').eq('id', id).maybeSingle()
  if (!accion || accion.creado_por !== user.id) return NextResponse.json({ error: 'Acción no encontrada.' }, { status: 404 })
  if (accion.estado !== 'pendiente' && accion.estado !== 'error') return NextResponse.json({ error: `Esta acción ya está ${accion.estado}.` }, { status: 409 })

  if (body.accion === 'descartar') {
    await admin.from('agente_acciones').update({ estado: 'descartada' }).eq('id', id).in('estado', ['pendiente', 'error'])
    return NextResponse.json({ ok: true, estado: 'descartada' })
  }

  const { data: reservada } = await admin.from('agente_acciones').update({ estado: 'ejecutando', error: null })
    .eq('id', id).in('estado', ['pendiente', 'error']).select('id').maybeSingle()
  if (!reservada) return NextResponse.json({ error: 'Esta acción ya se está ejecutando.' }, { status: 409 })

  const fallar = async (mensaje: string, status = 500) => {
    await admin.from('agente_acciones').update({ estado: 'error', error: mensaje.slice(0, 300) }).eq('id', id)
    return NextResponse.json({ error: mensaje }, { status })
  }
  const datos = (accion.datos ?? {}) as Record<string, unknown>

  try {
    let resultado: Record<string, unknown> = {}

    if (accion.tipo === 'tarea') {
      const responsableId = String(datos.responsable_id ?? '')
      const plazo = String(datos.plazo ?? '')
      if (!responsableId || !/^\d{4}-\d{2}-\d{2}$/.test(plazo)) return fallar('La tarea quedó incompleta (responsable o plazo).', 400)
      // Misma forma que /api/tasks/assign (formulario de Gestión).
      const { data: task, error } = await admin.from('tasks').insert({
        titulo: accion.titulo,
        descripcion: String(datos.descripcion ?? ''),
        area: String(datos.area ?? 'Ventas'),
        responsable_id: responsableId,
        responsable_ids: [responsableId],
        plazo,
        prioridad_maxima: false,
        estado: 'Asignada',
        contador_retrasos: 0,
        creado_por: user.id,
        nota_admin: 'Creada desde el Asistente de datos.',
      }).select('id').single()
      if (error) return fallar(`No se pudo crear la tarea: ${error.message}`)
      await sendPushToUser(responsableId, {
        title: '📋 Nueva tarea', body: `${accion.titulo} — de ${user.nombre}`, taskId: task.id, tag: `task-assigned-${task.id}`, requireInteraction: true,
      })
      resultado = { tarea_id: task.id }
    } else if (accion.tipo === 'aviso_crear') {
      const { data: aviso, error } = await admin.from('agente_avisos').insert({
        usuario_id: user.id,
        dia_semana: Number(datos.dia_semana) || 1,
        dias_ventana: Number(datos.dias_ventana) || 7,
        canal: ['correo', 'push', 'ambos'].includes(String(datos.canal)) ? String(datos.canal) : 'correo',
      }).select('id').single()
      if (error) return fallar(`No se pudo crear el aviso: ${error.message}`)
      resultado = { aviso_id: aviso.id }
    } else if (accion.tipo === 'aviso_cancelar') {
      const { error } = await admin.from('agente_avisos').update({ activo: false })
        .eq('id', String(datos.aviso_id ?? '')).eq('usuario_id', user.id)
      if (error) return fallar(`No se pudo cancelar el aviso: ${error.message}`)
    } else {
      return fallar('Tipo de acción desconocido.', 400)
    }

    await admin.from('agente_acciones').update({ estado: 'hecha', resultado, ejecutada_at: new Date().toISOString() }).eq('id', id)
    return NextResponse.json({ ok: true, estado: 'hecha', resultado })
  } catch (e) {
    console.error('[agente/acciones]', e)
    return fallar('Error inesperado al ejecutar la acción.')
  }
}
