import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cicloEnCursoISO, inicioDeCiclo, finDeCiclo } from '@/lib/produccion/reglas'
import { ErrorAgente, responderPregunta, type MensajeChat } from '@/lib/agente/gemini'
import { PARAMETROS } from '@/lib/agente/sistema'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/agente  { mensajes: [{ rol: 'usuario' | 'agente', texto }] }
 *
 * Asistente de datos (chat). Sólo administradores: las herramientas leen
 * facturación, deuda y clientes de toda la empresa con service-role, así que el
 * control de acceso se decide ACÁ y no en las consultas. Ver lib/agente/README.md.
 */
export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })

  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      error: 'Falta configurar GEMINI_API_KEY (clave gratuita en https://aistudio.google.com/apikey).',
    }, { status: 503 })
  }

  const body = await req.json().catch(() => null) as { mensajes?: unknown } | null
  const mensajes: MensajeChat[] = Array.isArray(body?.mensajes)
    ? (body!.mensajes as unknown[]).flatMap(m => {
        const o = m as { rol?: unknown; texto?: unknown }
        if ((o?.rol !== 'usuario' && o?.rol !== 'agente') || typeof o.texto !== 'string' || !o.texto.trim()) return []
        return [{ rol: o.rol, texto: o.texto.slice(0, PARAMETROS.maxLargoPregunta) } as MensajeChat]
      })
    : []
  if (mensajes.length === 0 || mensajes[mensajes.length - 1].rol !== 'usuario') {
    return NextResponse.json({ error: 'Falta la pregunta.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const ciclo = cicloEnCursoISO()
  const pregunta = mensajes[mensajes.length - 1].texto
  const t0 = Date.now()

  const registrar = (herramientas: string[], respondio: boolean, error?: string) =>
    admin.from('agente_consultas_log').insert({
      usuario_id: user.id, pregunta, herramientas, respondio, error: error ?? null, duracion_ms: Date.now() - t0,
    }).then(() => undefined, () => undefined)

  try {
    const r = await responderPregunta({
      mensajes, apiKey,
      ctx: { admin, hoyISO: new Date().toISOString().slice(0, 10) },
      cicloActual: { inicio: inicioDeCiclo(ciclo), fin: finDeCiclo(ciclo) },
    })
    await registrar(r.herramientas.map(h => h.nombre), r.herramientas.some(h => h.ok))
    return NextResponse.json({ respuesta: r.respuesta, herramientas: r.herramientas })
  } catch (e) {
    const status = e instanceof ErrorAgente ? e.status : 500
    const mensaje = e instanceof ErrorAgente ? e.message : 'Error inesperado del asistente.'
    if (!(e instanceof ErrorAgente)) console.error('[agente]', e)
    await registrar([], false, mensaje)
    return NextResponse.json({ error: mensaje }, { status })
  }
}
