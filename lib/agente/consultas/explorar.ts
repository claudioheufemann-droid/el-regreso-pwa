import { type Consulta, enLotes, entero, redondear, sumarDiasISO, terminoSeguro, texto } from './_base'

/**
 * "Navegar" Supabase de forma controlada. El agente no escribe SQL: elige una
 * tabla de esta lista blanca, columnas de esa tabla y filtros validados.
 *
 * Lo que NO está acá es a propósito: users, push_subscriptions, notificaciones,
 * costos/márgenes (costos_*, simulaciones_rentabilidad), tablas de respaldo
 * (_backup_*) y datos personales de contacto (rut, teléfono, email, dirección).
 * Todo lo que se devuelve termina en los servidores de Google (ver README), así
 * que se prefiere no mandar lo que no hace falta para responder preguntas
 * comerciales. Para sumar tablas nuevas: agregarlas a TABLAS con sus columnas.
 */
interface TablaPermitida {
  descripcion: string
  columnas: string[]
  numericas: string[]
  fechas: string[]
  booleanas?: string[]
  /** Si la tabla es grande, exige un filtro de fecha sobre esta columna (se aplica uno por defecto si falta). */
  fechaObligatoria?: string
  orden: string
  /** Orden único para paginar la suma sin repetir ni saltarse filas (por defecto `id`). */
  desempate?: string[]
}

const TABLAS: Record<string, TablaPermitida> = {
  clientes: {
    descripcion: 'Maestro de clientes (ficha comercial). Una fila por cliente.',
    columnas: ['nombre_fantasia', 'razon_social', 'vendedor', 'localidad', 'provincia', 'categoria', 'tipo', 'giro', 'condicion_venta', 'dias_pago', 'limite_cta_cte', 'dias_pago_real_mediana', 'dias_pago_real_muestras', 'created_at'],
    numericas: ['dias_pago', 'limite_cta_cte', 'dias_pago_real_mediana', 'dias_pago_real_muestras'],
    fechas: ['created_at'],
    orden: 'nombre_fantasia',
  },
  ventas: {
    descripcion: 'Líneas de venta del ERP (una fila por producto de cada pedido), montos NETOS. Tabla muy grande: siempre con rango de fechas. No excluye mermas/muestras: para totales confiables usar ventas_resumen o compras_cliente.',
    columnas: ['fecha_pedido', 'nombre_fantasia', 'vendedor_actual', 'categoria_producto', 'producto', 'envase', 'litros', 'total_sin_impuesto', 'pedido', 'tipo_venta', 'localidad', 'provincia', 'fecha_entrega', 'entregado', 'numero_factura'],
    numericas: ['litros', 'total_sin_impuesto'],
    fechas: ['fecha_pedido', 'fecha_entrega'],
    booleanas: ['entregado'],
    fechaObligatoria: 'fecha_pedido',
    orden: 'fecha_pedido',
  },
  deudores: {
    descripcion: 'Informe Deudores del ERP (foto actual de la deuda por cliente): saldo, deuda vencida y antigüedad por tramos.',
    columnas: ['nombre_fantasia', 'vendedor', 'saldo_total', 'deuda_vencida', 'deuda_menor_14_dias', 'deuda_entre_15_29_dias', 'deuda_entre_30_44_dias', 'deuda_entre_45_59_dias', 'deuda_entre_60_89_dias', 'deuda_mas_90_dias', 'ultimo_pago', 'fecha_ultima_compra', 'categoria_cliente', 'tipo_cliente', 'limite_cta_cte', 'dias_pago', 'barriles_adeudados'],
    numericas: ['saldo_total', 'deuda_vencida', 'deuda_menor_14_dias', 'deuda_entre_15_29_dias', 'deuda_entre_30_44_dias', 'deuda_entre_45_59_dias', 'deuda_entre_60_89_dias', 'deuda_mas_90_dias', 'limite_cta_cte', 'dias_pago', 'barriles_adeudados'],
    fechas: ['ultimo_pago', 'fecha_ultima_compra'],
    orden: 'deuda_vencida',
  },
  cobros_erp: {
    descripcion: 'Pagos recibidos (Movimientos Cta. Cte. del ERP): un pago por fila, con fecha, cliente, monto y medio de pago.',
    columnas: ['fecha', 'cliente', 'monto', 'metodo', 'guia', 'factura', 'fecha_guia', 'dias_pago'],
    numericas: ['monto', 'dias_pago'],
    fechas: ['fecha', 'fecha_guia'],
    fechaObligatoria: 'fecha',
    orden: 'fecha',
  },
  stock_productos: {
    descripcion: 'Stock de producto terminado por informe diario del ERP (filtrar por fecha_informe para ver un día; el último es el actual).',
    columnas: ['fecha_informe', 'producto', 'categoria', 'tipo', 'cantidad', 'litros', 'camara'],
    numericas: ['cantidad', 'litros'],
    fechas: ['fecha_informe'],
    fechaObligatoria: 'fecha_informe',
    orden: 'fecha_informe',
  },
  barriles_clientes: {
    descripcion: 'Barriles que están hoy en poder de clientes (retornables por recuperar).',
    columnas: ['nombre_fantasia', 'producto', 'litros', 'lote', 'vendedor', 'fecha_entrega', 'localidad'],
    numericas: ['litros'],
    fechas: ['fecha_entrega'],
    orden: 'fecha_entrega',
  },
  compras_historico: {
    descripcion: 'Compras de la empresa por día y proveedor (monto NETO). Se carga a mano desde el informe de compras del ERP.',
    columnas: ['fecha', 'proveedor', 'monto'],
    numericas: ['monto'],
    fechas: ['fecha'],
    fechaObligatoria: 'fecha',
    orden: 'fecha',
    desempate: ['fecha', 'proveedor'],
  },
  ventas_restaurante: {
    descripcion: 'Venta diaria del restaurante BaseCamp (POS Toteat, bruto con impuesto). Se carga a mano.',
    columnas: ['fecha', 'monto'],
    numericas: ['monto'],
    fechas: ['fecha'],
    fechaObligatoria: 'fecha',
    orden: 'fecha',
    desempate: ['fecha'],
  },
}

