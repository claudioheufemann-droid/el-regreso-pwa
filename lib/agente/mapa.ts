/**
 * MAPA DE LA BASE — cómo navegar los datos de la app sin tantear.
 *
 * Dos niveles, pensados para gastar pocos tokens:
 *   1. ÍNDICE (indiceMapa): una línea por área → va en el system prompt FIJO
 *      (se paga una vez por llamada y es cacheable). Le dice al modelo en qué
 *      área está la respuesta y qué herramienta usar, sin listar ~80 tablas.
 *   2. DETALLE (textoArea): tablas, columnas clave, cómo se cruzan y trampas de
 *      UN área → lo entrega la herramienta `mapa_datos` sólo cuando hace falta.
 *      Reemplaza el `describir_esquema` sin tabla (~2.500 tokens) y varias
 *      rondas de prueba y error con nombres de columnas.
 *
 * Verificado contra la base el 1-oct-2026 (columnas legibles por agente_lector,
 * llaves foráneas y formatos reales de los datos). Si cambia una tabla, se
 * actualiza acá; el diagrama para humanos está en docs/memoria/agente/mapa_datos.md.
 */

export interface AreaMapa {
  id: string
  nombre: string
  /** Pantallas de la app donde la persona ve estos datos (para decirle dónde mirarlo). */
  pantallas: string
  /** Qué tipo de pregunta cae acá (va en el índice). */
  preguntas: string
  /** Herramientas específicas del área, si existen: se prefieren al SQL. */
  herramientas: string[]
  /** "tabla: qué es · columnas clave". Sólo columnas legibles por el agente. */
  tablas: string[]
  /** Cómo se cruza con otras tablas (llave → llave). */
  cruces: string[]
  /** Errores típicos que hacen dar vueltas o dar cifras malas. */
  trampas: string[]
}

/** Llaves que conectan TODA la base. Van en el índice: con esto se arma cualquier cruce. */
export const LLAVES = [
  'Cliente: nombre_fantasia (texto) es la llave central: clientes, ventas, deudores, deudores_historial, cobros_erp.cliente, barriles_*, client_scores, mv_clientes_estado, misiones, predicciones_compra. clientes.id (número) sólo lo usan visitas_terreno.cliente_erp_id y cotizaciones.',
  'Producto: texto igual en ventas.producto, forecast_produccion.clave, stock_seguridad.producto, plan_produccion.producto y recetas.producto; stock_productos lo escribe distinto ("Fisura (Porter)", "Lata (473 ml) de Fisura Porter") → para stock usar la herramienta stock_actual, no un cruce a mano.',
  'Vendedor: texto con el nombre (ventas.vendedor_actual, clientes.vendedor, deudores.vendedor, misiones.vendedor); a veces viene como correo → filtrar con ilike por el apellido. En terreno es vendedor_id (uuid) y los nombres de usuarios están bloqueados.',
  'Mes: en forecast_* y stock_seguridad, `mes` = yyyy-mm-01 del CICLO 24→23 que termina ese mes ("2026-12-01" = 24-nov a 23-dic).',
]

