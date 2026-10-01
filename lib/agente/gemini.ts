import { CONSULTAS, ejecutarConsulta } from './consultas'
import type { ContextoConsulta } from './consultas/_base'
import { PARAMETROS, construirSystemPrompt } from './sistema'

export interface MensajeChat {
  rol: 'usuario' | 'agente'
  texto: string
}

export interface HerramientaUsada {
  nombre: string
  args: Record<string, unknown>
  ok: boolean
}

export interface RespuestaAgente {
  respuesta: string
  herramientas: HerramientaUsada[]
}

export class ErrorAgente extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

interface ParteGemini {
  text?: string
  functionCall?: { name: string; args?: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  [k: string]: unknown
}
interface ContenidoGemini { role: 'user' | 'model'; parts: ParteGemini[] }

const MAX_CHARS_RESULTADO = 24_000

function declaraciones() {
  return CONSULTAS.map(c => {
    const requeridos = c.parametros.filter(p => p.requerido).map(p => p.nombre)
    return {
    name: c.nombre,
    description: c.descripcion,
    parameters: {
      type: 'OBJECT',
      properties: Object.fromEntries(c.parametros.map(p => [p.nombre, {
        type: p.tipo === 'integer' ? 'INTEGER' : 'STRING',
        description: p.descripcion,
        ...(p.enum ? { enum: p.enum } : {}),
      }])),
      // Gemini rechaza `required: []`: se omite cuando todos son opcionales.
      ...(requeridos.length ? { required: requeridos } : {}),
    },
  }})
}

type RespuestaGemini = {
  candidates?: { content?: ContenidoGemini; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
}

/** Primer modelo que respondió bien en este proceso: evita re-probar los que fallaron en cada pregunta. */
let modeloVigente: string | null = null

async function llamarGemini(apiKey: string, system: string, contents: ContenidoGemini[]): Promise<RespuestaGemini> {
  const orden = modeloVigente
    ? [modeloVigente, ...PARAMETROS.modelos.filter(m => m !== modeloVigente)]
    : [...PARAMETROS.modelos]
  let ultimoEstado = 0

  const pedir = (modelo: string, nivelRazonamiento: boolean) => fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelo)}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        tools: [{ functionDeclarations: declaraciones() }],
        generationConfig: {
          temperature: PARAMETROS.temperatura,
          maxOutputTokens: PARAMETROS.maxTokensRespuesta,
          // Serie 2.5: el razonamiento se apaga con thinkingBudget. Serie 3.x: no se puede apagar,
          // sólo bajar a "low" (menos latencia y menos cuota). Si Google rechaza el campo se reintenta sin él.
          ...(/gemini-2\.5/i.test(modelo) ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
          ...(nivelRazonamiento && /gemini-3/i.test(modelo) ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
        },
      }),
    }
  )

  for (const modelo of orden) {
    const t0 = Date.now()
    let res = await pedir(modelo, true)
    if (res.status === 400 && /gemini-3/i.test(modelo)) {
      console.error(`[agente] ${modelo} rechazó thinkingLevel (400): se reintenta sin él`, (await res.text().catch(() => '')).slice(0, 300))
      res = await pedir(modelo, false)
    }

    if (res.ok) {
      modeloVigente = modelo
      console.info(`[agente] ${modelo} respondió en ${Date.now() - t0} ms`)
      return res.json() as Promise<RespuestaGemini>
    }
    ultimoEstado = res.status
    const detalle = await res.text().catch(() => '')
    console.error(`[agente] Gemini ${modelo} respondió ${res.status} tras ${Date.now() - t0} ms`, detalle.slice(0, 200))
    // Modelo no disponible para la clave (404), cuota agotada de ESE modelo (429),
    // permiso (403) o saturación (5xx): se prueba el siguiente de la lista.
    if ([403, 404, 429, 500, 502, 503].includes(res.status)) continue
    throw new ErrorAgente('Gemini rechazó la solicitud. Revisa los registros del servidor.', 502)
  }

  if (ultimoEstado === 429) throw new ErrorAgente('Se agotó la cuota gratuita de Gemini por ahora. Intenta de nuevo en un minuto.', 429)
  if (ultimoEstado === 403) throw new ErrorAgente('Gemini no aceptó la clave. Revisa que GEMINI_API_KEY sea válida y esté habilitada.', 502)
  if (ultimoEstado === 404) throw new ErrorAgente('Ninguno de los modelos de Gemini configurados está disponible para esta clave (ver lib/agente/sistema.ts).', 502)
  throw new ErrorAgente('El servicio de IA no respondió. Intenta de nuevo.', 502)
}

export async function responderPregunta(opts: {
  mensajes: MensajeChat[]
  apiKey: string
  ctx: ContextoConsulta
  cicloActual: { inicio: string; fin: string }
}): Promise<RespuestaAgente> {
  const system = construirSystemPrompt(opts.ctx.hoyISO, opts.cicloActual)
  const contents: ContenidoGemini[] = opts.mensajes
    .slice(-PARAMETROS.maxTurnosHistorial)
    .map(m => ({ role: m.rol === 'usuario' ? 'user' : 'model', parts: [{ text: m.texto }] }))

  const herramientas: HerramientaUsada[] = []

  for (let ronda = 0; ronda <= PARAMETROS.maxRondasHerramientas; ronda++) {
    const data = await llamarGemini(opts.apiKey, system, contents)
    const candidato = data.candidates?.[0]
    if (!candidato?.content) {
      const motivo = data.promptFeedback?.blockReason
      return { respuesta: motivo ? 'No puedo responder esa consulta.' : 'No obtuve respuesta del modelo. Intenta reformular la pregunta.', herramientas }
    }

    const llamadas = candidato.content.parts.filter(p => p.functionCall)
    if (llamadas.length === 0) {
      const texto = candidato.content.parts.map(p => p.text ?? '').join('').trim()
      return { respuesta: texto || 'No obtuve respuesta del modelo. Intenta reformular la pregunta.', herramientas }
    }
    if (ronda === PARAMETROS.maxRondasHerramientas) {
      return { respuesta: 'La consulta requiere demasiados pasos. Intenta una pregunta más específica.', herramientas }
    }

    // Se reenvía el turno del modelo tal cual vino (Gemini 2.5 adjunta firmas
    // de razonamiento que hay que devolver intactas junto a la llamada).
    contents.push(candidato.content)
    const respuestas: ParteGemini[] = []
    for (const parte of llamadas) {
      const { name, args = {} } = parte.functionCall!
      const r = await ejecutarConsulta(name, args, opts.ctx)
      herramientas.push({ nombre: name, args, ok: r.ok })
      let cuerpo = JSON.stringify(r.ok ? r.datos : { error: r.error })
      if (cuerpo.length > MAX_CHARS_RESULTADO) {
        cuerpo = JSON.stringify({ advertencia: 'Resultado demasiado grande, se recortó.', parcial: cuerpo.slice(0, MAX_CHARS_RESULTADO) })
      }
      respuestas.push({ functionResponse: { name, response: { resultado: JSON.parse(cuerpo) } } })
    }
    contents.push({ role: 'user', parts: respuestas })
  }

  return { respuesta: 'No pude completar la consulta.', herramientas }
}