const OPERADORES: Record<string, string> = {
  eq: 'eq', neq: 'neq', contiene: 'ilike', gte: 'gte', lte: 'lte', gt: 'gt', lt: 'lt',
}
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const MAX_FILAS_SUMA = 30_000

interface Filtro { col: string; op: string; val: string | number | boolean }

function parsearFiltros(spec: string | null, t: TablaPermitida): { filtros: Filtro[]; error?: string } {
  const filtros: Filtro[] = []
  if (!spec) return { filtros }
  for (const parte of spec.split('|').map(s => s.trim()).filter(Boolean).slice(0, 8)) {
    const i = parte.indexOf(':'), j = parte.indexOf(':', i + 1)
    if (i < 0 || j < 0) return { filtros, error: `Filtro mal formado "${parte}". Formato: columna:operador:valor` }
    const col = parte.slice(0, i).trim(), opNombre = parte.slice(i + 1, j).trim().toLowerCase(), crudo = parte.slice(j + 1).trim()
    if (!t.columnas.includes(col)) return { filtros, error: `La columna "${col}" no existe o no está permitida. Columnas: ${t.columnas.join(', ')}` }
    const op = OPERADORES[opNombre]
    if (!op) return { filtros, error: `Operador "${opNombre}" no válido. Usa: ${Object.keys(OPERADORES).join(', ')}` }
    if (t.fechas.includes(col)) {
      if (!RE_FECHA.test(crudo)) return { filtros, error: `"${col}" espera una fecha YYYY-MM-DD.` }
      filtros.push({ col, op, val: crudo })
    } else if (t.numericas.includes(col)) {
      const n = Number(crudo)
      if (!Number.isFinite(n)) return { filtros, error: `"${col}" espera un número.` }
      filtros.push({ col, op, val: n })
    } else if (t.booleanas?.includes(col)) {
      if (crudo !== 'true' && crudo !== 'false') return { filtros, error: `"${col}" espera true o false.` }
      filtros.push({ col, op, val: crudo === 'true' })
    } else {
      const v = terminoSeguro(crudo)
      if (!v) return { filtros, error: `Valor vacío para "${col}".` }
      filtros.push({ col, op, val: op === 'ilike' ? `%${v}%` : v })
    }
  }
  return { filtros }
}

export const describirTablas: Consulta = {
  nombre: 'describir_tablas',
  descripcion:
    'Lista las tablas que se pueden explorar con explorar_tabla, qué contiene cada una y sus columnas (con tipo). ' +
    'Llamarla cuando ninguna otra herramienta cubre la pregunta o hay dudas sobre qué columnas existen.',
  parametros: [],
  async ejecutar() {
    return {
      tablas: Object.entries(TABLAS).map(([nombre, t]) => ({
        tabla: nombre,
        descripcion: t.descripcion,
        columnas: t.columnas.map(c => `${c}${t.numericas.includes(c) ? ' (número)' : t.fechas.includes(c) ? ' (fecha)' : t.booleanas?.includes(c) ? ' (true/false)' : ''}`),
        ...(t.fechaObligatoria ? { requiere_filtro_de_fecha_en: t.fechaObligatoria } : {}),
      })),
    }
  },
}

