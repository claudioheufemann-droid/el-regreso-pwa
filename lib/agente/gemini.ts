import { CONSULTAS, ejecutarConsulta } from './consultas'
import type { ContextoConsulta } from './consultas/_base'
import { PARAMETROS, construirSystemPrompt } from './sistema'
import { HERRAMIENTAS_VENDEDOR } from './alcance'

export interface MensajeChat {
  rol: 'usuario' | 'agente'
  texto: string
}

export interface HerramientaUsada {
  nombre: string
  args: Record<string, unknown>
  ok: boolean
}

export interface UsoTokens {
  entrada: number
  salida: number
  /** Parte de la entrada que Gemini reutilizó de su caché implícita (se factura más barato). */
  cacheados: number
  rondas: number
  modelo: string | null
}

export interface RespuestaAgente {
  respuesta: string
  herramientas: HerramientaUsada[]
  uso: UsoTokens
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

interface MetaUso { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; cachedContentTokenCount?: number }
type RespuestaGemini = {
  candidates?: { content?: ContenidoGemini; finishReason?: string }[]
  promptFeedback?: { blockReason?: string }
  usageMetadata?: MetaUso
}

const MAX_CHARS_RESULTADO = 20_000

/** Declaraciones de herramientas: idénticas en cada llamada (parte del prefijo que Gemini puede cachear). En modo vendedor, sólo las de su cartera. */
function declaraciones(modoVendedor: boolean) {
  return CONSULTAS.filter(c => !modoVendedor || HERRAMIENTAS_VENDEDOR.has(c.nombre)).map(c => {
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
    }
  })
}

/** Primer modelo que respondió bien en este proceso: evita re-probar los que fallaron en cada pregunta. */
let modeloVigente: string | null = null

async function llamarGemini(
  apiKey: string, system: string, contents: ContenidoGemini[],
  opciones: { herramientas: boolean; maxTokens: number; modoVendedor?: boolean }
): Promise<{ data: RespuestaGemini; modelo: string }> {
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
        ...(opciones.herramientas ? { tools: [{ functionDeclarations: declaraciones(!!opciones.modoVendedor) }] } : {}),
        generationConfig: {
          temperature: PARAMETROS.temperatura,
          maxOutputTokens: opciones.maxTokens,
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
      return { data: await res.json() as RespuestaGemini, modelo }
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

/** Une mensajes seguidos del mismo rol y descarta un arranque de 'agente': Gemini espera turnos alternados que empiecen por el usuario. */
function normalizar(mensajes: MensajeChat[]): ContenidoGemini[] {
  const salida: ContenidoGemini[] = []
  for (const m of mensajes) {
    const role = m.rol === 'usuario' ? 'user' : 'model'
    if (salida.length === 0 && role === 'model') continue
    const ultimo = salida[salida.length - 1]
    if (ultimo && ultimo.role === role) ultimo.parts[0].text = `${ultimo.parts[0].text}\n${m.texto}`
    else salida.push({ role, parts: [{ text: m.texto }] })
  }
  return salida
}

function sumarUso(acc: UsoTokens, meta: MetaUso | undefined, modelo: string) {
  acc.entrada += meta?.promptTokenCount ?? 0
  acc.cacheados += meta?.cachedContentTokenCount ?? 0
  // El razonamiento se factura como salida aunque no se vea en la respuesta.
  acc.salida += (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0)
  acc.modelo = modelo
}

export async function responderPregunta(opts: {
  /** Mensajes recientes ya guardados (sin incluir la pregunta actual). */
  historial: MensajeChat[]
  pregunta: string
  /** Fecha, usuario, memoria y resumen: ver construirContexto(). Va como primer mensaje, no en el system prompt. */
  contexto: string
  apiKey: string
  ctx: ContextoConsulta
}): Promise<RespuestaAgente> {
  const system = construirSystemPrompt()
  const contents: ContenidoGemini[] = [
    { role: 'user', parts: [{ text: opts.contexto }] },
    { role: 'model', parts: [{ text: 'Contexto recibido.' }] },
    ...normalizar([...opts.historial, { rol: 'usuario', texto: opts.pregunta }]),
  ]

  const herramientas: HerramientaUsada[] = []
  const uso: UsoTokens = { entrada: 0, salida: 0, cacheados: 0, rondas: 0, modelo: null }
  const devolver = (respuesta: string): RespuestaAgente => ({ respuesta, herramientas, uso })

  for (let ronda = 0; ronda <= PARAMETROS.maxRondasHerramientas; ronda++) {
    const { data, modelo } = await llamarGemini(opts.apiKey, system, contents, { herramientas: true, maxTokens: PARAMETROS.maxTokensRespuesta, modoVendedor: !!opts.ctx.alcance })
    sumarUso(uso, data.usageMetadata, modelo)
    uso.rondas = ronda + 1

    const candidato = data.candidates?.[0]
    if (!candidato?.content) {
      const motivo = data.promptFeedback?.blockReason
      return devolver(motivo ? 'No puedo responder esa consulta.' : 'No obtuve respuesta del modelo. Intenta reformular la pregunta.')
    }

    const llamadas = candidato.content.parts.filter(p => p.functionCall)
    if (llamadas.length === 0) {
      const texto = candidato.content.parts.map(p => p.text ?? '').join('').trim()
      return devolver(texto || 'No obtuve respuesta del modelo. Intenta reformular la pregunta.')
    }
    if (ronda === PARAMETROS.maxRondasHerramientas) {
      return devolver('La consulta requiere demasiados pasos. Intenta una pregunta más específica.')
    }

    // Se reenvía el turno del modelo tal cual vino (Gemini adjunta firmas de
    // razonamiento que hay que devolver intactas junto a la llamada).
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

  return devolver('No pude completar la consulta.')
}

/** Genera texto sin herramientas (usado para resumir conversaciones). */
export async function generarTexto(apiKey: string, instruccion: string, contenido: string): Promise<{ texto: string; uso: UsoTokens }> {
  const uso: UsoTokens = { entrada: 0, salida: 0, cacheados: 0, rondas: 1, modelo: null }
  const { data, modelo } = await llamarGemini(
    apiKey, instruccion, [{ role: 'user', parts: [{ text: contenido }] }], { herramientas: false, maxTokens: 2048 }
  )
  sumarUso(uso, data.usageMetadata, modelo)
  const texto = (data.candidates?.[0]?.content?.parts ?? []).map(p => p.text ?? '').join('').trim()
  return { texto, uso }
}