export const AREAS: AreaMapa[] = [
  {
    id: 'ventas',
    nombre: 'Ventas (pedidos del ERP)',
    pantallas: '/ventas, /ventas/historico, /ventas/ranking, /control-comercial/ventas',
    preguntas: 'cuánto se vendió, litros, rankings por cliente/vendedor/producto/localidad, pedidos, pedidos pendientes de entrega',
    herramientas: ['ventas_resumen', 'top_clientes', 'compras_cliente'],
    tablas: [
      'ventas (~175 mil filas, 2023-01 → hoy, sync ERP): UNA FILA POR LÍNEA de producto de un pedido · fecha_pedido, nombre_fantasia, vendedor_actual, responsable_al_momento, producto, envase (Barril | Lata (354 ml) | Lata (473 ml)), categoria_producto (Cerveza | Kombucha | Merch | S/C), categoria_negocio (= tipo de CLIENTE: Bar, Restaurante, Botillería, Distribuidor…), litros, total_sin_impuesto (NETO CLP), pedido (n°), numero_factura, localidad, provincia, entregado (bool), fecha_entrega (null si no se entregó), fecha_entrega_estimada',
      'ventas_restaurante (2024-05 → se carga a mano desde Toteat, puede ir atrasada): venta DIARIA del restaurante BaseCamp · fecha, monto (BRUTO con IVA), filas',
    ],
    cruces: [
      'ventas.nombre_fantasia = clientes.nombre_fantasia (coincide ~99,8%) para traer ficha, vendedor de cartera o plazo.',
      'Pedidos = count(distinct pedido); nunca count(*) (cuenta líneas).',
      'Pendientes de entrega: where not entregado (agrupar por pedido, nombre_fantasia, fecha_entrega_estimada).',
    ],
    trampas: [
      'Venta real: where not _excluir_cliente_finanzas(nombre_fantasia) and not _excluir_producto(producto) (Finanzas, incluye PDV/BaseCamp). Criterio Comercial: _excluir_cliente (quita también PDV). Decir cuál se usó.',
      '"BaseCamp El Regreso" en ventas = cerveza que la fábrica le vende al restaurante; ventas_restaurante = lo que el restaurante le vende al público. No sumarlas.',
      'Cliente PDV, Cliente Debito/Transferencia PDV = mostrador propio (no son clientes externos).',
      'categoria_negocio NO es categoría de producto; para cerveza/kombucha usar categoria_producto ilike.',
    ],
  },
  {
    id: 'clientes',
    nombre: 'Clientes: ficha, hábito de compra y estado',
    pantallas: '/ventas/clientes, /ventas/clientes/[id], /control-comercial/clientes, /ventas/mapa',
    preguntas: 'datos de un cliente, cada cuánto compra, cuándo le toca, inactivos, score/segmento, cartera de un vendedor',
    herramientas: ['buscar_cliente', 'frecuencia_compra_cliente', 'clientes_inactivos'],
    tablas: [
      'clientes (~960, ficha ERP): id, nombre_fantasia (único), razon_social, vendedor (cartera), localidad, provincia, categoria, tipo, giro, condicion_venta, lista_precios, dias_pago (PACTADO), limite_cta_cte, dias_pago_real_mediana (REAL medido), lat, lng, created_at',
      'client_scores (vista materializada, 1 fila por cliente): score 0-100, segmento A-E, alert_level (ok | proximo | vencido | critico), dias_sin_compra, ciclo_promedio_dias, siguiente_compra_estimada, litros_totales, revenue_total, total_pedidos, pedidos_por_mes, primera_compra, ultima_compra, es_estacional, vendedor_actual',
      'client_raw_metrics (vista EN VIVO, más lenta): mismas métricas de frecuencia con dias_sin_compra y dias_para_siguiente al día',
      'mv_clientes_estado: estado (activo | riesgo | inactivo | perdido), territorio (Los Lagos, Los Ríos, La Araucanía, Metropolitana, Online Nacional, Retail), dias_sin_compra, ciclo_promedio_dias',
      'clientes_estado: estado/nota MANUAL que pone un admin sobre un cliente',
      'predicciones_compra (~28 mil): historial de predicciones · nombre_fantasia, fecha_prediccion, fecha_estimada, fecha_real, error_dias (precisión del modelo)',
    ],
    cruces: [
      'Todo por nombre_fantasia. Cartera de un vendedor = clientes.vendedor (o client_scores.vendedor_actual = el de su última venta).',
      'Quién debería comprar pronto: client_scores con alert_level in (\'proximo\',\'vencido\',\'critico\') o siguiente_compra_estimada <= current_date + 7, ordenado por score desc; agrupar por vendedor_actual. Ya trae dias_sin_compra y ciclo: no recalcular desde ventas.',
    ],
    trampas: [
      'RUT, correo, teléfono y dirección están bloqueados.',
      'clientes.vendedor incluye valores que no son personas: Inactivo, Incobrable, Incobrable 2024/2025, CERVECERÍA, OnLine, Vendedor Muestras.',
    ],
  },
  {
    id: 'cobranza',
    nombre: 'Cobranza: deuda y pagos',
    pantallas: '/ventas/deudores, /ventas/admin/deudores, /control-comercial/cobranza, /administracion (Ingreso Real)',
    preguntas: 'quién debe, deuda vencida por tramo, cuánto se cobró, cuánto se demora en pagar un cliente',
    herramientas: ['deuda_clientes', 'comportamiento_pago_cliente', 'cobros_resumen'],
    tablas: [
      'deudores (~400, FOTO ACTUAL, se reemplaza cada hora desde el ERP): nombre_fantasia, vendedor, saldo_total, deuda_vencida, deuda_menor_14_dias, deuda_entre_15_29_dias, deuda_entre_30_44_dias, deuda_entre_45_59_dias, deuda_entre_60_89_dias, deuda_mas_90_dias, barriles_adeudados, ultimo_pago, fecha_ultima_compra, dias_pago, limite_cta_cte',
      'deudores_historial (foto diaria): snapshot_date + mismas columnas de deuda → evolución en el tiempo',
      'cobros_erp (~19 mil): pagos recibidos · fecha, cliente (= nombre_fantasia), monto, metodo, factura, guia, fecha_guia, dias_pago (días reales que tardó)',
    ],
    cruces: [
      'cobros_erp.cliente = clientes.nombre_fantasia = deudores.nombre_fantasia (100% de coincidencia).',
      'Plazo pactado = clientes.dias_pago; real = clientes.dias_pago_real_mediana o mediana de cobros_erp.dias_pago.',
    ],
    trampas: [
      'deudores no tiene historia: para "cuánto bajó la deuda" usar deudores_historial.',
      'vendedor "Incobrable…" = deuda marcada incobrable; excluir cuentas internas (marketing, ferias, personal) en rankings.',
    ],
  },
  {
    id: 'finanzas',
    nombre: 'Finanzas: forecast en $, compras y flujo de caja',
    pantallas: '/administracion (pestañas Ingreso Real, Flujo de caja, Forecast)',
    preguntas: 'proyección de ingresos (PDV, BaseCamp, por categoría, total), proyección de compras por proveedor, pagos comprometidos',
    herramientas: [],
    tablas: [
      'forecast_finanzas (Prophet en $, mensual): nivel (general | categoria | cliente | restaurante | compra), clave (general: null; categoria: Cerveza/Kombucha/Otros; cliente: Cliente PDV; restaurante: Restaurante BaseCamp; compra: nombre del proveedor o "Total compras"), mes, tipo (historico = real | forecast = proyección oct-2026 → may-2027), monto, monto_min, monto_max, generado_at',
      'forecast_finanzas_validacion: error del modelo por serie · nivel, clave, mape, mae, metodo',
      'compras_historico (a mano desde el ERP): compras diarias por proveedor · fecha, proveedor, monto (NETO)',
      'compras_comprometidas: pagos a proveedores · proveedor, descripcion, monto, fecha_pago, fecha_documento, estado, categoria, factura',
    ],
    cruces: [
      'Para una serie: where nivel=\'cliente\' and clave=\'Cliente PDV\' and tipo=\'forecast\' order by mes. Comparar con el año anterior: tipo=\'historico\' y mes - 1 año.',
    ],
    trampas: [
      'Todo en NETO salvo nivel=\'restaurante\' (BaseCamp), que va en BRUTO (boleta con IVA). Decirlo.',
      'mes = ciclo 24→23 que TERMINA ese mes.',
      'Si piden lo que entra cada semana por cobranza: no hay tabla, se calcula en la app (Ingreso Real); responder con deudores + cobros_erp y avisar que es aproximado.',
    ],
  },
  {
    id: 'produccion',
    nombre: 'Producción: stock, forecast en litros, plan e insumos',
    pantallas: '/produccion, /ventas/stock, /ventas/admin/stock, /ventas/admin/insumos',
    preguntas: 'stock de un producto, qué va a quebrar stock, cuánto se va a vender en litros, stock de seguridad / reorden, qué se va a producir, insumos y recetas',
    herramientas: ['stock_actual'],
    tablas: [
      'stock_productos (fotos por fecha_informe; usar la MÁS RECIENTE): tipo (barril | envase = latas | tanque), producto, codigo_producto, categoria, cantidad, litros, camara, lotes (jsonb)',
      'forecast_produccion (Prophet en LITROS, mensual): nivel (general | producto | envase | producto_envase), clave (producto; envase: barril_30, barril_50, lata; producto_envase: "Fisura::lata"), mes, tipo (historico | forecast), litros, litros_min, litros_max',
      'forecast_validacion: mape/mae del forecast de litros por serie',
      'stock_seguridad: nivel (producto | producto_envase), producto, envase, mes, stock_seguridad_litros, punto_reorden_litros, demanda_mensual_proyectada, confianza',
      'plan_produccion: lotes planificados · producto, litros_planificados, fecha_planificada, fermentador, dias_ocupacion, estado (planificado | cancelado), prioridad',
      'insumos (catálogo: nombre, categoria, unidad_base, precio_unitario) ← stock_insumos (fecha_informe, insumo_id, cantidad) y receta_insumos (receta_id, insumo_id, cantidad, uso) → recetas (producto, litros_base, abv, ibu, og, fg)',
    ],
    cruces: [
      'stock vs. reorden: stock_productos (última fecha_informe, ilike producto%) contra stock_seguridad del mes en curso.',
      'Riesgo de quiebre o stock de un producto: usar stock_actual (ya normaliza nombres, calcula litros de latas, separa tanque y trae demanda del ciclo y días de cobertura). No recalcularlo con SQL.',
      'Insumos de un producto: recetas.producto → receta_insumos.receta_id → insumos.id (escala lineal litros_base → litros del lote).',
    ],
    trampas: [
      'stock_productos guarda varias fechas: filtrar fecha_informe = (select max(fecha_informe) from stock_productos) o se suman fotos.',
      'stock_productos: las latas (tipo=envase) traen litros NULL y nombre "Lata (354 ml) de Kombucha Lemon Fresh"; los barriles "Kombucha Lemon (Fresh)"; tipo=tanque = aún sin envasar. Por eso un cruce por nombre exacto da quiebres falsos.',
      'Producción trabaja en litros; el $ neto de Producción se calcula en la app (litros × precio neto/L de 90 días).',
    ],
  },
  {
    id: 'barriles',
    nombre: 'Barriles en clientes',
    pantallas: '/ventas/barriles, /ventas/admin/barriles, /control-comercial/barriles',
    preguntas: 'qué barriles tiene un cliente, cuántos hay afuera, cuánto tiempo llevan, cuáles se recuperaron',
    herramientas: [],
    tablas: [
      'barriles_clientes (~300, FOTO ACTUAL): un barril en poder de un cliente · nombre_fantasia, codigo, litros (30 | 50), producto, lote, vendedor, fecha_entrega, localidad',
      'barriles_historial (foto diaria): snapshot_date, nombre_fantasia, codigo, litros, producto, fecha_entrega → un barril que deja de aparecer entre dos fotos = se recuperó ese día',
    ],
    cruces: ['barriles_clientes.nombre_fantasia = clientes.nombre_fantasia; deudores.barriles_adeudados da el conteo según el ERP.'],
    trampas: ['Días afuera = current_date - fecha_entrega::date.'],
  },
  {
    id: 'comercial',
    nombre: 'Gestión comercial: metas, misiones, leads y tareas',
    pantallas: '/ventas/metas, /ventas/misiones, /ventas/leads, /control-comercial, /gestion',
    preguntas: 'meta del mes/semana, a quién llamar esta semana (misiones), prospectos, tareas internas',
    herramientas: [],
    tablas: [
      'metas: periodo_id → periodos (nombre, fecha_inicio, fecha_fin, activo) · vendedor (hoy sólo "Equipo Ventas"), tipo (mensual | semanal), semana_numero, fecha_inicio, fecha_fin, categoria_negocio, meta_litros',
      'misiones (pauta de clientes a contactar): vendedor, nombre_fantasia, semana, tipo (esta_semana | proxima_semana | vencido), estado (pendiente | contactado_sin_pedido | auto_completado), alert_level, score, dias_sin_compra, siguiente_compra_estimada, resultado_litros, prioridad_calculada',
      'cold_leads (~5.800 prospectos): nombre, region, ciudad, categoria, rating, score_lead, litros_potencial, en_zona, estado, vendedor_asignado',
      'tasks: tareas internas · titulo, area, sub_area, estado, plazo, prioridad_maxima, contador_retrasos',
    ],
    cruces: ['Avance de meta: sum(ventas.litros) en fecha_inicio..fecha_fin del período contra metas.meta_litros.'],
    trampas: ['misiones puede estar desactualizada: mirar max(semana) antes de decir "esta semana".'],
  },
  {
    id: 'terreno',
    nombre: 'Terreno: visitas, jornadas y rutas de vendedores',
    pantallas: '/terreno, /terreno/admin, /terreno/admin/visitas, /admin/jornadas',
    preguntas: 'visitas hechas, con o sin venta, motivos de no venta, km y reembolsos',
    herramientas: [],
    tablas: [
      'visitas_terreno (~430): vendedor_id, cliente_nombre, cliente_erp_id → clientes.id, cliente_terreno_id → clientes_terreno.id, es_cliente_nuevo, tiene_venta, total_pedido, motivo_sin_venta, resultado_visita, proximo_paso, completada_at, dentro_geofence, jornada_id',
      'visitas_terreno_items: visita_id → visitas_terreno · producto, envase, cantidad, precio_unit, subtotal',
      'seguimientos: visita_id → visitas_terreno · tipo_accion, fecha_hora_compromiso, estado',
      'jornadas_terreno: vendedor_id, fecha, km_declarados, km_gps, monto_reembolso, estado, requiere_revision',
      'clientes_terreno: prospectos/clientes creados en ruta · nombre_fantasia, canal, lat, lng',
    ],
    cruces: ['Nombre del vendedor: users está bloqueado → agrupar por vendedor_id o unir clientes por cliente_erp_id y usar clientes.vendedor.'],
    trampas: ['Las tablas plan_*_terreno (planificación semanal) existen pero están vacías.'],
  },
  {
    id: 'flota',
    nombre: 'Flota y logística',
    pantallas: '/flota, /logistica',
    preguntas: 'vehículos, viajes, despachos',
    herramientas: [],
    tablas: [
      'vehiculos: nombre, tipo, patente, marca, modelo, km_actual, estado',
      'viajes_flota: vehiculo_id → vehiculos · tipo, motivo, estado, km_inicio, km_fin, litros_carga, monto_combustible, ciudad_destino, iniciado_at',
      'despachos, despacho_paradas, entregas, rutas_reparto, lotes_produccion: estructura lista, casi sin datos',
    ],
    cruces: [],
    trampas: [],
  },
  {
    id: 'sistema',
    nombre: 'Actualización de datos',
    pantallas: '(interno)',
    preguntas: 'cuándo se actualizó un informe, si un dato está al día',
    herramientas: [],
    tablas: [
      'erp_sync_log: cada carga · fuente (barriles | clientes | deudores | stock | stock_insumos | stock_seguridad | forecast_finanzas | forecast_produccion), ok, mensaje, total, creado_at',
      'forecast_calidad_datos: avisos de calidad de las series del forecast · tipo, clave, detalle, severidad',
    ],
    cruces: ['Frescura de ventas: max(fecha_pedido) en ventas; de BaseCamp: max(fecha) en ventas_restaurante.'],
    trampas: [],
  },
]

