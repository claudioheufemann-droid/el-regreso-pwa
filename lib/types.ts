// Token interno/canónico — coincide con valores reales en la BD (no tocar:
// se usa como scope de queries `.in('vendedor_actual', VENDEDORES)`).
export type Vendedor = 'Vendedor 1'

export const VENDEDORES: Vendedor[] = ['Vendedor 1']

// Histórico consolidado en BD. Las ventas pasadas se relabelaron a
// 'Equipo Ventas' (Javier/Carlos ya no trabajan acá — datos despersonalizados).
export const VENDEDORES_DB = ['Equipo Ventas'] as const

// ─── GRUPOS DE VENDEDORES ────────────────────────────────────────────────────
// Fuente única de verdad para la organización de vendedores.
// Cada clave es el NOMBRE DE DISPLAY en la app.
// Cada valor es la lista de nombres que pueden aparecer en ventas.vendedor_actual.
//
// Para activar un vendedor regional: agregar su nombre real al array de la región.
// Ejemplo cuando llegue la persona de RM:
//   'R. Metropolitana': ['Región Metropolitana', 'Juan Pérez']
//
export const VENDEDOR_GRUPOS: Record<string, string[]> = {
  // histórico despersonalizado + ex-vendedores + cuentas internas/admin que
  // quedaron como dueños de algunos clientes en la BD (clientes.vendedor).
  // 'Transición 1' y 'Transición 2': nombres que el ERP empezó a usar (jul 2026)
  // para la cartera de Valdivia tras la salida de Javier/Carlos — van al mismo
  // grupo para no cortar las series históricas.
  'Equipo Ventas':     ['Equipo Ventas', 'Vendedor 1', 'Javier Badilla', 'Carlos Urrejola', 'Transición 1', 'Transición 2', 'Claudio Heufemann', 'Douglas Koenig', 'Mariel Lillo', 'Rodrigo Solis', 'Benja Alarcón', 'CERVECERÍA'],
  'OnLine':            ['OnLine'],
  // Yadro va con las dos grafías a propósito: la BD las tiene inconsistentes
  // (users → 'Favijancic' con v, clientes.vendedor → 'Fabijancic' con b) y no
  // sabemos cuál usará el ERP cuando empiece a reportar sus ventas.
  'R. Metropolitana':  ['Región Metropolitana', 'Yadro Fabijancic', 'Yadro Favijancic'],
  'R. Araucanía':      ['Región de la Araucanía', 'Marcelo Diaz'],
  'R. de los Ríos':    ['Región de los Ríos'],
  'R. de los Lagos':   ['Región de los Lagos'],
}

// Mapeo BD → display (derivado de VENDEDOR_GRUPOS — no editar manualmente)
export const VENDEDOR_DISPLAY: Record<string, string> = Object.entries(VENDEDOR_GRUPOS)
  .flatMap(([display, dbNames]) => dbNames.map(n => [n, display] as [string, string]))
  .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {} as Record<string, string>)

/**
 * Alias de una MISMA cartera cuando el ERP renombra a quien la lleva.
 * Distinto de VENDEDOR_GRUPOS: eso agrupa por región/equipo (varias personas),
 * esto unifica nombres que son la misma cartera a lo largo del tiempo.
 *
 * Se usa en el ranking por vendedor: sin esto, tras un renombre la misma
 * cartera aparece dos veces (las ventas viejas quedan bajo el nombre anterior
 * porque el ERP ya no las reporta con el nuevo).
 *
 * clave = nombre viejo en `ventas.vendedor_actual` → valor = nombre vigente.
 */
export const VENDEDOR_ALIAS: Record<string, string> = {
  // Cartera de Los Ríos / Los Lagos: el ERP la ha renombrado varias veces
  // (Javier Badilla → 'Transición 2' → 'Los Rios' sin tilde → ahora la
  // atiende Nicole Delgado, que el ERP reporta con su email). Carlos
  // Urrejola → 'Transición 1' → 'Los Lagos' → ahora la atiende Marion Meza.
  // Dato de Claudio, 2026-08-21: unificar Los Ríos bajo "Nicole Delgado" y
  // renombrar Los Lagos a "Marion Meza" (nuevas vendedoras a cargo).
  // TODOS los nombres que el ERP haya usado para esta misma cartera se
  // mapean al nombre limpio final, para que no vuelva a aparecer partida en
  // el ranking la próxima vez que el ERP la vuelva a renombrar.
  'Javier Badilla':              'Nicole Delgado',
  'Transición 2':                'Nicole Delgado',
  'Los Rios':                    'Nicole Delgado', // el ERP lo reporta sin tilde
  'Los Ríos':                    'Nicole Delgado', // nombre anterior de esta cartera
  'nicol.delgado@elregresobeer.com': 'Nicole Delgado',
  'Carlos Urrejola':             'Marion Meza',
  'Transición 1':                'Marion Meza',
  'Los Lagos':                   'Marion Meza', // nombre anterior de esta cartera
  // Yadro: la BD tiene dos grafías del apellido; se unifica a la del ERP
  'Yadro Favijancic': 'Yadro Fabijancic',
}

/** Nombre vigente de un vendedor, resolviendo alias por renombre. */
export function vendedorCanonico(nombre: string | null | undefined): string {
  if (!nombre) return ''
  return VENDEDOR_ALIAS[nombre] ?? nombre
}

