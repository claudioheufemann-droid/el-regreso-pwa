import type { Consulta, ContextoConsulta } from './_base'
import { comprasCliente, topClientes, ventasResumen } from './ventas'
import { frecuenciaCompraCliente, clientesInactivos } from './habitos'
import { buscarCliente, deudaClientes, comportamientoPagoCliente, cobrosResumen } from './cartera'
import { describirTablas, explorarTabla } from './explorar'
import { stockActual } from './stock'

/**
 * CATÁLOGO DE CONSULTAS DEL AGENTE — acá se "entrena".
 *
 * Para enseñarle algo nuevo: crear una `Consulta` (nombre, descripción clara de
 * cuándo usarla, parámetros, y una lectura de Supabase) y agregarla a esta
 * lista. El agente nunca ejecuta SQL libre: sólo lo que está en este catálogo.
 * Ver lib/agente/README.md.
 */
export const CONSULTAS: Consulta[] = [
  buscarCliente,
  comprasCliente,
  topClientes,
  frecuenciaCompraCliente,
  clientesInactivos,
  ventasResumen,
  deudaClientes,
  comportamientoPagoCliente,
  cobrosResumen,
  stockActual,
  // Exploración controlada: para lo que las consultas de arriba no cubren.
  describirTablas,
  explorarTabla,
]

export async function ejecutarConsulta(
  nombre: string, args: Record<string, unknown>, ctx: ContextoConsulta
): Promise<{ ok: true; datos: unknown } | { ok: false; error: string }> {
  const consulta = CONSULTAS.find(c => c.nombre === nombre)
  if (!consulta) return { ok: false, error: `La consulta "${nombre}" no existe.` }
  try {
    return { ok: true, datos: await consulta.ejecutar(args ?? {}, ctx) }
  } catch (e) {
    // Los errores de red/WAF pueden traer HTML entero: nunca se le pasa eso al modelo.
    const msg = e instanceof Error ? e.message : ''
    console.error(`[agente] consulta ${nombre} falló:`, msg.slice(0, 300))
    return { ok: false, error: msg && msg.length < 200 && !msg.trimStart().startsWith('<') ? msg : 'Error al consultar la base de datos.' }
  }
}
