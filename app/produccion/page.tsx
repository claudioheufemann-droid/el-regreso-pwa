import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { esClienteExcluidoProduccion } from '@/lib/types'
import { esCamaraProduccion } from '@/lib/camaras'
import {
  bucketEnvase, normalizarProducto,
  claveProductoEnvase, partirClaveProductoEnvase, ENVASE_LABEL,
  cicloEnCursoISO, inicioDeCiclo, finDeCiclo, type EnvaseBucket,
} from '@/lib/produccion/reglas'
import ProduccionClient from './ProduccionClient'

export const dynamic = 'force-dynamic'

export interface PuntoForecast {
  mes: string
  tipo: 'historico' | 'forecast'
  litros: number
  litrosMin: number | null
  litrosMax: number | null
  /** Descomposición de Prophet: litros ≈ tendencia + estacionalidad.
   *  `tendencia` es hacia dónde va el negocio sin el efecto del mes del año;
   *  `estacionalidad` es cuántos litros suma o resta ese mes en particular.
   *  Null cuando la serie no se proyectó (historial corto o descontinuada). */
  tendencia: number | null
  estacionalidad: number | null
}

/** Una serie lista para graficar: sus puntos + qué tan confiable resultó en
 *  el backtest. El cliente sólo elige cuál mostrar, no vuelve a cruzar nada. */
export interface SerieForecast {
  id: string
  nivel: 'general' | 'producto' | 'envase' | 'producto_envase'
  clave: string | null
  label: string
  /** Sólo para 'producto' y 'producto_envase' — null en 'general'/'envase'. */
  producto: string | null
  /** Sólo para 'envase' y 'producto_envase' — null en 'general'/'producto'. */
  envaseBucket: string | null
  /** 'cerveza' | 'kombucha' | null — viene de costos_precios.categoria. Nulo
   *  cuando la serie no es de un producto puntual (general/envase). */
  categoria: string | null
  puntos: PuntoForecast[]
  mae: number | null
  mape: number | null
  mesesHistorial: number | null
  /** 'derivado': producto_envase con poca historia/mal MAPE propio — el
   *  número sale de repartir el forecast del producto, no de un modelo
   *  propio. Ver generar_forecast.py. Siempre 'propio' en los demás niveles. */
  metodo: 'propio' | 'derivado'
  /** Litros vendidos en lo que va del mes en curso (calculado en vivo, no
   *  viene del modelo) — para comparar ritmo real contra lo proyectado. */
  litrosMesEnCurso: number
}

export interface CalidadItem {
  tipo: string
  clave: string | null
  detalle: string
  severidad: 'info' | 'advertencia'
}

export interface StockItem {
  /** Nombre canónico (resuelto contra el catálogo), no el crudo del ERP —
   *  necesario para agrupar barriles y latas del MISMO producto, que llegan
   *  con nombres distintos desde stock_productos (ver resolverProductoStock). */
  producto: string
  categoria: string | null
  envaseBucket: EnvaseBucket
  /** Depósito de origen en el informe del ERP. */
  camara: string | null
  cantidad: number
  litros: number | null
}

export interface AvanceMes {
  /** yyyy-mm-01 del CICLO interno en curso (no mes calendario — ver
   *  lib/produccion/reglas.ts). */
  mes: string
  diaActual: number
  diasEnMes: number
  /** Días hábiles (lunes a viernes) transcurridos y totales del ciclo — el
   *  reparto no vende fin de semana, así que cualquier proyección de RITMO
   *  de venta (no de tiempo transcurrido) debe usar estos dos, no
   *  diaActual/diasEnMes. */
  diasHabilesTranscurridos: number
  diasHabilesEnCiclo: number
}

export interface StockSeguridadItem {
  nivel: 'producto' | 'producto_envase'
  producto: string
  /** Bucket de envase; null cuando nivel='producto' (todos los formatos). */
  envase: string | null
  categoria: 'cerveza' | 'kombucha'
  /** Mes concreto proyectado (yyyy-mm-01), no un mes calendario 1-12. */
  mes: string
  leadTimeSemanas: number
  periodoRevisionSemanas: number
  demandaMensualProyectada: number
  demandaEnVentana: number
  sigmaSemanal: number
  stockSeguridadLitros: number
  puntoReordenLitros: number
  confianza: 'alta' | 'media' | 'baja'
  mapeBacktest: number | null
  mesesHistorial: number | null
  /** 'derivado': se repartió el forecast del producto por su proporción
   *  reciente de formato (poca historia propia o MAPE propio demasiado
   *  alto) — ver generar_forecast.py. Siempre 'propio' a nivel producto. */
  metodo: 'propio' | 'derivado'
  /** Litros en inventario hoy, al mismo nivel que la fila (por producto, o
   *  por producto+formato) — null si no aparece en el informe de stock. */
  stockActualLitros: number | null
  /** Litros declarados en producción y todavía no recibidos en bodega. */
  litrosEnProduccion: number
}