/** Inverso de vendedorCanonico: dado el nombre vigente (ej. "Los Ríos"),
 *  devuelve TODOS los nombres crudos del ERP que resuelven a él (incluido
 *  el propio nombre vigente, porque puede aparecer tal cual en la BD).
 *  Se usa para filtrar `ventas.vendedor_actual` por el vendedor/región que
 *  se ve en el ranking, sin perder ventas históricas bajo un nombre viejo. */
export function nombresErpDe(vigente: string): string[] {
  const raws = Object.entries(VENDEDOR_ALIAS).filter(([, v]) => v === vigente).map(([k]) => k)
  return [...new Set([vigente, ...raws])]
}

// Scope completo: todos los nombres de BD aceptados en consultas y reportes
export const VENDEDORES_SCOPE: string[] = Object.values(VENDEDOR_GRUPOS).flat()

export const CATEGORIAS_NEGOCIO = [
  'Bar',
  'Minimarket',
  'Cafetería',
  'Botillería',
  'Almacén',
  'Restaurante',
  'Supermercado',
  'Distribuidor',
  'Actividades Turísticas',
  'Cliente Directo',
  'Otros',
] as const

/**
 * Lista maestra de clientes internos a excluir de todas las vistas y cálculos.
 * FUENTE ÚNICA DE VERDAD — no duplicar en otros archivos.
 *
 * Comparación: siempre case-insensitive con esClienteExcluido().
 * Todos los strings están en minúscula para evitar variantes.
 */
export const CLIENTES_EXCLUIR = [
  // Movimientos de personal de ventas. Prefijo abierto a propósito: antes había
  // una entrada por persona (javier/charly/carlos) y al aparecer '(Benja)' se
  // colaba como venta real. Así cubre a cualquiera sin tener que editar la lista.
  'cliente ventas (',
  // PDV y mermas
  'cliente pdv',
  'cliente merma pdv',
  'cliente mermas producto terminado',
  // Muestras por vendedor ('Cliente muestras Marcelo' y futuras variantes)
  'cliente muestras',
  // Consumo interno / marketing / calidad
  'cliente feria',
  'cliente marketing',
  'cliente calidad reclamos',
  'cliente control calidad',
  'cliente copas/medallas',
  'basecamp el regreso',
  'cliente consumos base camp',
  'cliente metas base camp',
  'cliente douglas koenig',
  'beneficios clientes',
  // Servicio de enlatado/co-packing a terceros (Niebla Fermentos SPA) — no es venta de cerveza propia
  'ewu ginger beer',
]

/**
 * Retorna true si el nombre de cliente es interno (debe excluirse de ventas reales).
 * Usa comparación case-insensitive con cada entrada de CLIENTES_EXCLUIR.
 * Usa includes() en vez de === para capturar variantes de escritura.
 */
export function esClienteExcluido(nombre: string | null | undefined): boolean {
  if (!nombre) return false
  const n = nombre.toLowerCase().trim()
  return CLIENTES_EXCLUIR.some(ex => n.includes(ex))
}

/**
 * Subconjunto de CLIENTES_EXCLUIR que además de excluirse de los reportes de
 * venta real, ni siquiera se GUARDA en `ventas` al cargar un archivo del ERP.
 *
 * PDV, Feria y BaseCamp se sacaron de esta lista a pedido del usuario: siguen
 * sin contar como "litros vendidos" (siguen en CLIENTES_EXCLUIR, que es lo
 * que usan las funciones SQL del dashboard), pero ahora sí se guardan para
 * poder mostrarlos aparte en su propia tarjeta. El resto (marketing, muestras,
 * mermas, calidad, copas/medallas, Douglas Koenig, beneficios) sigue sin
 * guardarse: es ruido operativo sin volumen que valga la pena visualizar.
 */
const CLIENTES_NO_GUARDAR = CLIENTES_EXCLUIR.filter(ex =>
  !['cliente pdv', 'cliente feria', 'basecamp el regreso', 'cliente consumos base camp', 'cliente metas base camp'].includes(ex)
)

export function esClienteNoGuardar(nombre: string | null | undefined): boolean {
  if (!nombre) return false
  const n = nombre.toLowerCase().trim()
  return CLIENTES_NO_GUARDAR.some(ex => n.includes(ex))
}

/** Alias para compatibilidad con código existente */
export const esInterno = esClienteExcluido

export interface Venta {
  id: number
  fecha_pedido: string
  vendedor_actual: string
  nombre_fantasia: string | null
  categoria_producto: string | null
  categoria_negocio: string | null
  producto: string | null
  envase: string | null
  litros: number
  total_sin_impuesto: number
  pedido: string | null
  tipo_venta: string | null
  localidad: string | null
  provincia: string | null
}

export interface Periodo {
  id: number
  nombre: string
  fecha_inicio: string
  fecha_fin: string
  activo: boolean
}

export interface Meta {
  id: number
  periodo_id: number
  vendedor: string
  tipo: 'mensual' | 'semanal'
  semana_numero: number | null
  fecha_inicio: string
  fecha_fin: string
  categoria_negocio: string
  meta_litros: number
}

export interface ResumenVendedor {
  vendedor: string
  litros_hoy: number
  litros_periodo: number
  clientes_hoy: string[]
  por_categoria: { categoria: string; litros: number }[]
}

export interface MetaSemana {
  id: number
  periodo_id: number | null
  vendedor: string
  tipo: 'mensual' | 'semanal'
  semana_numero: number | null
  fecha_inicio: string
  fecha_fin: string
  categoria_negocio: string
  meta_litros: number
}
