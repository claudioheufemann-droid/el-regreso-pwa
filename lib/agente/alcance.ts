/**
 * ALCANCE DEL ASISTENTE (5-oct-2026): admins ven todo; un vendedor sólo su cartera.
 *
 * El control es del servidor, nunca del modelo:
 *   · el route decide el modo con getServerUser() (isAdmin / vendedoresErp);
 *   · en modo vendedor el modelo SÓLO recibe las herramientas de HERRAMIENTAS_VENDEDOR
 *     (sin SQL libre, sin explorar tablas, sin memoria global, sin acciones), y
 *     ejecutarConsulta rechaza cualquier otra;
 *   · cada una de esas herramientas filtra por la cartera del vendedor con
 *     `filtroVendedor`, ignorando el parámetro `vendedor` que mande el modelo.
 */
import type { ContextoConsulta } from './consultas/_base'

/**
 * Quién puede usar el asistente y con qué alcance (única regla, la usan todas las rutas):
 *   · 'completo': admins y usuarios con users.puede_usar_asistente (acceso al chat como un
 *     admin, sin serlo en el resto de la app);
 *   · 'vendedor': vendedores con cartera en el ERP (sólo sus clientes);
 *   · null: sin acceso.
 */
export function accesoAsistente(user: { isAdmin: boolean; puedeUsarAsistente?: boolean; vendedoresErp: string[] } | null): 'completo' | 'vendedor' | null {
  if (!user) return null
  if (user.isAdmin || user.puedeUsarAsistente) return 'completo'
  if (user.vendedoresErp.length > 0) return 'vendedor'
  return null
}

export const HERRAMIENTAS_VENDEDOR = new Set([
  'clientes_proximos_a_pedir',
  'pedido_sugerido_cliente',
  'cobranza_vendedor',
  'clientes_volumen_baja',
  'venta_cruzada',
  'avance_metas',
  'barriles_en_clientes',
  'stock_actual',
  'quiebre_stock',
])

const normalizar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

/**
 * Predicado de cartera para una fila. `erp` = vendedor tal como viene en la base
 * (vendedor_actual), `app` = su nombre en la app ya resuelto (si lo hay).
 *   · modo vendedor: sólo su cartera (por nombre exacto del ERP);
 *   · admin con `vendedor` pedido: coincidencia parcial con cualquiera de los dos nombres;
 *   · admin sin filtro: todo.
 */
export function filtroVendedor(ctx: ContextoConsulta, pedido: string | null): (erp: string | null, app?: string | null) => boolean {
  if (ctx.alcance) {
    const propios = new Set(ctx.alcance.vendedoresErp.map(normalizar))
    return erp => !!erp && propios.has(normalizar(erp))
  }
  if (!pedido) return () => true
  const p = normalizar(pedido)
  return (erp, app) => (!!erp && normalizar(erp).includes(p)) || (!!app && normalizar(app).includes(p))
}

/** Nota para el modelo cuando responde en modo vendedor. */
export const notaAlcance = (ctx: ContextoConsulta) =>
  ctx.alcance ? { alcance: `Sólo la cartera de ${ctx.alcance.nombre}.` } : {}
