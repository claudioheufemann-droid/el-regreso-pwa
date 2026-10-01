import type { SupabaseClient } from '@supabase/supabase-js'
import { generarTexto, type MensajeChat, type UsoTokens } from './gemini'
import { PARAMETROS, type MemoriaContexto } from './sistema'

/**
 * Memoria del asistente, toda en Supabase (tablas agente_*):
 *
 *  · Conversaciones persistentes: el servidor guarda cada mensaje y reconstruye
 *    el contexto desde la base. El navegador ya no reenvía el historial entero
 *    (menos tokens, y la conversación sobrevive a recargas y a otros equipos).
 *  · Resumen acumulado: al pasar `umbralResumen` mensajes sin resumir, los viejos
 *    se condensan en `resumen` y sólo viajan los últimos; el texto completo queda
 *    guardado en agente_mensajes.
 *  · Memoria de largo plazo (agente_memoria): reglas, alias y preferencias que
 *    valen para conversaciones futuras. Sólo entra al contexto lo ACTIVO y lo
 *    relevante a la pregunta; lo que propone el agente queda pendiente de un admin.
 */

export interface Conversacion {
  id: string
  titulo: string | null
  resumen: string | null
  mensajes_resumidos: number
  tokens_entrada: number
  tokens_salida: number
}

export interface MensajeGuardado extends MensajeChat {
  id: number
  herramientas: string[]
  error: boolean
}

const COLUMNAS_CONV = 'id, titulo, resumen, mensajes_resumidos, tokens_entrada, tokens_salida'
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_HISTORIAL_CHARS = 1000

export const esUuid = (v: unknown): v is string => typeof v === 'string' && RE_UUID.test(v)

export async function obtenerConversacion(admin: SupabaseClient, usuarioId: string, id: string): Promise<Conversacion | null> {
  if (!esUuid(id)) return null
  const { data } = await admin.from('agente_conversaciones').select(COLUMNAS_CONV)
    .eq('id', id).eq('usuario_id', usuarioId).eq('archivada', false).maybeSingle()
  return (data as Conversacion | null) ?? null
}

export async function conversacionMasReciente(admin: SupabaseClient, usuarioId: string): Promise<Conversacion | null> {
  const { data } = await admin.from('agente_conversaciones').select(COLUMNAS_CONV)
    .eq('usuario_id', usuarioId).eq('archivada', false).order('updated_at', { ascending: false }).limit(1).maybeSingle()
  return (data as Conversacion | null) ?? null
}

export async function crearConversacion(admin: SupabaseClient, usuarioId: string, primeraPregunta: string): Promise<Conversacion> {
  const { data, error } = await admin.from('agente_conversaciones')
    .insert({ usuario_id: usuarioId, titulo: primeraPregunta.slice(0, 60) }).select(COLUMNAS_CONV).single()
  if (error || !data) throw new Error('No se pudo crear la conversación.')
  return data as Conversacion
}

export async function archivarConversacion(admin: SupabaseClient, usuarioId: string, id: string): Promise<void> {
  if (!esUuid(id)) return
  await admin.from('agente_conversaciones').update({ archivada: true }).eq('id', id).eq('usuario_id', usuarioId)
}

async function todosLosMensajes(admin: SupabaseClient, conversacionId: string): Promise<MensajeGuardado[]> {
  const { data } = await admin.from('agente_mensajes').select('id, rol, texto, herramientas, error')
    .eq('conversacion_id', conversacionId).order('id', { ascending: true }).limit(2000)
  return (data ?? []) as MensajeGuardado[]
}

/** Para mostrar la conversación en pantalla (los últimos mensajes, con su detalle de herramientas). */
export async function mensajesParaMostrar(admin: SupabaseClient, conversacionId: string, limite = 60): Promise<MensajeGuardado[]> {
  const { data } = await admin.from('agente_mensajes').select('id, rol, texto, herramientas, error')
    .eq('conversacion_id', conversacionId).order('id', { ascending: false }).limit(limite)
  return ((data ?? []) as MensajeGuardado[]).reverse()
}

/** Mensajes que todavía NO cubre el resumen: es lo que viaja literal al modelo (los errores no). */
export async function historialSinResumir(admin: SupabaseClient, conv: Conversacion): Promise<MensajeChat[]> {
  const { data } = await admin.from('agente_mensajes').select('rol, texto, error')
    .eq('conversacion_id', conv.id).order('id', { ascending: true })
    .range(conv.mensajes_resumidos, conv.mensajes_resumidos + 200)
  return ((data ?? []) as { rol: 'usuario' | 'agente'; texto: string; error: boolean }[])
    .filter(m => !m.error)
    .map(m => ({ rol: m.rol, texto: m.texto.length > MAX_HISTORIAL_CHARS ? `${m.texto.slice(0, MAX_HISTORIAL_CHARS)}…` : m.texto }))
}

export async function guardarMensaje(
  admin: SupabaseClient, conversacionId: string,
  m: { rol: 'usuario' | 'agente'; texto: string; herramientas?: string[]; error?: boolean }
): Promise<void> {
  await admin.from('agente_mensajes').insert({
    conversacion_id: conversacionId, rol: m.rol, texto: m.texto, herramientas: m.herramientas ?? [], error: m.error ?? false,
  })
}

