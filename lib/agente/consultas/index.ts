import type { Consulta, ContextoConsulta } from './_base'
import { comprasCliente, topClientes, ventasResumen } from './ventas'
import { frecuenciaCompraCliente, clientesInactivos } from './habitos'
import { buscarCliente, deudaClientes, comportamientoPagoCliente, cobrosResumen } from './cartera'
import { consultarSql, describirEsquema } from './sql'
import { recordar } from './memoria'
import { stockActual } from './stock'
import { mapaDatos } from './mapa'
import { clientesProximosAPedir, prepararCorreoVendedor } from './correos'
import { pedidoSugeridoCliente, cobranzaVendedor, clientesVolumenBaja, ventaCruzada, avanceMetas, barrilesEnClientes, quiebreStock } from './comercial'
import { prepararTareaVendedor, gestionarAviso } from './acciones'
import { HERRAMIENTAS_VENDEDOR } from '../alcance'

/**
 * CATÁLOGO DE CONSULTAS DEL AGENTE — acá se "entrena".
 *
 * Para enseñarle algo nuevo: crear una `Consulta` (nombre, descripción clara de
 * cuándo usarla, parámetros, y una lectura de Supabase) y agregarla a esta
 * lista. Las herramientas específicas aplican los criterios del negocio (ingreso
 * real, neto, cuentas internas) y se prefieren sobre `consultar_sql`, que lee
 * libremente pero siempre con un rol de solo lectura dentro de la base.
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
  clientesProximosAPedir,
  // Comerciales (5-oct-2026): cartera de cada vendedor (lib/agente/consultas/comercial.ts).
  pedidoSugeridoCliente,
  cobranzaVendedor,
  clientesVolumenBaja,
  ventaCruzada,
  avanceMetas,
  barrilesEnClientes,
  quiebreStock,
  // Acciones: sólo dejan un BORRADOR; ejecutarlas lo decide una persona en el chat (lib/agente/correos.ts, acciones.ts).
  prepararCorreoVendedor,
  prepararTareaVendedor,
  gestionarAviso,
  // Lectura libre (rol de solo lectura en la base) para lo que las de arriba no cubren, y memoria de largo plazo.
  // mapa_datos primero: orienta sin tocar la base (lib/agente/mapa.ts).
  mapaDatos,
  describirEsquema,
  consultarSql,
  recordar,
]

export async function ejecutarConsulta(
  nombre: string, args: Record<string, unknown>, ctx: ContextoConsulta
): Promise<{ ok: true; datos: unknown } | { ok: false; error: string }> {
  const consulta = CONSULTAS.find(c => c.nombre === nombre)
  if (!consulta) return { ok: false, error: `La consulta "${nombre}" no existe.` }
  // Modo vendedor: aunque el modelo invente una llamada, sólo corren las de su cartera.
  if (ctx.alcance && !HERRAMIENTAS_VENDEDOR.has(nombre)) return { ok: false, error: 'Esa consulta no está disponible para tu usuario.' }
  try {
    return { ok: true, datos: await consulta.ejecutar(args ?? {}, ctx) }
  } catch (e) {
    // Los errores de red/WAF pueden traer HTML entero: nunca se le pasa eso al modelo.
    const msg = e instanceof Error ? e.message : ''
    console.error(`[agente] consulta ${nombre} falló:`, msg.slice(0, 300))
    return { ok: false, error: msg && msg.length < 200 && !msg.trimStart().startsWith('<') ? msg : 'Error al consultar la base de datos.' }
  }
}
