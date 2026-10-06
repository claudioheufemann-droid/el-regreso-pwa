import { NextRequest, NextResponse, after } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cicloEnCursoISO, inicioDeCiclo, finDeCiclo } from '@/lib/produccion/reglas'
import { ErrorAgente, responderPregunta } from '@/lib/agente/gemini'
import {
  crearConversacion, guardarMensaje, historialSinResumir, memoriasParaContexto, obtenerConversacion,
  resumirSiHaceFalta, sumarTokensConversacion,
} from '@/lib/agente/memoria'
import { PARAMETROS, construirContexto } from '@/lib/agente/sistema'
import { accionesDeConversacion, correosDeConversacion, listasDeConversacion } from '@/lib/agente/correos'
import { accesoAsistente } from '@/lib/agente/alcance'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/agente  { mensaje: string, conversacion_id?: uuid }
 *
 * Asistente de datos (chat). Sólo administradores: las herramientas leen
 * facturación, deuda y clientes de toda la empresa, así que el control de
 * acceso se decide ACÁ y no en las consultas. El historial vive en la base
 * (agente_conversaciones / agente_mensajes): el navegador sólo manda la
 * pregunta nueva y el id de la conversación. Ver lib/agente/README.md.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  // Completo (admin o users.puede_usar_asistente): toda la base. Vendedor (con cartera en el
  // ERP): sólo su cartera y sólo las herramientas de HERRAMIENTAS_VENDEDOR. Nadie más.
  const acceso = accesoAsistente(user)
  if (!acceso) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  const alcance = acceso === 'vendedor' ? { nombre: user.nombre, vendedoresErp: user.vendedoresErp } : null

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'Falta configurar GEMINI_API_KEY (clave gratuita en https://aistudio.google.com/apikey).',
    }, { status: 503 })
  }

  const body = await req.json().catch(() => null) as { mensaje?: unknown; conversacion_id?: unknown } | null
  const pregunta = typeof body?.mensaje === 'string' ? body.mensaje.trim().slice(0, PARAMETROS.maxLargoPregunta) : ''
  if (!pregunta) return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 })

  const admin = createAdminClient()
  const hoyISO = new Date().toISOString().slice(0, 10)
  const t0 = Date.now()

  try {
    // Una conversación ajena, archivada o inexistente se trata como nueva: nunca se lee la de otro usuario.
    const existente = typeof body?.conversacion_id === 'string' ? await obtenerConversacion(admin, user.id, body.conversacion_id) : null
    const conv = existente ?? await crearConversacion(admin, user.id, pregunta)

    const [historial, memorias] = await Promise.all([
      existente ? historialSinResumir(admin, conv) : Promise.resolve([]),
      memoriasParaContexto(admin, user.id, pregunta),
    ])
    const ciclo = cicloEnCursoISO()
    const contexto = construirContexto({
      hoyISO, ciclo: { inicio: inicioDeCiclo(ciclo), fin: finDeCiclo(ciclo) },
      usuario: user.nombre, memorias, resumen: conv.resumen, modoVendedor: !!alcance,
    })

    await guardarMensaje(admin, conv.id, { rol: 'usuario', texto: pregunta })

    const registrar = (herramientas: string[], respondio: boolean, uso?: { entrada: number; salida: number; cacheados: number; rondas: number; modelo: string | null }, error?: string) =>
      admin.from('agente_consultas_log').insert({
        usuario_id: user.id, pregunta, herramientas, respondio, error: error ?? null, duracion_ms: Date.now() - t0,
        conversacion_id: conv.id, tokens_entrada: uso?.entrada ?? null, tokens_salida: uso?.salida ?? null, tokens_cacheados: uso?.cacheados ?? null,
        modelo: uso?.modelo ?? null, rondas: uso?.rondas ?? null,
      }).then(() => undefined, () => undefined)

    try {
      const r = await responderPregunta({ historial, pregunta, contexto, apiKey, ctx: { admin, hoyISO, usuarioId: user.id, conversacionId: conv.id, alcance } })
      const nombres = [...new Set(r.herramientas.map(h => h.nombre))]
      await Promise.all([
        guardarMensaje(admin, conv.id, { rol: 'agente', texto: r.respuesta, herramientas: nombres }),
        sumarTokensConversacion(admin, conv, r.uso),
        registrar(r.herramientas.map(h => h.nombre), r.herramientas.some(h => h.ok), r.uso),
      ])
      // Resumir lo viejo corre después de responder: no suma espera a esta pregunta.
      after(() => resumirSiHaceFalta(admin, apiKey, conv.id))
      // Borradores de correo de la conversación: el chat los muestra con "Enviar" / "Descartar".
      const usoCorreo = r.herramientas.some(h => h.nombre === 'preparar_correo_vendedor')
      const usoAccion = r.herramientas.some(h => h.nombre === 'preparar_tarea_vendedor' || h.nombre === 'gestionar_aviso')
      const usoLista = r.herramientas.some(h => h.nombre === 'lista_pedidos_por_despachar' || h.nombre === 'crear_lista')
      const [correos, acciones, listas] = await Promise.all([
        usoCorreo ? correosDeConversacion(admin, conv.id, user.id) : undefined,
        usoAccion ? accionesDeConversacion(admin, conv.id, user.id) : undefined,
        usoLista ? listasDeConversacion(admin, conv.id, user.id) : undefined,
      ])
      return NextResponse.json({ conversacion_id: conv.id, respuesta: r.respuesta, herramientas: r.herramientas, uso: r.uso, correos, acciones, listas })
    } catch (e) {
      const status = e instanceof ErrorAgente ? e.status : 500
      const mensaje = e instanceof ErrorAgente ? e.message : 'Error inesperado del asistente.'
      if (!(e instanceof ErrorAgente)) console.error('[agente]', e)
      await Promise.all([
        guardarMensaje(admin, conv.id, { rol: 'agente', texto: mensaje, error: true }),
        registrar([], false, undefined, mensaje),
      ])
      return NextResponse.json({ error: mensaje, conversacion_id: conv.id }, { status })
    }
  } catch (e) {
    console.error('[agente] error preparando la conversación', e)
    return NextResponse.json({ error: 'No se pudo preparar la conversación.' }, { status: 500 })
  }
}