export async function sumarTokensConversacion(admin: SupabaseClient, conv: Conversacion, uso: UsoTokens): Promise<void> {
  await admin.from('agente_conversaciones').update({
    tokens_entrada: conv.tokens_entrada + uso.entrada,
    tokens_salida: conv.tokens_salida + uso.salida,
    updated_at: new Date().toISOString(),
  }).eq('id', conv.id)
}

/* ── Memoria de largo plazo ─────────────────────────────────────────────── */

/** Palabras de la pregunta convertidas a una consulta OR de texto completo (en español, con raíces). */
function terminosDeBusqueda(pregunta: string): string {
  const palabras = pregunta.toLowerCase().normalize('NFC').match(/[a-záéíóúñü0-9]{4,}/g) ?? []
  return [...new Set(palabras)].slice(0, 8).join(' | ')
}

/**
 * Qué memoria entra al contexto de ESTA pregunta: las reglas activas (siempre,
 * son pocas y valen para todo) más las demás activas que coincidan con las
 * palabras de la pregunta. Tope PARAMETROS.maxMemoriasContexto: la memoria
 * puede crecer sin que crezca el costo por pregunta.
 */
export async function memoriasParaContexto(admin: SupabaseClient, usuarioId: string, pregunta: string): Promise<MemoriaContexto[]> {
  if (!esUuid(usuarioId)) return []
  const alcance = `ambito.eq.global,usuario_id.eq.${usuarioId}`
  const maximo = PARAMETROS.maxMemoriasContexto

  const { data: reglas } = await admin.from('agente_memoria').select('id, tipo, ambito, contenido')
    .eq('estado', 'activa').eq('tipo', 'regla').or(alcance).order('created_at', { ascending: true }).limit(maximo - 3)

  const resultado = [...(reglas ?? [])] as (MemoriaContexto & { id: number })[]
  const terminos = terminosDeBusqueda(pregunta)
  if (terminos) {
    const { data: relevantes } = await admin.from('agente_memoria').select('id, tipo, ambito, contenido')
      .eq('estado', 'activa').neq('tipo', 'regla').or(alcance)
      .textSearch('busqueda', terminos, { config: 'spanish' }).limit(maximo - resultado.length)
    resultado.push(...((relevantes ?? []) as (MemoriaContexto & { id: number })[]))
  }
  if (resultado.length > 0) {
    await admin.from('agente_memoria').update({ ultimo_uso: new Date().toISOString() }).in('id', resultado.map(r => r.id))
  }
  return resultado.map(({ tipo, ambito, contenido }) => ({ tipo, ambito, contenido }))
}

/* ── Resumen de lo viejo ────────────────────────────────────────────────── */

const INSTRUCCION_RESUMEN =
  'Resumes conversaciones entre un administrador y un asistente de datos de una cervecería. Conserva SOLO lo útil para continuar la conversación: ' +
  'clientes y períodos consultados, cifras clave con su unidad, conclusiones, aclaraciones del usuario y preferencias. ' +
  'Máximo 180 palabras, en español, en frases cortas, sin saludos ni relleno. Si hay un resumen previo, intégralo en uno solo.'

/**
 * Condensa los mensajes viejos cuando se acumulan demasiados sin resumir.
 * Se ejecuta DESPUÉS de responder (after()) para no sumar espera a esa pregunta.
 * Si falla, no pasa nada: el historial completo sigue en la base y la próxima
 * pregunta lo vuelve a intentar.
 */
export async function resumirSiHaceFalta(admin: SupabaseClient, apiKey: string, conversacionId: string): Promise<UsoTokens | null> {
  const { data: conv } = await admin.from('agente_conversaciones').select(COLUMNAS_CONV).eq('id', conversacionId).maybeSingle()
  if (!conv) return null
  const c = conv as Conversacion

  const todos = await todosLosMensajes(admin, conversacionId)
  if (todos.length - c.mensajes_resumidos <= PARAMETROS.umbralResumen) return null

  const corte = todos.length - PARAMETROS.mensajesTrasResumir
  const viejos = todos.slice(c.mensajes_resumidos, corte).filter(m => !m.error)
  if (viejos.length === 0) return null

  const contenido = [
    c.resumen ? `RESUMEN PREVIO:\n${c.resumen}` : '',
    'MENSAJES A INTEGRAR:',
    ...viejos.map(m => `${m.rol === 'usuario' ? 'Usuario' : 'Asistente'}: ${m.texto.slice(0, 1500)}`),
  ].filter(Boolean).join('\n')

  try {
    const { texto, uso } = await generarTexto(apiKey, INSTRUCCION_RESUMEN, contenido)
    if (!texto) return null
    await admin.from('agente_conversaciones').update({
      resumen: texto,
      mensajes_resumidos: corte,
      tokens_entrada: c.tokens_entrada + uso.entrada,
      tokens_salida: c.tokens_salida + uso.salida,
    }).eq('id', conversacionId)
    return uso
  } catch (e) {
    console.error('[agente] no se pudo resumir la conversación', e instanceof Error ? e.message : e)
    return null
  }
}