export const explorarTabla: Consulta = {
  nombre: 'explorar_tabla',
  descripcion:
    'Lee filas de una tabla de Supabase con filtros, orden y límite (solo lectura). Úsala para preguntas que las otras herramientas no cubren: ' +
    'ej. "pedidos de un vendedor en septiembre", "pagos de un cliente", "clientes de una localidad", "barriles que tiene X". ' +
    'Devuelve el total de filas que cumplen el filtro, las primeras `limite` y, si pides `sumar`, la suma exacta de una columna numérica sobre TODAS las filas filtradas. ' +
    'Si no estás seguro de tablas o columnas, llama antes a describir_tablas.',
  parametros: [
    { nombre: 'tabla', tipo: 'string', requerido: true, enum: Object.keys(TABLAS), descripcion: 'Tabla a leer.' },
    { nombre: 'filtros', tipo: 'string', descripcion: 'Filtros separados por "|", cada uno "columna:operador:valor". Operadores: eq, neq, contiene (texto), gte, lte, gt, lt. Ej: "vendedor:contiene:Claudio|fecha_pedido:gte:2026-09-01".' },
    { nombre: 'columnas', tipo: 'string', descripcion: 'Columnas a devolver separadas por coma. Por defecto todas las de la tabla.' },
    { nombre: 'ordenar_por', tipo: 'string', descripcion: 'Columna para ordenar. Por defecto la principal de la tabla.' },
    { nombre: 'orden', tipo: 'string', enum: ['desc', 'asc'], descripcion: 'Dirección. Por defecto desc.' },
    { nombre: 'sumar', tipo: 'string', descripcion: 'Columna numérica cuya suma total quieres sobre todas las filas filtradas.' },
    { nombre: 'limite', tipo: 'integer', descripcion: 'Cuántas filas devolver (1-50). Por defecto 20.' },
  ],
  async ejecutar(args, ctx) {
    const nombre = texto(args.tabla) ?? ''
    const t = TABLAS[nombre]
    if (!t) return { error: `Tabla "${nombre}" no permitida. Tablas: ${Object.keys(TABLAS).join(', ')}` }

    const { filtros, error } = parsearFiltros(texto(args.filtros), t)
    if (error) return { error }

    let notaFecha: string | undefined
    if (t.fechaObligatoria && !filtros.some(f => f.col === t.fechaObligatoria && ['gte', 'gt', 'eq'].includes(f.op))) {
      const desde = sumarDiasISO(ctx.hoyISO, -90)
      filtros.push({ col: t.fechaObligatoria, op: 'gte', val: desde })
      notaFecha = `Tabla grande: no se indicó fecha inicial, se aplicó ${t.fechaObligatoria} >= ${desde} (últimos 90 días).`
    }

    const pedidas = (texto(args.columnas) ?? '').split(',').map(c => c.trim()).filter(Boolean)
    const invalida = pedidas.find(c => !t.columnas.includes(c))
    if (invalida) return { error: `La columna "${invalida}" no existe o no está permitida. Columnas: ${t.columnas.join(', ')}` }
    const cols = pedidas.length ? pedidas : t.columnas

    const ordenCol = texto(args.ordenar_por) ?? t.orden
    if (!t.columnas.includes(ordenCol)) return { error: `No se puede ordenar por "${ordenCol}".` }
    const sumar = texto(args.sumar)
    if (sumar && !t.numericas.includes(sumar)) return { error: `"${sumar}" no es una columna numérica de ${nombre}. Numéricas: ${t.numericas.join(', ') || 'ninguna'}` }

    const limite = entero(args.limite, 20, 1, 50)
    const base = (columnas: string, opciones?: { count: 'exact'; head?: boolean }) => {
      let q = ctx.admin.from(nombre).select(columnas, opciones)
      for (const f of filtros) q = q.filter(f.col, f.op, f.val)
      return q
    }

    const { data, count, error: e1 } = await base(cols.join(', '), { count: 'exact' })
      .order(ordenCol, { ascending: args.orden === 'asc' }).range(0, limite - 1)
    if (e1) throw new Error(e1.message)
    const total = count ?? 0

    let suma: { columna: string; total: number; filas_sumadas: number; parcial?: boolean } | undefined
    if (sumar) {
      const filasASumar = Math.min(total, MAX_FILAS_SUMA)
      const paginas = await enLotes(Math.ceil(filasASumar / 1000), 8, async i => {
        let q = base(sumar)
        for (const c of t.desempate ?? ['id']) q = q.order(c, { ascending: true })
        const r = await q.range(i * 1000, i * 1000 + 999)
        if (r.error) throw new Error(r.error.message)
        return (r.data ?? []) as unknown as Record<string, number | null>[]
      })
      const filas = paginas.flat()
      suma = {
        columna: sumar, total: redondear(filas.reduce((s, f) => s + (Number(f[sumar]) || 0), 0)), filas_sumadas: filas.length,
        ...(total > MAX_FILAS_SUMA ? { parcial: true } : {}),
      }
    }

    return {
      tabla: nombre,
      filtros_aplicados: filtros.map(f => `${f.col} ${f.op} ${String(f.val).replace(/%/g, '')}`),
      total_filas_que_cumplen: total,
      filas_devueltas: (data ?? []).length,
      filas: data ?? [],
      ...(suma ? { suma } : {}),
      ...(total > limite ? { nota: `Hay ${total} filas; se muestran las primeras ${limite}.` } : {}),
      ...(notaFecha ? { nota_fecha: notaFecha } : {}),
      ...(suma?.parcial ? { advertencia: `La suma cubre sólo las primeras ${MAX_FILAS_SUMA} filas.` } : {}),
    }
  },
}