/**
 * Una fila de la cola priorizada del Plan Maestro (tabla plan_produccion).
 * Distinta de `lotes_produccion` (Logística: el ENVÍO/despacho de algo que
 * ya se produjo) — esto es la planificación previa: qué cocinar, cuánto,
 * cuándo y en qué orden.
 */
export interface LotePlan {
  id: string
  producto: string
  categoria: 'cerveza' | 'kombucha'
  litrosPlanificados: number
  /** yyyy-mm-dd */
  fechaPlanificada: string
  /** 0 = primero en la cola. Contiguo dentro de planificado/en_curso. */
  prioridad: number
  estado: 'planificado' | 'en_curso' | 'completado' | 'cancelado'
  origen: 'sugerido' | 'manual'
  /** Por qué se sugirió — sólo tiene contenido cuando origen='sugerido'. */
  motivo: string | null
  observaciones: string | null
}

/**
 * Una sugerencia de cocción calculada EN VIVO (no persistida) comparando el
 * disponible actual contra el punto de reorden — el usuario la confirma
 * (crea la fila real en plan_produccion) o la ignora. Igual que el resto de
 * Stock de Seguridad, se recalcula en cada carga de página.
 */
export interface SugerenciaPlan {
  producto: string
  /** Formato específico que gatilló la alarma — barriles y latas de un mismo
   *  producto se agotan a ritmos distintos, así que la sugerencia SIEMPRE es
   *  por producto×envase, nunca por el estilo completo (ver comentario en
   *  el cálculo más abajo). */
  envase: EnvaseBucket
  categoria: 'cerveza' | 'kombucha'
  /** Litros para cubrir lo que haga falta: el punto de reorden, o lo que se
   *  va a consumir durante el lead time al ritmo de venta ACTUAL, lo que
   *  sea mayor. */
  litrosSugeridos: number
  leadTimeSemanas: number
  /** Litros/día vendidos en lo que va del ciclo — el ritmo REAL, no el
   *  promedio proyectado por el forecast. */
  ritmoDiarioActual: number
  /** Días hasta agotar el disponible al ritmo actual — null si no hubo
   *  ventas este ciclo (no se puede proyectar una velocidad). */
  diasHastaQuiebre: number | null
  /** yyyy-mm-dd — null si diasHastaQuiebre es null. */
  fechaEstimadaQuiebre: string | null
  motivo: string
}

