import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * CORREOS DEL ASISTENTE (5-oct-2026) — el agente PROPONE, una persona ENVÍA.
 *
 * La herramienta `preparar_correo_vendedor` sólo deja un borrador en
 * `agente_correos`; el envío lo hace POST /api/agente/correos/[id] cuando el
 * administrador aprieta "Enviar" en el chat. Por qué así:
 *   · lo que el agente lee de la base (nombres, notas) es texto de terceros y
 *     no debe poder disparar un correo por sí solo;
 *   · el destinatario es SIEMPRE un usuario de la app con cartera de ventas,
 *     resuelto acá en el servidor. El modelo nunca ve ni elige una dirección
 *     (en el plan gratuito de Gemini, lo enviado puede usarse para entrenar).
 */

export interface CorreoBorrador {
  id: string
  destinatario_nombre: string
  asunto: string
  cuerpo: string
  estado: 'pendiente' | 'enviando' | 'enviado' | 'descartado' | 'error'
  error: string | null
  enviado_at: string | null
  created_at: string
}

export const LIMITES_CORREO = { asunto: 200, cuerpo: 5000, pendientesPorConversacion: 10 } as const

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

interface UsuarioVendedor { id: string; nombre: string; email: string | null; vendedores_erp: string[] | null }

/**
 * Usuario de la app que corresponde a un vendedor del ERP ("Marcelo Diaz") o a su
 * nombre en la app ("Marcelo D."). Sólo usuarios con cartera (vendedores_erp no
 * vacío) y con correo. Devuelve también las opciones si el nombre es ambiguo.
 */
export async function resolverVendedor(admin: SupabaseClient, nombre: string): Promise<
  { ok: true; usuario: { id: string; nombre: string } } | { ok: false; motivo: string; opciones?: string[] }
> {
  const { data, error } = await admin.from('users').select('id, nombre, email, vendedores_erp')
  if (error) throw new Error(error.message)
  const vendedores = ((data ?? []) as UsuarioVendedor[]).filter(u => (u.vendedores_erp ?? []).length > 0)
  const buscado = normalizar(nombre)
  if (!buscado) return { ok: false, motivo: 'Falta el nombre del vendedor.' }

  const exactos = vendedores.filter(u =>
    normalizar(u.nombre) === buscado || (u.vendedores_erp ?? []).some(v => normalizar(v) === buscado))
  const parciales = exactos.length ? exactos : vendedores.filter(u =>
    normalizar(u.nombre).includes(buscado) || (u.vendedores_erp ?? []).some(v => normalizar(v).includes(buscado)))

  if (parciales.length === 0) {
    return { ok: false, motivo: `No hay un vendedor con cartera llamado "${nombre}".`, opciones: vendedores.map(u => u.nombre) }
  }
  if (parciales.length > 1) {
    return { ok: false, motivo: `"${nombre}" coincide con varios vendedores: pregunta a cuál.`, opciones: parciales.map(u => u.nombre) }
  }
  const u = parciales[0]
  if (!u.email) return { ok: false, motivo: `${u.nombre} no tiene correo registrado en la app.` }
  return { ok: true, usuario: { id: u.id, nombre: u.nombre } }
}

/**
 * { nombre de cartera en el ERP (normalizado) → nombre del vendedor en la app }.
 * El ERP a veces trae como vendedor un correo ("nicol.delgado@…") u otra grafía:
 * así se agrupa bajo una sola persona y la dirección nunca llega al modelo.
 */
export async function nombresDeVendedores(admin: SupabaseClient): Promise<(erp: string | null) => string | null> {
  const { data, error } = await admin.from('users').select('nombre, vendedores_erp')
  if (error) throw new Error(error.message)
  const mapa = new Map<string, string>()
  for (const u of (data ?? []) as Pick<UsuarioVendedor, 'nombre' | 'vendedores_erp'>[]) {
    for (const v of u.vendedores_erp ?? []) mapa.set(normalizar(v), u.nombre)
  }
  return erp => {
    if (!erp) return null
    return mapa.get(normalizar(erp)) ?? (erp.includes('@') ? 'Vendedor sin nombre' : erp)
  }
}

/** Borradores de una conversación (los del usuario que la abrió), del más viejo al más nuevo. */
export async function correosDeConversacion(admin: SupabaseClient, conversacionId: string, usuarioId: string): Promise<CorreoBorrador[]> {
  const { data } = await admin
    .from('agente_correos')
    .select('id, destinatario_nombre, asunto, cuerpo, estado, error, enviado_at, created_at')
    .eq('conversacion_id', conversacionId)
    .eq('creado_por', usuarioId)
    .order('created_at', { ascending: true })
  return (data ?? []) as CorreoBorrador[]
}

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** HTML sobrio (texto plano con saltos de línea): el cuerpo lo escribió el agente y lo revisó una persona; nunca se interpreta como HTML. */
export function htmlCorreo(cuerpo: string, remitente: string): string {
  const parrafos = escapar(cuerpo).split(/\n{2,}/).map(p => `<p style="margin:0 0 14px;">${p.replace(/\n/g, '<br>')}</p>`).join('')
  return `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px 16px;background:#F5F2EC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#1C1915;">
  <div style="max-width:580px;margin:0 auto;background:#FFFFFF;border:1px solid #E7E1D5;border-radius:14px;padding:24px 28px;font-size:14.5px;line-height:1.6;">
    ${parrafos}
    <p style="margin:18px 0 0;padding-top:14px;border-top:1px solid #E7E1D5;font-size:12px;color:#6B6457;">
      Enviado por ${escapar(remitente)} desde El Regreso Control.
    </p>
  </div>
</body></html>`
}