export const IDS_AREAS = AREAS.map(a => a.id)

/** Una línea por área, para el system prompt fijo. */
export function indiceMapa(): string {
  return [
    ...AREAS.map(a => `- ${a.id}: ${a.preguntas}${a.herramientas.length ? ` → ${a.herramientas.join(', ')}` : ' → consultar_sql'}`),
    'LLAVES QUE UNEN LAS TABLAS:',
    ...LLAVES.map(l => `- ${l}`),
  ].join('\n')
}

/** Detalle de un área (lo devuelve la herramienta mapa_datos). */
export function textoArea(id: string): string | null {
  const a = AREAS.find(x => x.id === id)
  if (!a) return null
  return [
    `ÁREA ${a.nombre}. En la app: ${a.pantallas}.`,
    a.herramientas.length ? `Herramientas propias (preferirlas): ${a.herramientas.join(', ')}.` : 'Sin herramienta propia: usar consultar_sql.',
    'TABLAS:',
    ...a.tablas.map(t => `- ${t}`),
    a.cruces.length ? 'CRUCES:' : '',
    ...a.cruces.map(c => `- ${c}`),
    a.trampas.length ? 'OJO:' : '',
    ...a.trampas.map(t => `- ${t}`),
  ].filter(Boolean).join('\n')
}
