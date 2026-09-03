import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { esClienteExcluidoProduccion } from '@/lib/types'
import {
  bucketEnvase, mesDe, mesEnCursoISO, normalizarProducto,
  claveProductoEnvase, partirClaveProductoEnvase, ENVASE_LABEL,
} from '@/lib/produccion/reglas'
import ProduccionClient from './ProduccionClient'

export const dynamic = 'force-dynamic'

export interface PuntoForecast {
  mes: string
  tipo: 'historico' | 'forecast'
  litros: number
  litrosMin: number | null
  litrosMax: number | null
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
  producto: string
  categoria: string | null
  tipo: string
  cantidad: number
  litros: number | null
}

export interface AvanceMes {
  /** yyyy-mm-01 del mes en curso. */
  mes: string
  diaActual: number
  diasEnMes: number
}

export interface StockSeguridadItem {
  producto: string
  categoria: 'cerveza' | 'kombucha'
  mesCalendario: number
  leadTimeSemanas: number
  demandaSemanalPromedio: number
  sigmaSemanal: number
  stockSeguridadLitros: number
  puntoReordenLitros: number
  confianza: 'alta' | 'baja'
  mesesHistorialMes: number
  /** Litros en inventario hoy (stock_productos, sumado entre barril+envase
   *  del mismo producto) — null si el producto no aparece en el último
   *  informe de stock. */
  stockActualLitros: number | null
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
  type ForecastRow = { nivel: string; clave: string | null; mes: string; tipo: string; litros: number; litros_min: number | null; litros_max: number | null }
  const forecastRaw: ForecastRow[] = []
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin
      .from('forecast_produccion')
      .select('nivel, clave, mes, tipo, litros, litros_min, litros_max')
      .order('mes', { ascending: true })
      .range(offset, offset + PAGE - 1)
    if (error || !data || data.length === 0) break
    forecastRaw.push(...(data as ForecastRow[]))
    if (data.length < PAGE) break
  }

  const [{ data: validacionRaw }, { data: calidadRaw }, { data: stockRaw }, { data: costosPrecios }, { data: stockSeguridadRaw }] = await Promise.all([
    admin.from('forecast_validacion').select('nivel, clave, mae, mape, meses_historial'),
    admin.from('forecast_calidad_datos').select('tipo, clave, detalle, severidad, generado_at').order('generado_at', { ascending: false }),
    admin.from('stock_productos').select('producto, categoria, tipo, cantidad, litros').order('cantidad', { ascending: false }),
    admin.from('costos_precios').select('producto, categoria').not('codigo', 'is', null),
    admin.from('stock_seguridad').select('producto, categoria, mes_calendario, lead_time_semanas, demanda_semanal_promedio, sigma_semanal, stock_seguridad_litros, punto_reorden_litros, confianza, meses_historial_mes'),
  ])

  const categoriaPorProducto = new Map(
    (costosPrecios ?? []).map(c => [normalizarProducto(c.producto as string), (c.categoria as string | null) ?? null])
  )

  // ── Avance del mes en curso, calculado en vivo (no viene del modelo:
  // el modelo excluye el mes en curso a propósito porque está incompleto) ──
  const mesEnCurso = mesEnCursoISO()
  const hoy = new Date()
  const diaActual = hoy.getUTCDate()
  const diasEnMes = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 0)).getUTCDate()

  const litrosMtdPorSerie = new Map<string, number>()
  {
    const { data: ventasMes } = await admin
      .from('ventas')
      .select('fecha_pedido, nombre_fantasia, producto, envase, litros')
      .gte('fecha_pedido', mesEnCurso)
    for (const f of ventasMes ?? []) {
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
        litrosMesEnCurso: Math.round((litrosMtdPorSerie.get(id) ?? 0) * 10) / 10,
      })
    }
    seriesMap.get(id)!.puntos.push({
      mes: f.mes,
      tipo: f.tipo as 'historico' | 'forecast',
      litros: Number(f.litros),
      litrosMin: f.litros_min != null ? Number(f.litros_min) : null,
      litrosMax: f.litros_max != null ? Number(f.litros_max) : null,
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

  const stock = (stockRaw ?? []).map(s => ({
    producto: s.producto, categoria: s.categoria, tipo: s.tipo,
    cantidad: Number(s.cantidad), litros: s.litros != null ? Number(s.litros) : null,
  })) as StockItem[]

  // Inventario actual por producto, sumado entre barril+envase — stock_productos
  // trae nombres con prefijo ("Lata (473 ml) de X") o descriptor de estilo
  // ("X (Kolsch)"), mismo problema ya resuelto para el cruce de ventas.
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
  const stockActualPorProducto = new Map<string, number>()
  for (const s of stockRaw ?? []) {
    if (!s.producto) continue
    const litros = s.litros != null ? Number(s.litros) : litrosLata(s.producto as string, Number(s.cantidad))
    if (litros == null) continue
    const nombre = normalizarProducto(s.producto as string)
    stockActualPorProducto.set(nombre, (stockActualPorProducto.get(nombre) ?? 0) + litros)
  }

  const stockSeguridad = (stockSeguridadRaw ?? []).map(s => ({
    producto: s.producto as string,
    categoria: s.categoria as 'cerveza' | 'kombucha',
    mesCalendario: s.mes_calendario as number,
    leadTimeSemanas: Number(s.lead_time_semanas),
    demandaSemanalPromedio: Number(s.demanda_semanal_promedio),
    sigmaSemanal: Number(s.sigma_semanal),
    stockSeguridadLitros: Number(s.stock_seguridad_litros),
    puntoReordenLitros: Number(s.punto_reorden_litros),
    confianza: s.confianza as 'alta' | 'baja',
    mesesHistorialMes: s.meses_historial_mes as number,
    stockActualLitros: stockActualPorProducto.get(normalizarProducto(s.producto as string)) ?? null,
  })) as StockSeguridadItem[]

  const avanceMes: AvanceMes = { mes: mesEnCurso, diaActual, diasEnMes }

  return (
    <ProduccionClient
      series={series}
      calidad={calidad}
      stock={stock}
      stockSeguridad={stockSeguridad}
      ultimaCorrida={ultimaCorrida}
      avanceMes={avanceMes}
      nombreUsuario={user.nombre}
      inicialesUsuario={user.iniciales}
    />
  )
}