export default async function ProduccionPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  // Mismo criterio que Rentabilidad: si no tiene acceso rebota al Hub sin
  // revelar que la ruta existe. Admins + equipo de Producción.
  if (!user.isAdmin && user.macroArea !== 'produccion') redirect('/')

  // Service-role a propósito (lib/supabase/admin.ts): las tablas forecast_*
  // exigen RLS authenticated y en modo demo no hay sesión real — mismo gap ya
  // resuelto para stock_productos/deudores/users.
  const admin = createAdminClient()

  // forecast_produccion se pagina: PostgREST corta en 1000 filas y, ordenado
  // por mes, las del forecast son las ÚLTIMAS — con el historial completo
  // (miles de filas entre general/producto/envase/producto_envase) la
  // proyección quedaba entera fuera de la respuesta y el gráfico salía sin
  // la línea verde. Las otras tablas tienen decenas de filas, no hace falta.
  const PAGE = 1000
  type ForecastRow = { nivel: string; clave: string | null; mes: string; tipo: string; litros: number; litros_min: number | null; litros_max: number | null; tendencia: number | null; estacionalidad: number | null }
  const forecastRaw: ForecastRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('forecast_produccion')
      .select('nivel, clave, mes, tipo, litros, litros_min, litros_max, tendencia, estacionalidad')
      .order('mes', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    forecastRaw.push(...(data as ForecastRow[]))
    if (data.length < PAGE) break
  }

  const [{ data: validacionRaw }, { data: calidadRaw }, { data: stockRaw }, { data: costosPrecios }, { data: stockSeguridadRaw }, { data: ultimoSyncStockRaw }] = await Promise.all([
    admin.from('forecast_validacion').select('nivel, clave, mae, mape, meses_historial, metodo'),
    admin.from('forecast_calidad_datos').select('tipo, clave, detalle, severidad, generado_at').order('generado_at', { ascending: false }),
    admin.from('stock_productos').select('producto, categoria, tipo, camara, cantidad, litros').order('cantidad', { ascending: false }),
    admin.from('costos_precios').select('producto, categoria').not('codigo', 'is', null),
    admin.from('stock_seguridad').select('nivel, producto, envase, categoria, mes, lead_time_semanas, periodo_revision_semanas, demanda_mensual_proyectada, demanda_en_ventana, sigma_semanal, stock_seguridad_litros, punto_reorden_litros, confianza, mape_backtest, meses_historial, metodo').order('mes', { ascending: true }),
    // Cuándo se sincronizó por última vez el stock del ERP — para que el
    // panel de Stock de Seguridad pueda mostrar que el "disponible" contra
    // el que compara está vivo (recalculado en cada carga de la página, no
    // sólo cuando corre el forecast mensual), no una foto vieja.
    admin.from('erp_sync_log').select('creado_at').eq('fuente', 'stock').eq('ok', true).order('creado_at', { ascending: false }).limit(1).maybeSingle(),
  ])
  const ultimoSyncStock = (ultimoSyncStockRaw as { creado_at?: string } | null)?.creado_at ?? null
  // Se calcula server-side (comparado contra la hora del request, no la del
  // navegador) para no arriesgar un mismatch de hidratación entre SSR y
  // cliente — mismo patrón que diaActual/diasEnMes más abajo.
  const minutosDesdeSyncStock = ultimoSyncStock != null
    ? Math.max(0, Math.round((Date.now() - Date.parse(ultimoSyncStock)) / 60000))
    : null

  const categoriaPorProducto = new Map(
    (costosPrecios ?? []).map(c => [normalizarProducto(c.producto as string), (c.categoria as string | null) ?? null])
  )

  // ── Avance del ciclo en curso, calculado en vivo (no viene del modelo:
  // el modelo excluye el ciclo en curso a propósito porque está incompleto).
  // "Ciclo", no mes calendario — ver el comentario extenso en
  // lib/produccion/reglas.ts: arranca el 24 del mes anterior y cierra el 23
  // del mes que le da nombre.
  const cicloEnCurso = cicloEnCursoISO()
  const inicioCiclo = inicioDeCiclo(cicloEnCurso)
  const finCiclo = finDeCiclo(cicloEnCurso)
  const MS_POR_DIA = 24 * 60 * 60 * 1000
  const hoy = new Date()
  const hoyISO = hoy.toISOString().slice(0, 10)
  const diaActual = Math.floor(
    (Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${inicioCiclo}T00:00:00Z`)) / MS_POR_DIA
  ) + 1
  const diasEnMes = Math.floor(
    (Date.parse(`${finCiclo}T00:00:00Z`) - Date.parse(`${inicioCiclo}T00:00:00Z`)) / MS_POR_DIA
  ) + 1

  // ── Días hábiles (lunes a viernes) — para CUALQUIER cálculo de RITMO de
  // venta (no de tiempo transcurrido). El reparto no vende fin de semana,
  // así que dividir los litros vendidos por días CALENDARIO subestima el
  // ritmo real: un lote vendido en 10 días hábiles se repartía entre 14
  // días calendario y daba una velocidad más lenta de la real. Se usa tanto
  // para las alarmas de quiebre como para "a este ritmo cerrarías con X L"
  // en Forecasting — diaActual/diasEnMes (calendario) siguen siendo los
  // correctos para "en qué día del ciclo estamos".
  const esFinDeSemanaISO = (iso: string) => {
    const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
    return dow === 0 || dow === 6
  }
  const contarDiasHabilesISO = (desdeISO: string, hastaISO: string): number => {
    let n = 0
    for (let t = Date.parse(`${desdeISO}T00:00:00Z`); t <= Date.parse(`${hastaISO}T00:00:00Z`); t += MS_POR_DIA) {
      if (!esFinDeSemanaISO(new Date(t).toISOString().slice(0, 10))) n++
    }
    return n
  }
  const diasHabilesTranscurridos = contarDiasHabilesISO(inicioCiclo, hoyISO)
  const diasHabilesEnCiclo = contarDiasHabilesISO(inicioCiclo, finCiclo)
  /** Suma `diasHabiles` días hábiles a `desdeISO`, saltando sábado/domingo. */
  const sumarDiasHabilesISO = (desdeISO: string, diasHabiles: number): string => {
    let t = Date.parse(`${desdeISO}T00:00:00Z`)
    let restantes = Math.max(0, Math.round(diasHabiles))
    while (restantes > 0) {
      t += MS_POR_DIA
      if (!esFinDeSemanaISO(new Date(t).toISOString().slice(0, 10))) restantes--
    }
    return new Date(t).toISOString().slice(0, 10)
  }

  const litrosMtdPorSerie = new Map<string, number>()
  {
    // Paginado — mismo motivo que forecast_produccion arriba: PostgREST corta
    // en 1000 filas. Un ciclo de venta normal ya supera esa cifra bien antes
    // de cerrar (1.756 filas a mitad del ciclo del 4-sep-2026), así que sin
    // paginar la consulta se cortaba a mitad de camino y "vendido este mes"
    // quedaba muy por debajo de lo real (2.969 L en vez de ~5.300 L).
    type VentaMesRow = { fecha_pedido: string; nombre_fantasia: string | null; producto: string | null; envase: string | null; litros: number | null }
    const ventasMes: VentaMesRow[] = []
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await admin
        .from('ventas')
        .select('fecha_pedido, nombre_fantasia, producto, envase, litros')
        .gte('fecha_pedido', inicioCiclo)
        .order('id', { ascending: true })
        .range(offset, offset + PAGE - 1)
      if (error || !data || data.length === 0) break
      ventasMes.push(...(data as VentaMesRow[]))
      if (data.length < PAGE) break
    }
    for (const f of ventasMes) {
      if (!f.fecha_pedido || !f.producto) continue
      if (esClienteExcluidoProduccion(f.nombre_fantasia)) continue
      const nombreNormalizado = normalizarProducto(f.producto)
      if (!categoriaPorProducto.has(nombreNormalizado)) continue // mismo filtro de catálogo que el endpoint de datos
      const litros = (f.litros as number) ?? 0
      const bucket = bucketEnvase(f.envase as string | null, litros)

      const sumar = (id: string) => litrosMtdPorSerie.set(id, (litrosMtdPorSerie.get(id) ?? 0) + litros)
      sumar('general::')
      sumar(`producto::${nombreNormalizado}`)
      sumar(`envase::${bucket}`)
      sumar(`producto_envase::${claveProductoEnvase(nombreNormalizado, bucket)}`)
    }
  }

  // Índice de validación por serie, para colgarle su MAPE a cada una.
  const validacionPorSerie = new Map(
    (validacionRaw ?? []).map(v => [`${v.nivel}::${v.clave ?? ''}`, v])
  )

  const seriesMap = new Map<string, SerieForecast>()
  for (const f of forecastRaw) {
    const id = `${f.nivel}::${f.clave ?? ''}`
    if (!seriesMap.has(id)) {
      const val = validacionPorSerie.get(id)
      const nivel = f.nivel as SerieForecast['nivel']

      let label = f.clave ?? ''
      let producto: string | null = null
      let envaseBucket: string | null = null
      let categoria: string | null = null

      if (nivel === 'general') {
        label = 'Todos los productos (consolidado)'
      } else if (nivel === 'envase') {
        envaseBucket = f.clave
        label = ENVASE_LABEL[(f.clave ?? 'otros') as keyof typeof ENVASE_LABEL] ?? f.clave ?? ''
      } else if (nivel === 'producto') {
        producto = f.clave
        categoria = categoriaPorProducto.get(f.clave ?? '') ?? null
        label = f.clave ?? ''
      } else if (nivel === 'producto_envase') {
        const partido = partirClaveProductoEnvase(f.clave ?? '')
        producto = partido.producto
        envaseBucket = partido.bucket
        categoria = categoriaPorProducto.get(partido.producto) ?? null
        label = `${partido.producto} — ${ENVASE_LABEL[partido.bucket] ?? partido.bucket}`
      }

      seriesMap.set(id, {
        id, nivel, clave: f.clave, label, producto, envaseBucket, categoria,
        puntos: [],
        mae: val?.mae != null ? Number(val.mae) : null,
        mape: val?.mape != null ? Number(val.mape) : null,
        mesesHistorial: val?.meses_historial ?? null,
        metodo: (val?.metodo as 'propio' | 'derivado' | undefined) ?? 'propio',
        litrosMesEnCurso: Math.round((litrosMtdPorSerie.get(id) ?? 0) * 10) / 10,
      })
    }
    seriesMap.get(id)!.puntos.push({
      mes: f.mes,
      tipo: f.tipo as 'historico' | 'forecast',
      litros: Number(f.litros),
      litrosMin: f.litros_min != null ? Number(f.litros_min) : null,
      litrosMax: f.litros_max != null ? Number(f.litros_max) : null,
      tendencia: f.tendencia != null ? Number(f.tendencia) : null,
      estacionalidad: f.estacionalidad != null ? Number(f.estacionalidad) : null,
    })
  }

  // Orden: general primero, después productos, envases, y al final los
  // combos producto×envase — cada grupo ordenado por volumen histórico.
  const volumen = (s: SerieForecast) => s.puntos.filter(p => p.tipo === 'historico').reduce((a, p) => a + p.litros, 0)
  const series = [...seriesMap.values()].sort((a, b) => {
    const peso = { general: 0, producto: 1, envase: 2, producto_envase: 3 }
    if (peso[a.nivel] !== peso[b.nivel]) return peso[a.nivel] - peso[b.nivel]
    return volumen(b) - volumen(a)
  })

  const calidad = (calidadRaw ?? []).map(c => ({
    tipo: c.tipo, clave: c.clave, detalle: c.detalle, severidad: c.severidad,
  })) as CalidadItem[]

  const ultimaCorrida = (calidadRaw?.[0] as { generado_at?: string } | undefined)?.generado_at ?? null

  // Producción usa una lista de cámaras MÁS AMPLIA que Ventas: acá la
  // pregunta es "¿cuánto producto terminado tenemos?" (para no lanzar una
  // cocción redundante), no "¿qué puedo prometerle a un cliente hoy?". Por eso
  // entran también Frío Planta y Latas FIFO. Ver CAMARAS_PRODUCCION en
  // lib/camaras.ts — definición de negocio, no del parseo.
  const stockDisponibleRaw = (stockRaw ?? []).filter(
    s => s.tipo !== 'tanque' && esCamaraProduccion(s.camara as string | null)
  )

  // Inventario actual por producto, sumado entre barril+envase.
  //
  // stock_productos.litros SOLO viene poblado para tipo='barril' — está así
  // en TODA la app (confirmado: 19/19 barriles con litros, 0/21 envases), el
  // módulo de Stock también lo trata como null para latas. Acá sí hace falta
  // el litraje real de las latas para comparar contra el stock de seguridad
  // (que está en litros), así que se deriva del tamaño de envase que ya
  // viene en el propio nombre del producto ("Lata (354 ml) de X").
  const litrosLata = (producto: string, cantidad: number): number | null => {
    const match = producto.match(/Lata \((\d+)\s*ml\)/i)
    return match ? cantidad * (Number(match[1]) / 1000) : null
  }
  // normalizarProducto saca el prefijo de lata y un descriptor final ENTRE
  // PARÉNTESIS ("Mocho English (Red Ale)" → "Mocho English") — eso alcanza
  // para los barriles, pero stock_productos repite el estilo en las latas
  // SIN paréntesis y pegado al nombre ("Lata (473 ml) de Mocho English Red
  // Ale" → sin el prefijo queda "Mocho English Red Ale", que no es igual a
  // "Mocho English"). Se resuelve buscando cuál producto conocido (mismo
  // catálogo que ya usa el forecast) es prefijo de lo que queda — más
  // robusto que tratar de adivinar dónde termina el nombre y empieza el
  // estilo con puro recorte de texto.
  const productosConocidos = [...categoriaPorProducto.keys()].sort((a, b) => b.length - a.length)
  function resolverProductoStock(nombreCrudo: string): string {
    const limpio = normalizarProducto(nombreCrudo)
    if (categoriaPorProducto.has(limpio)) return limpio
    const prefijo = productosConocidos.find(p => limpio === p || limpio.startsWith(p + ' '))
    return prefijo ?? limpio
  }
  // El colchón ahora se calcula también por formato, así que el inventario
  // tiene que quedar clasificado igual: no se puede servir un pedido de
  // barril con latas. En los barriles el tamaño se deduce del propio
  // informe (litros/cantidad = capacidad del barril; hoy son todos de 30L).
  const bucketDeStock = (producto: string, tipo: string, cantidad: number, litros: number | null): EnvaseBucket => {
    if (tipo === 'barril') {
      const capacidad = litros != null && cantidad > 0 ? Math.round(litros / cantidad) : null
      if (capacidad === 30) return 'barril_30'
      if (capacidad === 50) return 'barril_50'
      return 'otros'
    }
    // 'lata' fusiona 354ml y 473ml — ver el comentario extenso en
    // lib/produccion/reglas.ts (EnvaseBucket).
    const ml = producto.match(/Lata \((\d+)\s*ml\)/i)?.[1]
    if (ml === '354' || ml === '473') return 'lata'
    return 'otros'
  }

  const stockActualPorProducto = new Map<string, number>()
  const stockActualPorProductoEnvase = new Map<string, number>()
  // `stock`: una fila por (producto resuelto, formato, cámara) — es lo que
  // consume la tabla "Inventario Actual" del cliente, agrupada visualmente
  // ahí. Se arma en el MISMO loop que ya resolvía nombre/bucket para no
  // repetir el cálculo dos veces.
  const stock: StockItem[] = []
  for (const s of stockDisponibleRaw) {
    if (!s.producto) continue
    const cantidad = Number(s.cantidad)
    const litrosCrudos = s.litros != null ? Number(s.litros) : null
    const litros = litrosCrudos ?? litrosLata(s.producto as string, cantidad)
    const nombre = resolverProductoStock(s.producto as string)
    const bucket = bucketDeStock(s.producto as string, s.tipo as string, cantidad, litrosCrudos)

    stock.push({
      producto: nombre,
      categoria: categoriaPorProducto.get(nombre) ?? null,
      envaseBucket: bucket,
      camara: (s.camara as string | null) ?? null,
      cantidad,
      litros,
    })

    // Las siguientes dos sumas SÍ necesitan litros reales — se saltan acá
    // (no en el push de arriba) para no perder la fila en la tabla de
    // referencia cuando el formato no tiene litraje derivable (ej. "otros").
    if (litros == null) continue
    stockActualPorProducto.set(nombre, (stockActualPorProducto.get(nombre) ?? 0) + litros)
    const clavePE = claveProductoEnvase(nombre, bucket as never)
    stockActualPorProductoEnvase.set(clavePE, (stockActualPorProductoEnvase.get(clavePE) ?? 0) + litros)
  }

  // Litros en fermentación, que van a llegar a bodega dentro del lead time.
  // Sin esto, un producto con una cocción en curso aparece igual como
  // "crítico" y gatillaría una cocción redundante.
  //
  // Fuente: la sección "Stock de producto en tanques" del mismo informe del
  // ERP (tipo='tanque'), no lotes_produccion. Esa tabla se llena a mano desde
  // el módulo de Logística y tenía 2 lotes cargados en total, mientras que el
  // ERP trae los ~11 fermentadores completos y actualizados en cada sync.
  //
  // No hay doble conteo con el inventario: mientras el producto está en el
  // tanque todavía no se envasó, así que no aparece en ninguna cámara.
  const litrosEnProduccionPorProducto = new Map<string, number>()
  for (const s of stockRaw ?? []) {
    if (s.tipo !== 'tanque' || s.litros == null) continue
    const nombre = resolverProductoStock(s.producto as string)
    litrosEnProduccionPorProducto.set(nombre, (litrosEnProduccionPorProducto.get(nombre) ?? 0) + Number(s.litros))
  }

  const stockSeguridad = (stockSeguridadRaw ?? []).map(s => {
    const nivel = s.nivel as 'producto' | 'producto_envase'
    const producto = normalizarProducto(s.producto as string)
    const envase = (s.envase as string | null) ?? null
    // El inventario se compara al mismo nivel que la fila: una fila de
    // "Mocho English en barril 30L" contra los barriles de 30L que hay,
    // no contra el total del producto en todos los formatos.
    // A nivel formato, que no haya línea para ese envase NO es falta de dato:
    // si el producto aparece en el informe de stock, el ERP lo está
    // reportando y la ausencia de ese formato significa cero real, o sea
    // quiebre total. Tratarlo como "sin dato" escondía las roturas de stock
    // más graves (44 filas en la primera corrida) en la casilla gris.
    // "Sin dato" queda sólo para productos que el informe no menciona.
    const stockActual = nivel === 'producto_envase' && envase
      ? stockActualPorProductoEnvase.get(claveProductoEnvase(producto, envase as never))
        ?? (stockActualPorProducto.has(producto) ? 0 : null)
      : stockActualPorProducto.get(producto) ?? null
    return {
      nivel, producto, envase,
      categoria: s.categoria as 'cerveza' | 'kombucha',
      mes: (s.mes as string).slice(0, 10),
      leadTimeSemanas: Number(s.lead_time_semanas),
      periodoRevisionSemanas: Number(s.periodo_revision_semanas),
      demandaMensualProyectada: Number(s.demanda_mensual_proyectada),
      demandaEnVentana: Number(s.demanda_en_ventana),
      sigmaSemanal: Number(s.sigma_semanal),
      stockSeguridadLitros: Number(s.stock_seguridad_litros),
      puntoReordenLitros: Number(s.punto_reorden_litros),
      confianza: s.confianza as 'alta' | 'media' | 'baja',
      mapeBacktest: s.mape_backtest != null ? Number(s.mape_backtest) : null,
      mesesHistorial: s.meses_historial != null ? Number(s.meses_historial) : null,
      metodo: (s.metodo as 'propio' | 'derivado' | null) ?? 'propio',
      stockActualLitros: stockActual,
      // Los lotes se cargan por producto, sin desglose de formato confiable,
      // así que sólo se descuentan en las filas a nivel producto.
      litrosEnProduccion: nivel === 'producto' ? (litrosEnProduccionPorProducto.get(producto) ?? 0) : 0,
    }
  }) as StockSeguridadItem[]

  const avanceMes: AvanceMes = { mes: cicloEnCurso, diaActual, diasEnMes, diasHabilesTranscurridos, diasHabilesEnCiclo }

  // ── Plan Maestro: cola real de cocciones planificadas ──────────────────
  const { data: planRaw } = await admin
    .from('plan_produccion')
    .select('*')
    .in('estado', ['planificado', 'en_curso'])
    .order('prioridad', { ascending: true })

  const planProduccion: LotePlan[] = (planRaw ?? []).map(p => ({
    id: p.id as string,
    producto: p.producto as string,
    categoria: p.categoria as 'cerveza' | 'kombucha',
    litrosPlanificados: Number(p.litros_planificados),
    fechaPlanificada: (p.fecha_planificada as string).slice(0, 10),
    prioridad: Number(p.prioridad),
    estado: p.estado as LotePlan['estado'],
    origen: p.origen as 'sugerido' | 'manual',
    motivo: (p.motivo as string | null) ?? null,
    observaciones: (p.observaciones as string | null) ?? null,
  }))

  // Sugerencias / alarmas de quiebre: SIEMPRE por producto×envase, nunca por
  // el estilo completo — lo que hay que saber no es "¿va bien Doble IPA?"
  // sino "¿en qué formato específico (barril 30L, lata...) nos vamos a
  // quedar sin stock, y cuándo?". Un producto puede ir sobrado en lata y
  // crítico en barril al mismo tiempo; agregarlo a nivel producto escondía
  // justo el dato que importa para decidir qué envasar.
  //
  // Dos señales, no una sola:
  //  1) Punto de reorden (stock de seguridad, basado en el PROMEDIO
  //     proyectado por el forecast) — la misma lógica de siempre.
  //  2) Ritmo de venta REAL de este ciclo (litros vendidos / días
  //     transcurridos) proyectado hacia adelante — agarra los casos donde
  //     se está vendiendo más rápido que el promedio y el punto de reorden
  //     (que mira el promedio) todavía no se dio cuenta.
  // La sugerencia dispara si CUALQUIERA de las dos dice que hace falta
  // producir, y siempre muestra la fecha estimada de quiebre calculada con
  // el ritmo real — es el dato que responde "¿cuándo exactamente?".
  const productosEnPlan = new Set(planProduccion.map(l => l.producto))
  const primerMes = [...new Set(stockSeguridad.map(s => s.mes))].sort()[0]
  const sugerenciasPlan: SugerenciaPlan[] = stockSeguridad
    .filter(s => s.nivel === 'producto_envase' && s.envase && s.mes === primerMes && !productosEnPlan.has(s.producto))
    .map(s => {
      const envase = s.envase as EnvaseBucket
      const disponible = s.stockActualLitros != null ? s.stockActualLitros + s.litrosEnProduccion : null
      if (disponible == null) return null

      // Ritmo en litros por DÍA HÁBIL (lunes a viernes) — no se vende fin de
      // semana, así que "días" acá y en diasHastaQuiebre/fechaEstimadaQuiebre
      // más abajo son siempre días hábiles, no días calendario.
      const ritmoDiarioActual = diasHabilesTranscurridos > 0
        ? (litrosMtdPorSerie.get(`producto_envase::${claveProductoEnvase(s.producto, envase)}`) ?? 0) / diasHabilesTranscurridos
        : 0
      const diasHastaQuiebre = ritmoDiarioActual > 0 ? disponible / ritmoDiarioActual : null
      const fechaEstimadaQuiebre = diasHastaQuiebre != null
        ? sumarDiasHabilesISO(hoyISO, diasHastaQuiebre)
        : null

      // Litros que el ritmo actual se comería durante la ventana de riesgo
      // (lead time + hasta la próxima revisión mensual) — mismo concepto de
      // "ventana" que el stock de seguridad, pero con la velocidad real en
      // vez del promedio del forecast. La ventana la fija el proveedor en
      // semanas calendario; se pasa a días hábiles (5/7) para que combine
      // con un ritmo que también es por día hábil.
      const ventanaDiasHabiles = (s.leadTimeSemanas + s.periodoRevisionSemanas) * 5
      const necesidadRitmo = Math.max(ritmoDiarioActual * ventanaDiasHabiles - disponible, 0)
      const necesidadReorden = Math.max(s.puntoReordenLitros - disponible, 0)
      const necesidadNeta = Math.round(Math.max(necesidadRitmo, necesidadReorden))
      if (necesidadNeta <= 0) return null

      const disparadoPorRitmo = necesidadRitmo > necesidadReorden
      const envaseLabel = ENVASE_LABEL[envase] ?? envase
      const fechaLabel = fechaEstimadaQuiebre != null
        ? new Date(`${fechaEstimadaQuiebre}T00:00:00Z`).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })
        : null

      let motivo: string
      if (disponible < s.stockSeguridadLitros) {
        motivo = `Crítico en ${envaseLabel}: disponible (${Math.round(disponible)} L) por debajo del stock de seguridad (${Math.round(s.stockSeguridadLitros)} L).`
      } else if (disparadoPorRitmo) {
        motivo = `Al ritmo de venta actual (${Math.round(ritmoDiarioActual * 5)} L/semana, lun-vie) vas a quebrar ${envaseLabel} antes de que llegue el próximo lote.`
      } else {
        motivo = `Bajo punto de reorden en ${envaseLabel}: disponible ${Math.round(disponible)} L, punto de reorden ${Math.round(s.puntoReordenLitros)} L.`
      }
      motivo += fechaLabel
        ? ` Quiebre estimado: ${fechaLabel} (${Math.max(0, Math.round(diasHastaQuiebre!))} días hábiles), al ritmo de venta actual (lun-vie). Lead time ${s.leadTimeSemanas} semanas.`
        : ` Sin ventas registradas este ciclo para proyectar fecha. Lead time ${s.leadTimeSemanas} semanas.`

      return {
        producto: s.producto,
        envase,
        categoria: s.categoria,
        litrosSugeridos: necesidadNeta,
        leadTimeSemanas: s.leadTimeSemanas,
        ritmoDiarioActual: Math.round(ritmoDiarioActual * 10) / 10,
        diasHastaQuiebre: diasHastaQuiebre != null ? Math.round(diasHastaQuiebre) : null,
        fechaEstimadaQuiebre,
        motivo,
      } as SugerenciaPlan
    })
    .filter((s): s is SugerenciaPlan => s !== null)
    .sort((a, b) => {
      const diasA = a.diasHastaQuiebre ?? Infinity
      const diasB = b.diasHastaQuiebre ?? Infinity
      if (diasA !== diasB) return diasA - diasB
      return b.litrosSugeridos - a.litrosSugeridos
    })

  return (
    <ProduccionClient
      series={series}
      calidad={calidad}
      planProduccion={planProduccion}
      sugerenciasPlan={sugerenciasPlan}
      stock={stock}
      stockSeguridad={stockSeguridad}
      ultimaCorrida={ultimaCorrida}
      minutosDesdeSyncStock={minutosDesdeSyncStock}
      avanceMes={avanceMes}
      nombreUsuario={user.nombre}
      inicialesUsuario={user.iniciales}
    />
  )
}
