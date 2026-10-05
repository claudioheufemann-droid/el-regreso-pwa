'use client'

import { useCallback, useEffect, useMemo, useState, useRef, useSyncExternalStore } from 'react'
import { useArrastreCalendario, type CargaArrastre, type DestinoArrastre } from './useArrastreCalendario'
import type { LoteCerrado, EnvaseItem, PuntoHistorialStock, MlLataPorProducto, SerieForecast, CalidadItem, StockItem, AvanceMes, StockSeguridadItem, LotePlan, ConfigProductoProduccion, SugerenciaPlan, SplitFermentador, OcupacionPlanta, NecesidadInsumo, StockInsumoItem, RecetaInsumoLinea, LoteSinReceta, AjusteTanque } from './page'
import { type TabId } from './navegacion'
import type { BloqueGantt, ConfigProducto } from './GanttProduccion'
import { LINEAS_FIJAS, finDeCiclo, esDiaHabilISO, LEAD_TIME_INSUMOS_SEMANAS, esLineaFija, familiaEnvase, type EnvaseBucket, type FamiliaEnvase } from '@/lib/produccion/reglas'

import { calcularCobertura, aSugerencias, type CoberturaProducto } from '@/lib/produccion/cobertura'
import { suscribirProyeccionAbierta, leerProyeccionAbierta, MESES_CORTOS, fNum, fPesosCorto, ORDEN_ENVASE, ORDEN_FAMILIA, UNIDAD_ENVASE, hoyLocalISO, sumarDiasCalISO, restarDiasHabilesISO, diffDiasISO, demandaProyectadaEnPeriodo, etiquetaMes, indiceMes } from './compartido'

export interface ProduccionProps {
  series: SerieForecast[]
  calidad: CalidadItem[]
  /** Cola real del Plan Maestro (tabla plan_produccion), ya ordenada por prioridad. */
  planProduccion: LotePlan[]
  /** Días en tanque, litraje habitual y color de cada producto en el Gantt. */
  configProductos: ConfigProductoProduccion[]
  /** Sugerencias calculadas en vivo comparando disponible vs. punto de reorden — no persistidas hasta que el usuario las confirma. */
  sugerenciasPlan: SugerenciaPlan[]
  /** Cómo repartir entre formatos lo que está hoy en los fermentadores. */
  splitFermentadores: SplitFermentador[]
  /** Litros/día reales de las últimas 4 semanas por producto (informe de
   *  venta detallada ÷ días hábiles) — mismo criterio que las Alarmas de
   *  quiebre. Reemplaza al forecast SÓLO para el mes en curso en la fila
   *  "hasta cuándo alcanza" del Gantt; los meses futuros siguen viniendo del
   *  forecast, que es lo único que puede proyectarlos. */
  ritmoRealPorProducto: Record<string, number>
  ajustesTanque: AjusteTanque[]
  /** Litros y tanques ocupados en la sala de fermentación. */
  ocupacionPlanta: OcupacionPlanta
  /** Insumos que hacen falta para cubrir la cola activa del Plan Maestro, escalando cada receta al litraje real de cada lote. */
  necesidadInsumos: NecesidadInsumo[]
  stockInsumos: StockInsumoItem[]
  recetaInsumos: RecetaInsumoLinea[]
  /** Lotes del plan cuyo producto no tiene receta cargada — su necesidad de insumos no se pudo calcular. */
  lotesSinReceta: LoteSinReceta[]
  stock: StockItem[]
  stockSeguridad: StockSeguridadItem[]
  ultimaCorrida: string | null
  /** Minutos desde la última sincronización de stock del ERP (erp_sync_log),
   *  calculados server-side. Distinto de `ultimaCorrida` (cuándo corrió el
   *  forecast mensual) — el "disponible" de Stock de Seguridad se recalcula
   *  en CADA carga de página contra el stock actual, esto es lo que prueba
   *  que es así en vez de dejarlo como una afirmación sin respaldo visual. */
  minutosDesdeSyncStock: number | null
  avanceMes: AvanceMes
  nombreUsuario: string
  inicialesUsuario: string
  /** Lotes cerrados de las últimas 8 semanas (plan vs. real). */
  lotesCerrados: LoteCerrado[]
  /** Latas, etiquetas y tapas (tabla produccion_envase). */
  envase: EnvaseItem[]
  /** Fotos diarias del stock de las líneas fijas (desde 4-oct-2026). */
  historialStock: PuntoHistorialStock[]
  /** ml de la lata de cada producto, según el inventario. */
  mlLataPorProducto: MlLataPorProducto
  esAdmin: boolean
}

/** Estado y cálculos del módulo Producción. Las vistas reciben el objeto entero
 *  (`p`) y toman lo que necesitan; así ninguna repite un cálculo. */
export function useProduccion(props: ProduccionProps) {
  const { series, calidad, planProduccion, configProductos, sugerenciasPlan, splitFermentadores, ritmoRealPorProducto, ajustesTanque: ajustesTanqueIniciales, ocupacionPlanta, stockInsumos, recetaInsumos, lotesSinReceta, stock, stockSeguridad, ultimaCorrida, minutosDesdeSyncStock, avanceMes, lotesCerrados, envase: envaseInicial, historialStock, mlLataPorProducto } = props
  const [activeTab, setActiveTab] = useState<TabId>('hoy')

  /* ── Menú lateral: ancho según el espacio real ────────────────────────
     En notebooks (1280-1440 px) los 256 px del menú son ~20% del ancho, y
     estas pantallas son tableros anchos: el Gantt llega a 3.000 px. Por eso
     en 'auto' el menú va como riel de iconos y sólo se abre en monitores
     grandes (2xl, 1536 px+).

     El modo 'auto' se resuelve POR CSS, no leyendo window.innerWidth: hacerlo
     en JS obliga a decidir el ancho después del primer render, lo que da
     parpadeo al cargar y desajuste de hidratación. Con clases responsive el
     servidor y el cliente pintan lo mismo.

     Una vez que el usuario lo toca, manda su elección y se recuerda: nada
     peor que un menú que se vuelve a cerrar solo cada vez que se abre. */
  // Estado local del Plan Maestro, sincronizado con la prop del servidor pero
  // actualizado optimistamente en cada acción (reordenar, agregar, cambiar
  // estado, mover en el Gantt) para que la UI responda al toque. Tras un
  // cambio EXITOSO ya no se hace router.refresh(): recargaba la página entera
  // (17 consultas y miles de filas) y congelaba la pantalla un par de
  // segundos después de cada movimiento. Sólo se recarga si algo falla.
  const [plan, setPlan] = useState<LotePlan[]>(planProduccion)
  const [guardandoPlan, setGuardandoPlan] = useState(false)
  const [errorPlan, setErrorPlan] = useState<string | null>(null)
  const [mostrarFormLote, setMostrarFormLote] = useState(false)
  /** Alarma sobre la que se abrió el popup de confirmación — null = cerrado. */
  const [sugerenciaModal, setSugerenciaModal] = useState<{ producto: string; categoria: 'cerveza' | 'kombucha'; items: SugerenciaPlan[] } | null>(null)
  // Si el servidor trae un plan nuevo (router.refresh), reemplaza el local.
  // Se compara contra el último recibido en vez de usar un efecto: evita un
  // render en cascada (patrón "ajustar estado cuando cambia una prop").
  const [planRecibido, setPlanRecibido] = useState(planProduccion)
  if (planRecibido !== planProduccion) { setPlanRecibido(planProduccion); setPlan(planProduccion) }
  /** El plan más reciente, para callbacks estables (arrastre, quitar) que no
   *  pueden depender del closure de un render viejo. */
  const planRef = useRef(plan)
  useEffect(() => { planRef.current = plan }, [plan])

  async function moverLote(id: string, direccion: -1 | 1) {
    const idx = plan.findIndex(l => l.id === id)
    const destino = idx + direccion
    if (idx < 0 || destino < 0 || destino >= plan.length) return
    const nuevo = [...plan]
    ;[nuevo[idx], nuevo[destino]] = [nuevo[destino], nuevo[idx]]
    setPlan(nuevo)
    setErrorPlan(null)
    try {
      const r = await fetch('/api/produccion/plan/reordenar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: nuevo.map(l => l.id) }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo reordenar')
    } catch (e) {
      setPlan(plan) // revierte el optimista
      setErrorPlan(e instanceof Error ? e.message : 'Error al reordenar')
    }
  }

  async function cambiarEstadoLote(
    id: string, estado: LotePlan['estado'],
    extra: { fechaInicioReal?: string | null; fechaFinReal?: string | null; litrosReales?: number | null; fechaPlanificada?: string } = {},
  ) {
    // Actualización funcional y reversión de ESE lote solamente: con varias
    // acciones seguidas (quitar dos bloques rápido) un "volver a la foto
    // anterior" pisaría la otra acción.
    const anterior = planRef.current.find(l => l.id === id)
    const indice = planRef.current.findIndex(l => l.id === id)
    setPlan(p => (estado === 'cancelado' || estado === 'completado'
      ? p.filter(l => l.id !== id)
      : p.map(l => l.id === id ? {
        ...l, estado,
        fechaPlanificada: extra.fechaPlanificada ?? l.fechaPlanificada,
        fechaInicioReal: estado === 'en_curso' ? (extra.fechaInicioReal ?? hoyLocalISO()) : l.fechaInicioReal,
      } : l)))
    setErrorPlan(null)
    try {
      const r = await fetch(`/api/produccion/plan/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado, ...extra }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo actualizar')
      return true
    } catch (e) {
      if (anterior) {
        setPlan(p => {
          const sin = p.filter(l => l.id !== id)
          sin.splice(Math.min(Math.max(indice, 0), sin.length), 0, anterior)
          return sin
        })
      }
      setErrorPlan(e instanceof Error ? e.message : 'Error al actualizar el estado')
      return false
    }
  }

  /* ── Quitar un bloque del Gantt con "Deshacer" ──────────────────────────
     Antes: una X de 16 px que sólo aparecía al pasar el mouse (invisible en el
     celular) y pedía dos clics. Ahora se quita con un clic o con Supr y queda
     6 segundos un aviso con "Deshacer": perdonar el error es más amable que
     pedir confirmación antes (regla de Apple: deshacer > confirmar). */
  const [deshacer, setDeshacer] = useState<{ lote: LotePlan; indice: number } | null>(null)
  const timerDeshacer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const quitarLoteConDeshacer = useCallback(async (id: string) => {
    const indice = planRef.current.findIndex(l => l.id === id)
    const lote = planRef.current[indice]
    if (!lote) return
    if (timerDeshacer.current) clearTimeout(timerDeshacer.current)
    setDeshacer({ lote, indice })
    timerDeshacer.current = setTimeout(() => setDeshacer(null), 6000)
    const ok = await cambiarEstadoLote(id, 'cancelado')
    if (!ok) setDeshacer(null)
  }, [])
  const deshacerQuitar = useCallback(async () => {
    const d = deshacer
    if (!d) return
    if (timerDeshacer.current) clearTimeout(timerDeshacer.current)
    setDeshacer(null)
    setPlan(p => {
      if (p.some(l => l.id === d.lote.id)) return p
      const n = [...p]
      n.splice(Math.min(d.indice, n.length), 0, d.lote)
      return n
    })
    try {
      const r = await fetch(`/api/produccion/plan/${d.lote.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: d.lote.estado }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo deshacer')
    } catch (e) {
      setPlan(p => p.filter(l => l.id !== d.lote.id))
      setErrorPlan(e instanceof Error ? e.message : 'No se pudo deshacer')
    }
  }, [deshacer])
  const cerrarDeshacer = useCallback(() => {
    if (timerDeshacer.current) clearTimeout(timerDeshacer.current)
    setDeshacer(null)
  }, [])

  /** Guarda (o reemplaza) la corrección de fecha de un lote 'en_tanque'. El
   *  estado local se actualiza antes de esperar la respuesta —igual que
   *  mover un bloque en el Gantt— porque el usuario ya está mirando el
   *  bloque y esperar el roundtrip para verlo moverse se siente lento. */
  async function guardarAjusteTanque(fechas: { fechaInicioManual: string; fechaEmbarriladoManual: string | null }) {
    if (!editarTanqueAbierto) return
    const { tanque, codigoLote } = editarTanqueAbierto
    setGuardandoAjusteTanque(true)
    setErrorAjusteTanque(null)
    try {
      const r = await fetch('/api/produccion/ajuste-tanque', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tanque, codigoLote, ...fechas }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo guardar la corrección')
      setAjustesTanque(prev => [
        ...prev.filter(a => !(a.tanque === tanque && a.codigoLote === codigoLote)),
        { tanque, codigoLote, fechaInicioManual: fechas.fechaInicioManual, fechaEmbarriladoManual: fechas.fechaEmbarriladoManual },
      ])
      setEditarTanqueAbierto(null)
    } catch (e) {
      setErrorAjusteTanque(e instanceof Error ? e.message : 'Error al guardar la corrección')
    } finally {
      setGuardandoAjusteTanque(false)
    }
  }

  /** Vuelve a la fecha que calcula la app (ERP + duración del producto) —
   *  borra el ajuste en vez de guardarlo vacío, para no confundir "nunca se
   *  corrigió" con "se corrigió a nada". */
  async function restablecerAjusteTanque() {
    if (!editarTanqueAbierto) return
    const { tanque, codigoLote } = editarTanqueAbierto
    setGuardandoAjusteTanque(true)
    setErrorAjusteTanque(null)
    try {
      const r = await fetch(`/api/produccion/ajuste-tanque?tanque=${encodeURIComponent(tanque)}&codigoLote=${encodeURIComponent(codigoLote)}`, { method: 'DELETE' })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo restablecer')
      setAjustesTanque(prev => prev.filter(a => !(a.tanque === tanque && a.codigoLote === codigoLote)))
      setEditarTanqueAbierto(null)
    } catch (e) {
      setErrorAjusteTanque(e instanceof Error ? e.message : 'Error al restablecer')
    } finally {
      setGuardandoAjusteTanque(false)
    }
  }

  async function agregarLote(datos: {
    producto: string; categoria: 'cerveza' | 'kombucha'; litrosPlanificados: number; fechaPlanificada: string
    motivo?: string | null; origen?: 'sugerido' | 'manual'
    /** Tanque donde se suelta en el Gantt. Null = queda sin asignar. */
    fermentador?: string | null
    /** Sólo para el detalle del evento de Google Calendar. */
    necesidadCubrir?: number | null; cubreHasta?: string | null
  }) {
    setGuardandoPlan(true)
    setErrorPlan(null)
    try {
      const r = await fetch('/api/produccion/plan', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo agregar el lote')
      const nuevo = await r.json()
      setPlan(p => [...p, {
        id: nuevo.id, producto: nuevo.producto, categoria: nuevo.categoria,
        litrosPlanificados: Number(nuevo.litros_planificados), fechaPlanificada: String(nuevo.fecha_planificada).slice(0, 10),
        prioridad: Number(nuevo.prioridad), estado: nuevo.estado, origen: nuevo.origen,
        motivo: nuevo.motivo, observaciones: nuevo.observaciones,
        fermentador: (nuevo.fermentador as string | null) ?? datos.fermentador ?? null,
        diasOcupacion: nuevo.dias_ocupacion == null ? null : Number(nuevo.dias_ocupacion),
        fechaInicioReal: null, fechaFinReal: null, litrosReales: null,
      }])
      setMostrarFormLote(false)
      setSugerenciaModal(null)
      setAgregarProductoAbierto(false)
    } catch (e) {
      setErrorPlan(e instanceof Error ? e.message : 'Error al agregar el lote')
    } finally {
      setGuardandoPlan(false)
    }
  }

  /** Agrupa las alarmas de quiebre por producto — con 46+ combinaciones
   *  producto×envase, una grilla plana de tarjetas era imposible de barrer
   *  con la vista. Se agrupa (una foto por producto, formatos en lista
   *  debajo) conservando el orden de urgencia que ya trae `sugerenciasPlan`
   *  del servidor: el primer producto en aparecer es el que tiene el
   *  formato más próximo a quebrar. */
  const alarmasPorProducto = useMemo(() => {
    const grupos = new Map<string, { producto: string; categoria: 'cerveza' | 'kombucha'; items: SugerenciaPlan[] }>()
    for (const s of sugerenciasPlan) {
      if (!grupos.has(s.producto)) grupos.set(s.producto, { producto: s.producto, categoria: s.categoria, items: [] })
      grupos.get(s.producto)!.items.push(s)
    }
    return [...grupos.values()]
  }, [sugerenciasPlan])

  const [busquedaInsumo] = useState('')
  const [panelInsumosAbierto, setPanelInsumosAbierto] = useState<'stock' | 'mrp' | 'necesidad'>('stock')
  /** Horizonte del MRP en días. 30/60/90 para poder presupuestar a 1, 2 o 3
   *  meses — el forecast alcanza hasta abril 2027, así que los tres tienen
   *  dato real detrás (antes estaba fijo en 30 y no se podía presupuestar
   *  más allá del mes). */
  const [mrpHorizonteDias, setMrpHorizonteDias] = useState<30 | 60 | 90>(30)
  const [filtroCategoria, setFiltroCategoria] = useState<'todas' | 'cerveza' | 'kombucha'>('todas')
  const [filtroEnvase, setFiltroEnvase] = useState<string>('todos')
  /** Muestra la descomposición del modelo (tendencia + estacionalidad). */
  const [verModelo, setVerModelo] = useState(false)
  // Meses reales proyectados (yyyy-mm-01), no meses calendario 1-12: el
  // cálculo ahora sale del forecast, así que cada fila corresponde a un mes
  // concreto del horizonte y no tiene sentido ofrecer "Ene" si el forecast
  // no llega hasta enero.
  const mesesSeguridad = useMemo(
    () => [...new Set(stockSeguridad.map(s => s.mes))].sort(),
    [stockSeguridad]
  )

  const serieGeneral = series.find(s => s.nivel === 'general') ?? null

  const productosDisponibles = useMemo(
    () => [...new Set(series.filter(s => s.nivel === 'producto' && s.producto).map(s => s.producto!))].sort((a, b) => a.localeCompare(b)),
    [series]
  )
  /** Categoría de cada producto — para que las pastillas "Cerveza"/"Kombucha"
   *  sepan qué productos mostrar, tanto en Forecasting como en la
   *  Calculadora de Cobertura. Sale de la propia serie nivel='producto', que
   *  ya trae la categoría resuelta (costos_precios.categoria). */
  const categoriaPorProducto = useMemo(() => {
    const m = new Map<string, 'cerveza' | 'kombucha'>()
    for (const s of series) {
      if (s.nivel === 'producto' && s.producto && (s.categoria === 'cerveza' || s.categoria === 'kombucha')) {
        m.set(s.producto, s.categoria)
      }
    }
    return m
  }, [series])

  /* ── Selector de Forecasting, por pastillas conectadas ───────────────────
     Reemplaza el <select> único (difícil de buscar con ~90 combinaciones) por
     tres filas de pastillas que se acotan entre sí: Categoría (filtra qué
     productos/envases se ofrecen más abajo, no selecciona una serie por sí
     sola — no existe un forecast agregado "toda la kombucha"), Envase
     (Formato) y Producto. Decisión del usuario, 17-sep-2026.

     Resolución de qué serie mostrar, de más a menos específica:
       1) Producto + Envase → producto_envase (si esa combinación existe).
       2) Producto solo → producto (todos los formatos juntos).
       3) Envase solo (sin producto), con categoría en "Todas" → envase
          (agregado de ese formato en todo el catálogo — sí existe esa serie).
       4) Nada de lo anterior → general (consolidado). Cubre también el caso
          "sólo elegí una categoría": esa pastilla filtra la lista de abajo,
          pero como no hay serie agregada por categoría, el gráfico se queda
          en el consolidado hasta que además se elige un producto o envase. */
  const [filtroCategoriaForecast, setFiltroCategoriaForecast] = useState<'todas' | 'cerveza' | 'kombucha'>('todas')
  const [filtroEnvaseForecast, setFiltroEnvaseForecast] = useState<'todos' | EnvaseBucket>('todos')
  const [filtroProductoForecast, setFiltroProductoForecast] = useState<string | null>(null)

  const productosForecastDisponibles = useMemo(
    () => productosDisponibles.filter(p => {
      if (filtroCategoriaForecast !== 'todas' && categoriaPorProducto.get(p) !== filtroCategoriaForecast) return false
      if (filtroEnvaseForecast !== 'todos' && !series.some(s => s.nivel === 'producto_envase' && s.producto === p && s.envaseBucket === filtroEnvaseForecast)) return false
      return true
    }),
    [productosDisponibles, categoriaPorProducto, filtroCategoriaForecast, filtroEnvaseForecast, series]
  )
  const envasesForecastDisponibles = useMemo(
    () => ORDEN_ENVASE.filter(b => series.some(s =>
      s.nivel === 'producto_envase' && s.envaseBucket === b &&
      (!filtroProductoForecast || s.producto === filtroProductoForecast) &&
      (filtroCategoriaForecast === 'todas' || s.categoria === filtroCategoriaForecast)
    )),
    [series, filtroProductoForecast, filtroCategoriaForecast]
  )

  const serieActual = useMemo(() => {
    if (filtroProductoForecast && filtroEnvaseForecast !== 'todos') {
      const s = series.find(s => s.nivel === 'producto_envase' && s.producto === filtroProductoForecast && s.envaseBucket === filtroEnvaseForecast)
      if (s) return s
    }
    if (filtroProductoForecast) {
      const s = series.find(s => s.nivel === 'producto' && s.producto === filtroProductoForecast)
      if (s) return s
    }
    if (filtroEnvaseForecast !== 'todos' && filtroCategoriaForecast === 'todas') {
      const s = series.find(s => s.nivel === 'envase' && s.envaseBucket === filtroEnvaseForecast)
      if (s) return s
    }
    return serieGeneral
  }, [series, filtroProductoForecast, filtroEnvaseForecast, filtroCategoriaForecast, serieGeneral])

  // Elegir una categoría no filtra por sí sola una serie (no existe un
  // agregado "toda la kombucha") — si el producto elegido queda fuera de la
  // categoría nueva, se limpia para no dejar seleccionado algo que ya no
  // aparece en la lista de pastillas de abajo.
  const cambiarCategoriaForecast = useCallback((cat: 'todas' | 'cerveza' | 'kombucha') => {
    setFiltroCategoriaForecast(cat)
    setFiltroProductoForecast(prev => (prev && cat !== 'todas' && categoriaPorProducto.get(prev) !== cat ? null : prev))
  }, [categoriaPorProducto])

  // Ritmo del mes en curso: si vendimos X en D días HÁBILES, a ese ritmo el
  // ciclo completo cierra en X/D*diasHabilesEnCiclo — la forma más simple de
  // responder "¿vamos a cumplir lo proyectado?" sin esperar a que termine el
  // ciclo. Días hábiles, no calendario: el reparto no vende fin de semana,
  // así que dividir por días corridos subestimaba el ritmo real.
  const mtdLitros = serieActual?.litrosMesEnCurso ?? 0
  const ritmoProyectado = avanceMes.diasHabilesTranscurridos > 0
    ? (mtdLitros / avanceMes.diasHabilesTranscurridos) * avanceMes.diasHabilesEnCiclo
    : 0

  /* ── Litros ⇄ dinero neto en la pestaña Forecasting ───────────────────────
     El modelo y toda la planificación trabajan en LITROS; esto sólo cambia lo
     que se MUESTRA (gráfico, tarjetas y tabla de detalle), multiplicando por el
     precio neto por litro de la serie (ventas de los últimos 90 días, ver
     SerieForecast.precioNetoLitro). Toda la serie —historial y proyección— se
     valoriza al MISMO precio de hoy: así la comparación entre meses refleja
     volumen y no un cambio de lista de precios. No es un forecast de ingresos
     propio (el de Finanzas lo es); es "esos litros, a precio de hoy". La
     calculadora de cobertura se queda en litros: es una cuenta operativa. */
  const [monedaForecast, setMonedaForecast] = useState<'litros' | 'neto'>('litros')
  const precioNeto = serieActual?.precioNetoLitro ?? null
  const verNeto = monedaForecast === 'neto' && precioNeto != null
  /** Multiplicador de litros a lo que se muestra (1 = litros). */
  const kMoneda = verNeto ? precioNeto : 1
  /** Formatea un valor que YA está en la unidad mostrada. */
  const fUnidad = (n: number) => (verNeto ? fPesosCorto(n) : `${fNum(n)} L`)
  /** Para la tabla de detalle: cada fila trae su propio precio (sin precio, se queda en litros). */
  const valorSerie = (serie: SerieForecast, litros: number) =>
    monedaForecast === 'neto' && serie.precioNetoLitro != null ? fPesosCorto(litros * serie.precioNetoLitro) : `${fNum(litros)} L`


  /* ── Litros por lata, por producto ───────────────────────────────────────
     El bucket 'lata' fusiona 354ml y 473ml (ver EnvaseBucket en reglas.ts),
     así que no hay una conversión litros→latas fija: hay que sacarla del
     propio stock, donde el nombre crudo del ERP trae el tamaño ("Lata (473
     ml) de X"). En la práctica cada producto usa SIEMPRE un solo tamaño
     (verificado contra datos reales), así que basta con tomar el litraje de
     cualquier fila de stock en lata de ese producto y dividirlo por su
     cantidad de unidades. */
  const litrosPorLataPorProducto = useMemo(() => {
    const mapa = new Map<string, number>()
    for (const s of stock) {
      if (s.envaseBucket !== 'lata' || mapa.has(s.producto) || s.litros == null || s.cantidad <= 0) continue
      mapa.set(s.producto, s.litros / s.cantidad)
    }
    return mapa
  }, [stock])

  /** El ERP carga el formato de lata estándar como "Lata (354 ml)" en el
   *  nombre del producto (ver litrosLata en page.tsx), pero el tamaño físico
   *  real es 375 ml — corrección del usuario, 16-sep-2026. Sólo para ESTA
   *  conversión litros→unidades del gráfico de Forecasting: no se toca el
   *  litraje que ya usan Stock de Seguridad / Calculadora de Cobertura /
   *  Inventario Actual (viene del ERP tal cual, cantidad × 0.354), porque
   *  corregirlo ahí cambiaría números de stock disponible en todo el módulo
   *  — un cambio más grande que lo pedido acá. Se detecta por cercanía al
   *  valor mal cargado (0.354) en vez de comparar con el string crudo del
   *  ERP, que ya se perdió al armar litrosPorLataPorProducto. */
  const LITROS_LATA_ERP_MAL_CARGADO = 0.354
  const LITROS_LATA_REAL = 0.375

  /* ── Conversión litros → unidades para la serie del gráfico de Forecasting ──
     Sólo tiene sentido cuando la serie elegida es un producto×envase
     concreto: "Todos los formatos" o "Todos los productos" no tienen un
     tamaño de envase único que convertir. Barril es exacto (30L o 50L, el
     bucket ES el tamaño — ver bucketEnvase en reglas.ts); lata se estima del
     propio inventario físico porque el bucket mezcla dos tamaños (mismo
     criterio que litrosPorLataPorProducto arriba, reutilizado acá). */
  const unidadEnvaseSerieActual = useMemo(() => {
    if (!serieActual || serieActual.nivel !== 'producto_envase' || !serieActual.envaseBucket || !serieActual.producto) return null
    const bucket = serieActual.envaseBucket as EnvaseBucket
    if (bucket === 'barril_30') return { litrosPorUnidad: 30, nombre: UNIDAD_ENVASE.barril_30 }
    if (bucket === 'barril_50') return { litrosPorUnidad: 50, nombre: UNIDAD_ENVASE.barril_50 }
    if (bucket === 'lata') {
      const litrosPorLataERP = litrosPorLataPorProducto.get(serieActual.producto)
      if (!litrosPorLataERP) return null
      const litrosPorLata = Math.abs(litrosPorLataERP - LITROS_LATA_ERP_MAL_CARGADO) < 0.01
        ? LITROS_LATA_REAL
        : litrosPorLataERP
      return { litrosPorUnidad: litrosPorLata, nombre: UNIDAD_ENVASE.lata }
    }
    return null
  }, [serieActual, litrosPorLataPorProducto])





  /* ── Serie seleccionada → filas para Recharts ─────────────────────────
     La proyección arranca repitiendo el último mes real, para que las dos
     líneas queden pegadas en el gráfico en vez de mostrar un corte.

     El ritmo del mes en curso (litros hasta hoy extrapolados a mes
     completo) se dibuja como una línea PROPIA que también arranca del
     último mes real — igual que la verde — para que corra al lado de la
     proyección del modelo en la misma columna y se compare de un vistazo:
     ¿el ritmo actual queda arriba o abajo de lo que el modelo esperaba?
     Antes se probó conectar la venta real cruda (litros del mes a medias)
     directo a la línea de "Venta Real": comparada contra meses completos
     se veía como una caída al vacío, no como una proyección — engañoso.
     Extrapolar a mes completo es la comparación correcta. */
  const chartData = useMemo(() => {
    if (!serieActual) return []
    const puntos = [...serieActual.puntos].sort((a, b) => a.mes.localeCompare(b.mes))
    const idxCorte = puntos.findIndex(p => p.tipo === 'forecast')
    const idxUltimoReal = idxCorte > 0 ? idxCorte - 1 : puntos.length - 1
    const filas = puntos.map((p, i) => {
      const esUltimoReal = idxCorte > 0 && i === idxCorte - 1
      return {
        month: etiquetaMes(p.mes),
        mesIso: p.mes,
        // Todo se multiplica por kMoneda: 1 en litros, el precio neto por litro en modo dinero.
        ventaReal: p.tipo === 'historico' ? p.litros * kMoneda : null,
        ventaProyectada: p.tipo === 'forecast' || esUltimoReal ? p.litros * kMoneda : null,
        rango: p.litrosMin != null && p.litrosMax != null ? [p.litrosMin * kMoneda, p.litrosMax * kMoneda] : null,
        ritmo: i === idxUltimoReal ? p.litros * kMoneda : null,
        // Descomposición del modelo. `tendencia` se dibuja como línea sobre
        // toda la serie —incluido el historial— porque ahí es donde se ve que
        // el modelo la ajustó a los datos y no la inventó para el futuro.
        tendencia: p.tendencia != null ? p.tendencia * kMoneda : null,
        estacionalidad: p.estacionalidad != null ? p.estacionalidad * kMoneda : null,
      }
    })
    // El mes en curso puede no venir en `puntos` (el modelo lo excluyó del
    // historial y todavía no corrió con él como forecast, ej. recién
    // empezó el mes) — si falta, se agrega igual para no perder el ritmo.
    const yaEsta = filas.some(f => f.mesIso === avanceMes.mes)
    if (!yaEsta) {
      filas.push({
        month: etiquetaMes(avanceMes.mes), mesIso: avanceMes.mes,
        ventaReal: null, ventaProyectada: null, rango: null, ritmo: null,
        tendencia: null, estacionalidad: null,
      })
      filas.sort((a, b) => a.mesIso.localeCompare(b.mesIso))
    }
    const idxMesEnCurso = filas.findIndex(f => f.mesIso === avanceMes.mes)
    if (idxMesEnCurso >= 0) filas[idxMesEnCurso].ritmo = ritmoProyectado * kMoneda
    return filas
  }, [serieActual, avanceMes.mes, ritmoProyectado, kMoneda])

  /* ── Descomposición del modelo ─────────────────────────────────────────
     Sólo existe si la serie llegó a proyectarse (historial suficiente y no
     descontinuada); si no, el botón "Ver el modelo" ni se ofrece. */
  const hayDescomposicion = useMemo(
    () => chartData.some(d => d.tendencia != null),
    [chartData]
  )

  /** Primer mes proyectado, para poner números concretos en la ecuación. */
  const descomposicionProximo = useMemo(() => {
    const f = chartData.find(d => d.ventaReal == null && d.tendencia != null && d.estacionalidad != null)
    if (!f) return null
    return { mesIso: f.mesIso, tendencia: f.tendencia as number, estacionalidad: f.estacionalidad as number }
  }, [chartData])

  /** Curva estacional del año, promediando la componente `yearly` por mes
   *  calendario. Es la forma más directa de mostrar qué aprendió el modelo:
   *  no "diciembre vende más" dicho por alguien, sino cuántos litros estima
   *  que aporta cada mes por encima o debajo de la tendencia. */
  const curvaEstacional = useMemo(() => {
    const suma = new Array(12).fill(0)
    const n = new Array(12).fill(0)
    for (const d of chartData) {
      if (d.estacionalidad == null) continue
      const i = indiceMes(d.mesIso)
      suma[i] += d.estacionalidad
      n[i] += 1
    }
    if (!n.some(c => c > 0)) return []
    return MESES_CORTOS.map((mes, i) => ({ mes, efecto: n[i] > 0 ? suma[i] / n[i] : 0 }))
  }, [chartData])

  /* ── Ecuación del modelo, con las constantes REALES de esta corrida ──────
     Prophet ajusta y(t) = g(t) + s(t) + h(t) + εₜ. Acá h(t)=0 siempre: el
     modelo se entrena sin feriados (ver generar_forecast.py), así que se
     omite en vez de mostrar un término que nunca se usa.

     g(t) — tendencia — se recupera EXACTA, no aproximada: Prophet ajusta el
     crecimiento como lineal a trozos con quiebres (changepoints) dentro del
     historial, pero el tramo que va desde el último changepoint hacia
     adelante es una sola recta. Los puntos de `tendencia` del FORECAST caen
     todos en ese tramo final, así que una regresión sobre ellos devuelve la
     pendiente/intercepto que el modelo realmente está usando para proyectar
     — no un ajuste hecho a mano.

     s(t) — estacionalidad — es la parte que sí se aproxima: Prophet la ajusta
     como una suma de varios armónicos de Fourier, y acá se muestra el
     armónico principal (un único seno) con la amplitud y fase que mejor
     calzan con `curvaEstacional` (el promedio real de `estacionalidad` por
     mes calendario). Es una simplificación visual, no la fórmula interna
     completa — se lo aclara en el pie de la tarjeta.

     t se mide en MESES DESDE EL PRIMER MES PROYECTADO (t=0), para que las
     constantes tengan el mismo significado que "Próximo mes" en el resto del
     panel. Se recalcula solo con cada corrida nueva del modelo (chartData/
     curvaEstacional salen de `series`, que viene del servidor). */
  const ecuacionModelo = useMemo(() => {
    const futuros = chartData
      .filter(d => d.ventaReal == null && d.tendencia != null)
      .sort((a, b) => a.mesIso.localeCompare(b.mesIso))
    if (futuros.length === 0 || curvaEstacional.length === 0) return null

    const n = futuros.length
    const ys = futuros.map(f => f.tendencia as number)
    let k = 0
    const m = ys[0]
    if (n >= 2) {
      const xs = futuros.map((_, i) => i)
      const mediaX = xs.reduce((a, b) => a + b, 0) / n
      const mediaY = ys.reduce((a, b) => a + b, 0) / n
      let num = 0, den = 0
      for (let i = 0; i < n; i++) { num += (xs[i] - mediaX) * (ys[i] - mediaY); den += (xs[i] - mediaX) ** 2 }
      k = den !== 0 ? num / den : 0
    }

    // A y fase del armónico principal: proyección de Fourier de mínimos
    // cuadrados de curvaEstacional sobre sin(2π·t/12), no "amplitud por
    // (máximo−mínimo)/2 con fase ajustada al mes pico". La curva real de
    // estacionalidad casi nunca es una sinusoide limpia (acá tiene un pico
    // marcado en enero-febrero y una meseta baja en invierno), así que
    // amplitud+pico se probó contra los datos reales y quedaba lejos del
    // valor real en varios meses (RMSE ~1735 L); esta proyección es el mejor
    // ajuste posible de UN solo seno (RMSE ~1331 L) — sigue siendo una
    // aproximación (Prophet usa varios armónicos), pero es la más cercana
    // posible con una función de una sola línea.
    const mesT0Idx = indiceMes(futuros[0].mesIso)
    let a = 0, b = 0
    for (let i = 0; i < 12; i++) {
      const tDesdeT0 = ((i - mesT0Idx) % 12 + 12) % 12
      const theta = (2 * Math.PI * tDesdeT0) / 12
      a += curvaEstacional[i].efecto * Math.sin(theta)
      b += curvaEstacional[i].efecto * Math.cos(theta)
    }
    a *= 2 / 12; b *= 2 / 12
    const A = Math.hypot(a, b)
    const fase = Math.atan2(b, a)

    return { k, m, A, fase, t0mes: futuros[0].mesIso }
  }, [chartData, curvaEstacional])

  /* ── Temporada alta (Dic–Feb): tramos consecutivos para las ReferenceArea ── */
  const tramosTemporadaAlta = useMemo(() => {
    const tramos: { x1: string; x2: string }[] = []
    let inicio: string | null = null
    let previo: string | null = null
    for (const fila of chartData) {
      const alta = [11, 0, 1].includes(indiceMes(fila.mesIso))
      if (alta && inicio === null) inicio = fila.month
      if (!alta && inicio !== null && previo !== null) {
        tramos.push({ x1: inicio, x2: previo })
        inicio = null
      }
      previo = fila.month
    }
    if (inicio !== null && previo !== null) tramos.push({ x1: inicio, x2: previo })
    return tramos
  }, [chartData])


  const precisionSerie = serieActual?.mape != null ? Math.max(0, 100 - serieActual.mape) : null



  /* ── Tabla de detalle producto × envase, debajo del gráfico ────────────
     Cada fila es una combinación real (ej. "Doble IPA — Barril 30L").
     Filtrable por categoría (cerveza/kombucha) y por tipo de envase;
     agrupada visualmente por producto para no repetir el nombre en cada
     línea de envase. */
  const envasesDisponibles = useMemo(() => {
    const set = new Set(series.filter(s => s.nivel === 'producto_envase' && s.envaseBucket).map(s => s.envaseBucket as string))
    return [...set]
  }, [series])

  const filasTablaDetalle = useMemo(() => {
    return series
      .filter(s => s.nivel === 'producto_envase')
      .filter(s => filtroCategoria === 'todas' || s.categoria === filtroCategoria)
      .filter(s => filtroEnvase === 'todos' || s.envaseBucket === filtroEnvase)
      .map(s => {
        const proximo = s.puntos.filter(p => p.tipo === 'forecast').sort((a, b) => a.mes.localeCompare(b.mes))[0] ?? null
        return { serie: s, proximo }
      })
      .sort((a, b) => (a.serie.producto ?? '').localeCompare(b.serie.producto ?? '') || (a.serie.envaseBucket ?? '').localeCompare(b.serie.envaseBucket ?? ''))
  }, [series, filtroCategoria, filtroEnvase])


  /* ── Agrupado por producto, segmentado por formato ──────────────────────
     Antes la tabla ordenaba TODAS las filas por estado global, así que los
     3 formatos de un mismo producto quedaban dispersos en secciones
     distintas (crítico/bajo/ok) — confundía qué número era de qué envase
     (bug real reportado: "el barril de West Coast dice 87L", cuando 87L era
     la fila de Lata, a varias pantallas de las filas de Barril del mismo
     producto). Ahora se agrupa por producto (con su foto, mismo patrón que
     Inventario Actual) y cada formato queda SIEMPRE en el mismo orden
     (Barril 30L, Barril 50L, Lata, Otros) debajo de su producto. */






  /* ══════════ MOTOR DE PLANIFICACIÓN DE PRODUCCIÓN ══════════
     UN solo cálculo arma todo el plan; el calendario diario, el resumen
     mensual y los avisos son proyecciones de ESE resultado.

     El motor es una SIMULACIÓN DÍA A DÍA del inventario de cada producto a
     lo largo del horizonte, no un reparto de "cuánto falta este mes". Ese
     cambio es el que arregla el defecto que se veía en pantalla: cuando el
     plan se armaba por mes, todas las cocciones caían amontonadas el mismo
     día (el primero disponible), porque la única fecha que existía era "lo
     antes posible". Acá cada cocción nace de un evento propio del producto
     —su stock cayó al punto de reorden— así que se reparten solas en el
     tiempo, cada una en el día en que de verdad hay que prenderla.

     El ciclo que simula, por producto:
       1. ARRANQUE: la primera cocción va en la fecha que ya propone el Plan
          Maestro (`fechaLimiteInicio` de la alarma de quiebre: el último día
          hábil para cocer y todavía llegar). Es el mismo número que el
          usuario ve en "Alarmas de quiebre de stock" — las dos pantallas no
          pueden decir fechas distintas para lo mismo.
       2. LISTO: esa cocción entra a bodega en inicio + lead time y ahí
          recién suma stock vendible.
       3. CONSUMO: el stock baja todos los días al ritmo del forecast del mes
          que corresponda (por eso el plan se reacomoda solo cuando el
          forecast se recalcula el día 24).
       4. REORDEN: cuando el inventario proyectado (stock + lo que viene en
          camino) toca el PUNTO DE REORDEN del producto, se dispara la
          siguiente cocción. Y así hasta el fin del horizonte.

     Lo que limita al ciclo —y sin esto el calendario sería una lista de
     deseos, no un plan:
       • TAMAÑO REAL de los fermentadores: cada cocción se acota a un tanque
         que existe. Lo que no cabe queda para el siguiente reorden.
       • LÍNEA del tanque: los T sólo cervecería, los K sólo kombuchería.
       • OCUPACIÓN en el tiempo: un tanque queda tomado el lead time completo,
         y los que hoy tienen producto recién se liberan en su fecha estimada
         de embarrilado (dato real del ERP). Si el día del reorden no hay
         tanque libre de la línea, la cocción NO se inventa: espera, y esos
         días de espera quedan registrados (`diasTarde`) — es capacidad
         faltante, y así se ve.
       • PRIORIDAD para repartir tanques escasos: primero lo que ya tiene
         alarma de quiebre real, después línea fija, después orden alfabético
         para que el resultado sea estable entre cargas.

     "Llega tarde" lo decide la propia simulación: si el stock del producto
     cruza cero mientras la cocción viene en camino, ese lote se marca como
     que no alcanzó. No es una comparación contra el borde del mes. */
  /** Con cuántos meses arranca el selector de horizonte de abajo — no tiene
   *  ningún efecto sobre qué queda marcado en el presupuesto (eso ahora es
   *  uniforme: nada arranca marcado, ver `estaSeleccionado` más abajo). Es
   *  sólo el valor inicial antes de que el usuario toque los atajos. */
  const HORIZONTE_PLAN_INICIAL = 3

  /** Cuántos meses simula el motor — antes era una constante fija en 3, así
   *  que el calendario nunca pasaba de noviembre. Ahora es ajustable
   *  (selector más abajo) y tiene un solo tope real: no hay forecast más
   *  allá de `mesesSeguridad`, así que pedirle más al motor no agrega
   *  cocciones nuevas, sólo un horizonte vacío. */
  const [horizontePlanMeses, setHorizontePlanMeses] = useState(HORIZONTE_PLAN_INICIAL)
  const horizontePlanMax = mesesSeguridad.length || HORIZONTE_PLAN_INICIAL

  /** Cocciones que el usuario movió a mano arrastrándolas en el calendario:
   *  `producto|Nº de cocción` → fecha pedida. La clave NO es el id del lote
   *  porque al mover una cocción se vuelve a simular todo lo que viene
   *  detrás y los ids se regeneran; "la 2ª cocción de Mocho English" sí
   *  sobrevive a esa regeneración. */
  const [anclasCoccion, setAnclasCoccion] = useState<Map<string, string>>(new Map())

  /** Detalle de una cocción del calendario, en dos modos (ver
   *  PopoverCoccion.tsx): `preview` al pasar el cursor —sólo lectura, se
   *  cierra solo— y `fijado` al hacer clic, que es donde viven las acciones.
   *
   *  Antes era un único tooltip de hover que además contenía el `<select>` de
   *  tanque: el control real estaba en un panel que se cerraba al mover el
   *  mouse, y en pantalla táctil no se podía abrir de ninguna forma. Separar
   *  los dos modos es lo que resuelve las dos cosas a la vez. */
  const [detalleCoccion, setDetalleCoccion] = useState<
    { lote: (typeof planSugerido.lotes)[number]; rect: DOMRect; modo: 'preview' | 'fijado' } | null
  >(null)
  // Margen antes de cerrar el preview: sin esto, mover el mouse del chip hacia
  // el propio panel lo cierra a mitad de camino, porque el panel vive en un
  // portal y entre los dos hay un hueco sin ningún elemento encima.
  const cierrePreviewRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancelarCierrePreview = () => {
    if (cierrePreviewRef.current) { clearTimeout(cierrePreviewRef.current); cierrePreviewRef.current = null }
  }
  const programarCierrePreview = () => {
    cancelarCierrePreview()
    cierrePreviewRef.current = setTimeout(() => {
      setDetalleCoccion(prev => (prev?.modo === 'fijado' ? prev : null))
    }, 140)
  }
  const fijarDetalle = (lote: (typeof planSugerido.lotes)[number], rect: DOMRect) => {
    cancelarCierrePreview()
    setDetalleCoccion({ lote, rect, modo: 'fijado' })
  }
  const cerrarDetalle = () => { cancelarCierrePreview(); setDetalleCoccion(null) }

  const anclarCoccion = (producto: string, nro: number, fechaISO: string) => {
    setAnclasCoccion(prev => new Map(prev).set(`${producto}|${nro}`, fechaISO))
  }

  /** Igual que `anclasCoccion` pero para el TANQUE — el usuario elige a mano
   *  en qué fermentador cocer, desde el desplegable de la tarjeta. Misma
   *  clave `producto|Nº de cocción` y mismo motivo: al recalcular el plan
   *  los ids se regeneran, pero "la 2ª cocción de Mocho English" no. */
  const [anclasTanque, setAnclasTanque] = useState<Map<string, string>>(new Map())
  const anclarTanque = (producto: string, nro: number, tanque: string) => {
    setAnclasTanque(prev => {
      const siguiente = new Map(prev)
      if (tanque) siguiente.set(`${producto}|${nro}`, tanque); else siguiente.delete(`${producto}|${nro}`)
      return siguiente
    })
  }
  const limpiarAnclas = () => { setAnclasCoccion(new Map()); setAnclasTanque(new Map()) }

  /** Arrastre del calendario (Pointer Events: mouse, lápiz y dedo por el mismo
   *  camino — ver useArrastreCalendario.ts). Dos cargas posibles:
   *
   *   · `coccion`    — una cocción ya planificada que se MUEVE de día. Queda
   *                    anclada a esa fecha y el plan se re-simula desde ahí.
   *   · `sugerencia` — un producto que el modelo pide cocer pero que todavía
   *                    no existe como lote. Soltarlo en un día lo CREA en el
   *                    Plan Maestro con esa fecha, sin pasar por el modal.
   *
   *  No se puede soltar en el pasado: una cocción no se agenda para ayer. */
  /* ── Gantt de ocupación de fermentadores ──────────────────────────────
     Reemplaza a las dos grillas de calendario que había antes (una en
     "Cuándo cocer" con las sugerencias y otra en Resumen con lo confirmado):
     mostraban la misma planta en dos lugares con dos criterios distintos.
     Acá hay una sola foto — filas = tanques, columnas = días corridos. */

  const [configGantt, setConfigGantt] = useState<ConfigProducto[]>(configProductos)
  const [configAbierta, setConfigAbierta] = useState(false)
  /** Ver el comentario de leerProyeccionAbierta/guardarProyeccionAbierta:
   *  arranca plegada y se recuerda entre sesiones. */
  const proyeccionCargaAbierta = useSyncExternalStore(suscribirProyeccionAbierta, leerProyeccionAbierta, () => false)
  const [agregarProductoAbierto, setAgregarProductoAbierto] = useState(false)
  /** Correcciones de fecha para lotes 'en_tanque' — ver ajuste_lote_tanque.
   *  En estado local (no derivado en cada render de la prop) para que
   *  guardar una corrección se sienta al toque, igual que mover un lote en
   *  el Gantt. */
  const [ajustesTanque, setAjustesTanque] = useState<AjusteTanque[]>(ajustesTanqueIniciales)
  const [editarTanqueAbierto, setEditarTanqueAbierto] = useState<{
    tanque: string; codigoLote: string; producto: string; categoria: 'cerveza' | 'kombucha'
    inicioISO: string; embarrilladoISO: string | null; rect: DOMRect
  } | null>(null)
  const [guardandoAjusteTanque, setGuardandoAjusteTanque] = useState(false)
  const [errorAjusteTanque, setErrorAjusteTanque] = useState<string | null>(null)
  /** Bloque que acaba de moverse, para que el Gantt lo haga aterrizar con un
   *  latido. Se limpia solo: es feedback de un gesto, no estado del plan. */
  const [bloqueRecienMovido, setBloqueRecienMovido] = useState<string | null>(null)
  const marcarMovido = useCallback((id: string) => {
    setBloqueRecienMovido(id)
    setTimeout(() => setBloqueRecienMovido(a => (a === id ? null : a)), 800)
  }, [])

  /** Los callbacks del arrastre se crean una vez (deps vacías a propósito,
   *  para no re-suscribir listeners a mitad del gesto), así que leen el plan
   *  y la categoría en curso por ref en vez de por closure. */
  const arrastreCategoriaRef = useRef<'cerveza' | 'kombucha' | null>(null)

  const diasDe = useCallback((producto: string, categoria: 'cerveza' | 'kombucha') => {
    const c = configGantt.find(x => x.producto === producto)
    // Sin configuración propia, el default por línea: son los del Gantt que
    // se llevaba en Excel, convertidos de días hábiles a corridos.
    return c?.diasFermentacion ?? (categoria === 'cerveza' ? 24 : 12)
  }, [configGantt])

  /** Mueve un lote confirmado. El bloque cambia de lugar AL SOLTAR (antes se
   *  quedaba en la posición vieja hasta que respondía el servidor, que además
   *  esperaba a Google Calendar). Si el servidor falla, vuelve a donde estaba
   *  y se avisa. */
  const moverLoteEnGantt = useCallback(async (id: string, destino: DestinoArrastre) => {
    const antes = planRef.current.find(l => l.id === id)
    if (!antes) return
    setPlan(p => p.map(l => l.id === id
      ? { ...l, fechaPlanificada: destino.fecha, fermentador: destino.fermentador }
      : l))
    try {
      const r = await fetch(`/api/produccion/plan/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fechaPlanificada: destino.fecha, fermentador: destino.fermentador }),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo mover el lote')
    } catch (e) {
      setPlan(p => p.map(l => l.id === id
        ? { ...l, fechaPlanificada: antes.fechaPlanificada, fermentador: antes.fermentador }
        : l))
      setErrorPlan(e instanceof Error ? e.message : 'No se pudo mover el lote')
    }
  }, [])

  const puedeSoltarEnCelda = useCallback((destino: DestinoArrastre) => {
    if (destino.fecha < hoyLocalISO()) return false
    // Un tanque de cerveza no fermenta kombucha y al revés: la celda de la
    // otra línea no es un destino válido, y se apaga mientras se arrastra en
    // vez de dejar soltar y avisar después.
    if (destino.fermentador) {
      const t = ocupacionPlanta.tanques.find(x => x.tanque === destino.fermentador)
      const cat = arrastreCategoriaRef.current
      if (t && cat && t.categoria !== cat) return false
    }
    return true
  }, [ocupacionPlanta.tanques])

  const alSoltarEnCelda = useCallback((carga: CargaArrastre, destino: DestinoArrastre) => {
    if (carga.tipo === 'coccion') {
      // Mover una cocción YA CONFIRMADA. Se busca por `carga.id` — el id real
      // de plan_produccion — y no por producto: dos lotes confirmados del
      // mismo producto (agregar uno nuevo a mano cuando ya había otro en la
      // cola) tienen el mismo `producto` y el mismo `loteNro` bobo (los
      // lotes agregados a mano no traen numeración de cocción), así que
      // buscar por nombre encontraba SIEMPRE el primero de la cola y
      // arrastrar el segundo terminaba moviendo el primero.
      //
      // Tampoco se anclan `anclasCoccion`/`anclasTanque` acá: esas dos existen
      // para que `planSugerido` — la SIMULACIÓN de lo que conviene cocer —
      // respete una fecha o tanque que el usuario fijó a mano para una
      // cocción SUGERIDA. Un lote ya confirmado no pasa por esa simulación
      // (planSugerido nunca lee plan_produccion), así que anclarlo con su
      // `loteNro` bobo sólo podía contaminar el ancla real de otra cocción
      // sugerida del mismo producto que sí cayera en el slot "1".
      const lote = planRef.current.find(l => l.id === carga.id && l.estado !== 'cancelado')
      if (lote) { marcarMovido(lote.id); void moverLoteEnGantt(lote.id, destino) }
      return
    }
    void agregarLote({
      producto: carga.producto,
      categoria: carga.categoria,
      litrosPlanificados: carga.litros,
      fechaPlanificada: destino.fecha,
      motivo: carga.motivo ?? 'Arrastrado al Gantt desde las sugerencias del modelo',
      origen: 'sugerido',
      necesidadCubrir: carga.necesidadCubrir ?? null,
      cubreHasta: carga.cubreHasta ?? null,
      fermentador: destino.fermentador,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const { store: arrastreStore, fantasmaRef, propsOrigen } = useArrastreCalendario({
    onSoltar: alSoltarEnCelda,
    puedeSoltarEn: puedeSoltarEnCelda,
  })
  /** propsOrigen para el Gantt: además guarda la línea (cerveza/kombucha) de
   *  lo que se levanta, porque puedeSoltarEnCelda corre en un listener global
   *  que no la puede leer del closure. Estable (useCallback) para que las
   *  filas memorizadas del Gantt no se redibujen sin motivo. */
  const propsOrigenGantt = useCallback((carga: CargaArrastre, habilitado?: boolean) => {
    const base = propsOrigen(carga, habilitado) as Record<string, unknown>
    const onPointerDown = base.onPointerDown as ((e: React.PointerEvent) => void) | undefined
    if (!onPointerDown) return base
    return {
      ...base,
      onPointerDown: (e: React.PointerEvent) => {
        arrastreCategoriaRef.current = carga.categoria
        onPointerDown(e)
      },
    }
  }, [propsOrigen])
  /** Quitar un bloque confirmado del Gantt: un clic o Supr, con "Deshacer". */
  const quitarBloqueGantt = useCallback((b: BloqueGantt) => {
    if (b.tipo === 'confirmado') void quitarLoteConDeshacer(b.id)
  }, [quitarLoteConDeshacer])

  /** Cocciones que la sala puede sacar en un día POR LÍNEA (cervecería y
   *  kombuchería son procesos separados, así que el tope es por cada una).
   *
   *  Sin este tope el calendario era físicamente imposible: como casi todos
   *  los productos ya están bajo su punto de reorden HOY, los 14 disparaban
   *  el mismo día y el plan mostraba 14 cocciones en una sola jornada. Tener
   *  tanque libre no significa poder macerar: la olla es una sola.
   *
   *  Si el número real es otro, se cambia acá y todo el plan se reacomoda
   *  solo — es el único lugar donde vive el supuesto. */
  const COCCIONES_POR_DIA_LINEA = 2


  const planSugerido = useMemo(() => {
    const hoyISO = hoyLocalISO()
    const sumarDiasCalISO = (desde: string, dias: number) =>
      new Date(Date.parse(`${desde}T00:00:00Z`) + dias * 86400000).toISOString().slice(0, 10)
    const diffDias = (a: string, b: string) =>
      Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000)
    const mesDe = (iso: string) => iso.slice(0, 8) + '01'

    interface LoteSugerido {
      id: string; producto: string; categoria: 'cerveza' | 'kombucha'
      litros: number; tanque: string; capacidadTanque: number
      fechaInicio: string; fechaListo: string
      /** Mes en que se COCE (el que agrupa el calendario y el resumen). */
      mes: string
      /** Día en que el reorden pidió esta cocción; si no había tanque libre,
       *  `fechaInicio` es posterior y la diferencia son los `diasTarde`. */
      fechaObjetivo: string; diasTarde: number
      leadTimeSemanas: number; conAlarma: boolean
      loteNro: number; loteDe: number
      /** Cuándo se agota lo que hay si esta cocción no llegara. */
      fechaAgotamiento: string
      /** Hasta cuándo alcanza el stock UNA VEZ que entra esta cocción. */
      cubreHasta: string
      /** El stock no llegó a cero mientras este lote venía en camino. */
      llegaATiempo: boolean
      /** true = NO es una sugerencia: ya está fermentando en el tanque. Se
       *  muestra en el calendario el día que sale, no el día que entró. */
      enCurso: boolean
      /** true si esta cocción está anclada a una fecha que el usuario eligió
       *  arrastrándola en el calendario, en vez de a su punto de reorden. */
      movidoManual: boolean
      /** true si el TANQUE lo eligió el usuario (desplegable de la tarjeta),
       *  no el modelo. Cuando es así, `litros` es la capacidad completa del
       *  tanque elegido, no sólo lo que pedía el punto de reorden — llenarlo
       *  entero cuesta la misma merma que llenarlo a medias, y el excedente
       *  sobre lo pedido queda como stock: la propia simulación lo descuenta
       *  del consumo de los meses siguientes y corre sola la próxima cocción
       *  más adelante (se ve reflejado en `cubreHasta`). */
      tanqueManual: boolean
      /** Sólo para `enCurso`: la fecha de embarrilado ESTIMADA tal cual la
       *  trae el ERP, sin ajustar — puede estar vencida (el enólogo calculó
       *  una fecha y el embarrilado se corrió). El calendario la usa para
       *  posicionar el chip, en vez de `fechaListo` (que sí se recorta a hoy
       *  como mínimo, porque ésa alimenta la simulación de stock y no puede
       *  sumar litros en un día que ya pasó). Null para todo lo demás: las
       *  cocciones sugeridas no tienen esta ambigüedad, `fechaListo` ya es
       *  la fecha real proyectada. */
      fechaEmbarriladoReal: string | null
    }
    interface MesPlan {
      mes: string; etiqueta: string
      litrosCerveza: number; litrosKombucha: number
      lotesCerveza: number; lotesKombucha: number
      lotesTarde: number; severidad: 'critico' | 'ajustado' | 'ok'
    }
    const vacio = {
      lotes: [] as LoteSugerido[],
      porMes: [] as MesPlan[],
      sinTanque: [] as { producto: string; litros: number; motivo: string }[],
    }

    const filasProducto = stockSeguridad.filter(s => s.nivel === 'producto')
    const meses = [...new Set(filasProducto.map(s => s.mes))].sort().slice(0, horizontePlanMeses)
    if (meses.length === 0 || ocupacionPlanta.tanques.length === 0) return vacio

    // El horizonte termina al cerrar el último mes proyectado.
    const [uAnio, uMes] = meses[meses.length - 1].split('-').map(Number)
    const finISO = new Date(Date.UTC(uAnio, uMes, 1)).toISOString().slice(0, 10)

    /* La fecha de arranque sale del Plan Maestro (mismo dato que la pantalla
       de alarmas), no de un cálculo paralelo: si las dos vistas propusieran
       fechas distintas para la misma cocción, el plan deja de ser creíble. */
    const alarmaPorProducto = new Map<string, string>()
    for (const g of alarmasPorProducto) {
      const f = g.items.map(i => i.fechaLimiteInicio).filter((x): x is string => x != null).sort()[0]
      if (f) alarmaPorProducto.set(g.producto, f)
    }
    const lineaFijaPorProducto = new Set(sugerenciasPlan.filter(s => s.lineaFija).map(s => s.producto))

    /* ── 1. Estado inicial de cada producto ───────────────────────────── */
    interface ParamsMes {
      mes: string; consumoDiario: number
      puntoReorden: number; stockSeguridad: number; demandaMensual: number
    }
    interface Estado {
      producto: string; categoria: 'cerveza' | 'kombucha'
      leadTimeSemanas: number; leadDias: number
      lineaFija: boolean; conAlarma: boolean
      forzarEl: string | null
      stock: number
      enCamino: LoteSugerido[]
      params: ParamsMes[]
      pendienteDesde: string | null
      nro: number
      faltante: number
    }
    const estados = new Map<string, Estado>()
    for (const s of filasProducto) {
      if (!meses.includes(s.mes)) continue
      let e = estados.get(s.producto)
      if (!e) {
        const alarma = alarmaPorProducto.get(s.producto)
        e = {
          producto: s.producto, categoria: s.categoria,
          leadTimeSemanas: s.leadTimeSemanas, leadDias: Math.round(s.leadTimeSemanas * 7),
          lineaFija: lineaFijaPorProducto.has(s.producto), conAlarma: !!alarma,
          // Una alarma vencida (el plazo ya pasó) no se agenda en el pasado:
          // se cuece hoy, que es lo antes que se puede hacer algo.
          forzarEl: alarma ? (alarma > hoyISO ? alarma : hoyISO) : null,
          /* SÓLO lo que está envasado en bodega. Los litros que están en un
             fermentador AHORA no son stock: no se pueden vender hasta que se
             embarrilen. Entran más abajo como lotes en curso, con su fecha
             real de salida. Contarlos acá —como se hacía— hacía creer que el
             producto estaba cubierto hoy y atrasaba la cocción siguiente:
             Fisura tiene 3.000 L en el Bright tank T4 que recién salen el
             22-sep, y el plan le daba CERO cocciones en tres meses. */
          stock: s.stockActualLitros ?? 0,
          enCamino: [], params: [], pendienteDesde: null, nro: 0, faltante: 0,
        }
        estados.set(s.producto, e)
      }
      e.params.push({
        mes: s.mes,
        // El consumo se prorratea sobre días corridos: la venta real es de
        // lunes a viernes, pero acá sólo define CUÁNDO se gatilla el reorden,
        // no cuántos litros se cuecen.
        consumoDiario: s.demandaMensualProyectada / 30,
        puntoReorden: s.puntoReordenLitros,
        stockSeguridad: s.stockSeguridadLitros,
        demandaMensual: s.demandaMensualProyectada,
      })
    }
    for (const e of estados.values()) e.params.sort((a, b) => a.mes.localeCompare(b.mes))
    const paramsDe = (e: Estado, mes: string): ParamsMes => {
      let elegido = e.params[0]
      for (const p of e.params) if (p.mes <= mes) elegido = p
      return elegido
    }

    const lotes: LoteSugerido[] = []
    const sinTanque: { producto: string; litros: number; motivo: string }[] = []

    /* ── 1b. Lo que HOY está en los fermentadores ─────────────────────────
       El plan tiene que conversar con la planta real: cada tanque con
       producto es una cocción que ya ocurrió y que va a aterrizar en bodega
       en una fecha concreta. Entra al modelo como un lote EN CURSO —no como
       stock disponible— así que:
         · suma recién el día que se embarrila (y hasta entonces el producto
           puede quebrar, que es justo lo que hay que ver),
         · deja el tanque tomado hasta esa fecha,
         · y aparece en el calendario, para que se vea junto a lo sugerido.
       La fecha viene del ERP (columna "Fecha embarrilado estimada"). Puede
       venir VENCIDA —hoy 3 de los 4 tanques la tienen— porque es la fecha
       que calculó el enólogo y el embarrilado se corrió: en ese caso se toma
       hoy, que es lo antes que ese volumen puede estar disponible. */
    const enCursoPorProducto = new Map<string, number>()
    for (const sf of splitFermentadores) {
      const e = estados.get(sf.producto)
      if (!e) continue
      for (const t of sf.tanques) {
        if (t.litros <= 0) continue
        const sale = t.fechaEstimada && t.fechaEstimada > hoyISO ? t.fechaEstimada : hoyISO
        const lote: LoteSugerido = {
          id: `curso|${t.nombre}|${sf.producto}`,
          producto: sf.producto, categoria: e.categoria,
          litros: Math.round(t.litros), tanque: t.nombre,
          capacidadTanque: ocupacionPlanta.tanques.find(x => x.tanque === t.nombre)?.capacidadLitros ?? t.litros,
          // Una cocción en curso no tiene fecha de inicio conocida (el ERP no
          // la trae): se retrocede el lead time desde la salida, sólo para
          // poder ordenarla. Lo que importa y se muestra es `fechaListo`.
          fechaInicio: sumarDiasCalISO(sale, -e.leadDias),
          fechaListo: sale, mes: mesDe(sale),
          fechaObjetivo: sale, diasTarde: 0,
          leadTimeSemanas: e.leadTimeSemanas, conAlarma: e.conAlarma,
          loteNro: 0, loteDe: 0,
          fechaAgotamiento: sale, cubreHasta: sale,
          llegaATiempo: true, enCurso: true, movidoManual: false, tanqueManual: false,
          fechaEmbarriladoReal: t.fechaEstimada ?? null,
        }
        e.enCamino.push(lote)
        lotes.push(lote)
        enCursoPorProducto.set(sf.producto, (enCursoPorProducto.get(sf.producto) ?? 0) + lote.litros)
      }
    }
    /* Red de seguridad: si el informe declara litros en producción de un
       producto que el split no desglosó por tanque, esos litros no se
       pierden — entran con la fecha estimada del producto, o con un lead
       time completo si tampoco hay. */
    for (const s of filasProducto) {
      if (s.mes !== meses[0]) continue
      const e = estados.get(s.producto)
      if (!e) continue
      const faltan = Math.round(s.litrosEnProduccion - (enCursoPorProducto.get(s.producto) ?? 0))
      if (faltan < 1) continue
      const sf = splitFermentadores.find(x => x.producto === s.producto)
      const sale = sf?.fechaDisponibleEstimada && sf.fechaDisponibleEstimada > hoyISO
        ? sf.fechaDisponibleEstimada
        : sumarDiasCalISO(hoyISO, e.leadDias)
      e.enCamino.push({
        id: `curso|sintanque|${s.producto}`,
        producto: s.producto, categoria: e.categoria,
        litros: faltan, tanque: '—', capacidadTanque: faltan,
        fechaInicio: sumarDiasCalISO(sale, -e.leadDias), fechaListo: sale, mes: mesDe(sale),
        fechaObjetivo: sale, diasTarde: 0,
        leadTimeSemanas: e.leadTimeSemanas, conAlarma: e.conAlarma,
        loteNro: 0, loteDe: 0, fechaAgotamiento: sale, cubreHasta: sale,
        llegaATiempo: true, enCurso: true, movidoManual: false, tanqueManual: false,
        fechaEmbarriladoReal: sf?.fechaDisponibleEstimada ?? null,
      })
    }

    /* ── 2. Desde cuándo queda libre cada tanque ──────────────────────── */
    const libreDesde = new Map<string, string>()
    for (const t of ocupacionPlanta.tanques) libreDesde.set(t.tanque, hoyISO)
    for (const sf of splitFermentadores) {
      const leadDias = (sf.categoria === 'kombucha' ? 3 : 4) * 7
      for (const t of sf.tanques) {
        if (t.litros <= 0) continue
        // Sin fecha del ERP se asume un lead time completo desde hoy:
        // preferible pasarse de conservador a planificar sobre un tanque
        // que en realidad sigue ocupado.
        libreDesde.set(t.nombre, t.fechaEstimada ?? sumarDiasCalISO(hoyISO, leadDias))
      }
    }

    /* ── 3. Simulación día a día ──────────────────────────────────────── */
    const orden = [...estados.values()].sort((a, b) =>
      Number(b.conAlarma) - Number(a.conAlarma) ||
      Number(b.lineaFija) - Number(a.lineaFija) ||
      a.producto.localeCompare(b.producto)
    )
    for (let d = hoyISO; d < finISO; d = sumarDiasCalISO(d, 1)) {
      const mesHoy = mesDe(d)
      /* Cupo de la sala de cocción para ESTE día. Sábados, domingos y
         feriados no tienen cupo: nadie macera un 18 de septiembre. El stock
         igual se sigue vendiendo y consumiendo esos días — lo único que no
         pasa es que se prenda la olla. */
      const coccionesHoy = new Map<'cerveza' | 'kombucha', number>()
      const diaHabil = esDiaHabilISO(d)
      for (const e of orden) {
        const p = paramsDe(e, mesHoy)

        // a) Llega lo que estaba en camino.
        const llegan = e.enCamino.filter(l => l.fechaListo === d)
        if (llegan.length > 0) {
          for (const l of llegan) e.stock += l.litros
          e.enCamino = e.enCamino.filter(l => l.fechaListo !== d)
        }

        // b) Se vende el día.
        e.stock -= p.consumoDiario
        if (e.stock < 0) {
          // Quiebre proyectado: lo que venga en camino ya no alcanzó.
          for (const l of e.enCamino) l.llegaATiempo = false
        }

        /* c) ¿Toca cocer? Dos gatillos: la alarma del Plan Maestro (sólo la
              primera vez) o el punto de reorden del producto.

           OJO con el control de flujo: esto vive dentro del for de productos,
           así que cada salida tiene que ser `continue` (pasar al SIGUIENTE
           producto), nunca `break`. Con `break` el primer producto que no
           necesitaba cocer cortaba el día entero para todos los que venían
           detrás, y el calendario mostraba un solo estilo. */
        const enCaminoLitros = e.enCamino.reduce((s, l) => s + l.litros, 0)
        const posicion = e.stock + enCaminoLitros

        /* ANCLA MANUAL: la fecha que el usuario le puso arrastrando la
           cocción en el calendario. Se identifica por producto + número de
           cocción (la 1ª, la 2ª…) y no por el id del lote, a propósito: al
           mover una cocción se vuelve a simular TODO lo que viene después, y
           los ids se regeneran. "La 2ª cocción de Mocho English" sobrevive a
           esa regeneración; un id no.

           Manda en los dos sentidos, que es lo que hace útil arrastrar:
             · hacia adelante — no se cuece aunque el stock ya haya tocado el
               punto de reorden, porque el usuario la corrió;
             · hacia atrás — se cuece aunque todavía sobre stock.
           Lo que el ancla NO puede saltarse es la planta: si ese día no hay
           tanque libre de su línea, no hay cupo de sala o es feriado, la
           cocción cae en el primer día que sí se pueda y la diferencia queda
           registrada como `diasTarde` contra la fecha pedida. */
        const ancla = anclasCoccion.get(`${e.producto}|${e.nro + 1}`)
        if (ancla && d < ancla) continue
        const anclado = ancla != null
        const forzado = anclado || (e.forzarEl != null && d >= e.forzarEl)
        if (!forzado && posicion > p.puntoReorden) continue
        if (e.nro >= 12) continue
        // La sala de cocción tiene un tope diario, y no se cuece sábado,
        // domingo ni feriado: si no hay cupo, la cocción espera (y ese
        // atraso queda contado más abajo como `diasTarde`). Una sola cocción
        // por producto y por día: dos lotes del mismo estilo el mismo día
        // son dos macerados, no caben en una jornada.
        if (!diaHabil) continue
        if ((coccionesHoy.get(e.categoria) ?? 0) >= COCCIONES_POR_DIA_LINEA) continue

        /* Nivel objetivo de reposición: se repone hasta DEJAR EL INVENTARIO
           POR ENCIMA del punto de reorden, con un mes de venta de holgura.
           Esto tiene que ser mayor que el punto de reorden sí o sí, y no es
           un detalle: el punto de reorden ya cubre el lead time + el período
           de revisión (≈2 meses de venta) más el colchón. Reponer sólo "un
           mes + colchón" deja el stock POR DEBAJO del reorden apenas entra,
           así que el modelo vuelve a pedir cocción al día siguiente, y al
           otro, en pedazos cada vez más chicos. Probado contra los datos
           reales: con ese nivel salían 71 cocciones, varias de 1 y 2 litros
           ocupando un fermentador entero. */
        let objetivo = Math.max(p.puntoReorden + p.demandaMensual - posicion, 0)
        // Una cocción disparada por la alarma del Plan Maestro nunca es un
        // completar de 3 litros: si hay que prender la olla, se cuece al
        // menos un mes de venta.
        if (forzado) objetivo = Math.max(objetivo, p.demandaMensual)
        if (objetivo < 1) continue

        const flota = ocupacionPlanta.tanques.filter(t => t.categoria === e.categoria)
        if (flota.length === 0) {
          sinTanque.push({ producto: e.producto, litros: Math.round(objetivo), motivo: 'No hay fermentadores cargados para esa línea.' })
          e.forzarEl = null
          continue
        }
        if (e.pendienteDesde == null) e.pendienteDesde = anclado && ancla ? ancla : d

        const libres = flota.filter(t => (libreDesde.get(t.tanque) ?? hoyISO) <= d)

        /* ANCLA DE TANQUE: el usuario eligió a mano en qué fermentador cocer
           esta cocción (desplegable de la tarjeta del calendario). Igual que
           el ancla de fecha, nunca se salta la planta — si el tanque elegido
           sigue ocupado hoy, la cocción ESPERA a que se libere (no cae a
           otro tanque en su lugar): eso es justo lo que hace útil elegir,
           coordinar la ocupación real en vez de una preferencia que el
           modelo puede pasar por alto. */
        const tanqueAncla = anclasTanque.get(`${e.producto}|${e.nro + 1}`)
        const forzadoTanque = tanqueAncla ? flota.find(t => t.tanque === tanqueAncla) : undefined

        let elegido: (typeof flota)[number]
        let tanqueManual = false
        if (forzadoTanque) {
          if (!libres.some(t => t.tanque === tanqueAncla)) continue // sigue ocupado: se reintenta mañana
          elegido = forzadoTanque
          tanqueManual = true
        } else {
          if (libres.length === 0) continue // sin capacidad hoy: se reintenta mañana

          /* Elección AUTOMÁTICA — la regla de rentabilidad de la planta.
             La merma de una cocción (fondos, trub, purgas, lo que queda en
             mangueras) es casi la misma cueza 150 L o 3.000 L. Lo que
             encarece el litro no es usar un tanque grande: es PARTIR el
             volumen en varias cocciones, porque cada una paga su propia
             merma y su propia jornada de sala. Así que el criterio es
             minimizar el número de cocciones, y recién después no
             desperdiciar tanque:

               1. Si algún tanque libre cierra TODO el volumen de una vez, se
                  usa el MÁS CHICO que lo cierre. Es una sola cocción igual
                  que con uno grande, pero deja los grandes libres para los
                  volúmenes que sí los necesitan. (Acá caen los casos chicos:
                  22 L de un experimental van al Lavoratorio de 150, no a un
                  T de 1.700 — mismo costo de merma, un fermentador menos
                  bloqueado cuatro semanas.)
               2. Si ninguno alcanza, se usa el MÁS GRANDE disponible y se
                  llena entero. El resto queda para la cocción siguiente.

             La versión anterior —"el mayor tanque que se llene al menos al
             70%"— parecía la misma idea pero hacía lo contrario: con 700 L a
             cocer y un T de 450 libre, tomaba el de 450 y dejaba 250 L
             colgando, que caían al día siguiente en un Lavoratorio de 150, y
             al otro en otro. Cuatro cocciones y cuatro mermas donde cabía
             UNA de 700 L en el de 1.500. Verificado contra los datos reales:
             Imperial Stout salía como 450+150+150+150+292 L. */
          const queCierran = libres.filter(t => t.capacidadLitros >= objetivo)
          elegido = queCierran.length > 0
            ? queCierran.reduce((mejor, t) => (t.capacidadLitros < mejor.capacidadLitros ? t : mejor), queCierran[0])
            : libres.reduce((mejor, t) => (t.capacidadLitros > mejor.capacidadLitros ? t : mejor), libres[0])
        }

        /* Tanque elegido a mano: se llena ENTERO, no sólo lo que pedía el
           punto de reorden — la merma es casi la misma a medias que llena, y
           el excedente sobre `objetivo` queda como stock: la propia
           simulación lo descuenta del consumo de los meses siguientes y
           corre sola la próxima cocción más adelante (se refleja abajo en
           `cubreHasta`). Tanque automático: se respeta el tope de `objetivo`
           como siempre. */
        const litros = Math.round(tanqueManual ? elegido.capacidadLitros : Math.min(objetivo, elegido.capacidadLitros))
        const fechaListo = sumarDiasCalISO(d, e.leadDias)
        const objetivoFecha = e.pendienteDesde ?? d
        const consumo = p.consumoDiario
        e.nro++
        const lote: LoteSugerido = {
          id: `${e.producto}|${d}|${e.nro}`,
          producto: e.producto, categoria: e.categoria,
          litros, tanque: elegido.tanque, capacidadTanque: elegido.capacidadLitros,
          fechaInicio: d, fechaListo, mes: mesHoy,
          fechaObjetivo: objetivoFecha, diasTarde: Math.max(0, diffDias(d, objetivoFecha)),
          leadTimeSemanas: e.leadTimeSemanas, conAlarma: e.conAlarma,
          loteNro: e.nro, loteDe: 0,
          fechaAgotamiento: sumarDiasCalISO(d, consumo > 0 ? Math.max(0, Math.floor(posicion / consumo)) : 3650),
          cubreHasta: sumarDiasCalISO(fechaListo, consumo > 0 ? Math.max(0, Math.floor((posicion + litros) / consumo)) : 3650),
          llegaATiempo: true, enCurso: false, movidoManual: anclado, tanqueManual,
          fechaEmbarriladoReal: null,
        }
        lotes.push(lote)
        e.enCamino.push(lote)
        libreDesde.set(elegido.tanque, fechaListo)
        coccionesHoy.set(e.categoria, (coccionesHoy.get(e.categoria) ?? 0) + 1)
        e.forzarEl = null
        e.pendienteDesde = null
      }
    }

    // Lo que quedó pedido y nunca encontró tanque dentro del horizonte.
    for (const e of orden) {
      if (e.pendienteDesde == null) continue
      const p = paramsDe(e, mesDe(finISO))
      const falta = Math.max(p.demandaMensual + p.stockSeguridad - (e.stock + e.enCamino.reduce((s, l) => s + l.litros, 0)), 0)
      if (falta < 1) continue
      sinTanque.push({
        producto: e.producto, litros: Math.round(falta),
        motivo: 'Pidió cocción pero no hubo ningún fermentador libre de su línea dentro del horizonte.',
      })
    }

    // La numeración "cocción N de M" cuenta sólo lo sugerido: un lote que ya
    // está en el tanque no es una cocción por hacer.
    const sugeridos = lotes.filter(l => !l.enCurso)
    const totalPorProducto = new Map<string, number>()
    for (const l of sugeridos) totalPorProducto.set(l.producto, (totalPorProducto.get(l.producto) ?? 0) + 1)
    for (const l of sugeridos) l.loteDe = totalPorProducto.get(l.producto) ?? 1
    lotes.sort((a, b) => a.fechaInicio.localeCompare(b.fechaInicio) || a.producto.localeCompare(b.producto))

    /* ── 4. Resumen mensual, derivado del plan real (no un cálculo aparte) */
    const porMes: MesPlan[] = meses.map(mes => {
      // Litros A COCER del mes: lo que ya está fermentando no se cuece de
      // nuevo, así que queda fuera del resumen (sí se ve en el calendario).
      const delMes = sugeridos.filter(l => l.mes === mes)
      const cerveza = delMes.filter(l => l.categoria === 'cerveza')
      const kombucha = delMes.filter(l => l.categoria === 'kombucha')
      const lotesTarde = delMes.filter(l => !l.llegaATiempo).length
      return {
        mes, etiqueta: etiquetaMes(mes),
        litrosCerveza: cerveza.reduce((s, l) => s + l.litros, 0),
        litrosKombucha: kombucha.reduce((s, l) => s + l.litros, 0),
        lotesCerveza: cerveza.length, lotesKombucha: kombucha.length,
        lotesTarde,
        severidad: (lotesTarde > 0 ? 'critico' : delMes.some(l => l.diasTarde > 0) ? 'ajustado' : 'ok') as MesPlan['severidad'],
      }
    })

    return { lotes, porMes, sinTanque }
  }, [stockSeguridad, alarmasPorProducto, sugerenciasPlan, splitFermentadores, ocupacionPlanta.tanques, anclasCoccion, anclasTanque, horizontePlanMeses])

  /** Fusiona el plan SUGERIDO (planSugerido, una simulación que nunca lee
   *  plan_produccion) con los lotes ya CONFIRMADOS (plan, la cola real) en un
   *  solo resumen mensual — antes eran dos números que convivían en la misma
   *  pantalla sin hablarse: esta tarjeta sólo contaba la simulación, y la
   *  franja "Agendado vs. necesidad" del Gantt (más abajo) sólo contaba lo
   *  confirmado. Con 13 lotes reales ya en la cola, la tarjeta decía "0
   *  cocciones" para un mes que el Gantt mostraba lleno — cierto en su propio
   *  término (no había NADA sugerido pendiente) pero leído como "no hay nada
   *  agendado", que es lo contrario de lo que pasaba.
   *
   *  No se suman a `planSugerido.lotes` porque esa simulación parte de la
   *  planta real (bloquea el tanque de un confirmado) y ya los descuenta del
   *  cálculo de necesidad — sumarlos de nuevo acá sería contarlos dos veces.
   *  Esto es sólo el RESUMEN visual: confirmado + sugerido, lado a lado. */
  const resumenCargaMeses = useMemo(() => {
    const mesDe = (iso: string) => iso.slice(0, 8) + '01'
    const confirmadosPorMes = new Map<string, { litrosCerveza: number; litrosKombucha: number; lotesCerveza: number; lotesKombucha: number }>()
    for (const l of plan) {
      if (l.estado !== 'planificado' && l.estado !== 'en_curso') continue
      const mes = mesDe(l.fechaPlanificada)
      const acc = confirmadosPorMes.get(mes) ?? { litrosCerveza: 0, litrosKombucha: 0, lotesCerveza: 0, lotesKombucha: 0 }
      if (l.categoria === 'cerveza') { acc.litrosCerveza += l.litrosPlanificados; acc.lotesCerveza += 1 }
      else { acc.litrosKombucha += l.litrosPlanificados; acc.lotesKombucha += 1 }
      confirmadosPorMes.set(mes, acc)
    }
    return planSugerido.porMes.map(f => {
      const c = confirmadosPorMes.get(f.mes) ?? { litrosCerveza: 0, litrosKombucha: 0, lotesCerveza: 0, lotesKombucha: 0 }
      return {
        ...f,
        litrosCervezaConfirmado: c.litrosCerveza, litrosKombuchaConfirmado: c.litrosKombucha,
        lotesCervezaConfirmado: c.lotesCerveza, lotesKombuchaConfirmado: c.lotesKombucha,
      }
    })
  }, [plan, planSugerido.porMes])


  /** Confirma la necesidad de un producto para un mes: crea las cocciones ya
   *  partidas por tanque. Se agendan escalonadas dentro del mes, no todas el
   *  día 1 — arrancar cinco cocciones el mismo día no es ejecutable, y dejarlas
   *  amontonadas obligaría a separarlas a mano en el Gantt. Desde ahí se
   *  arrastran a la fecha y el tanque definitivos. */
  const confirmarNecesidad = useCallback(async (
    lotes: { producto: string; categoria: 'cerveza' | 'kombucha'; litros: number; mes: string }[]
  ) => {
    const hoy = hoyLocalISO()
    for (let i = 0; i < lotes.length; i++) {
      const l = lotes[i]
      // Una cocción cada 3 días dentro del mes; nunca en el pasado.
      const base = new Date(Date.parse(`${l.mes}T00:00:00Z`) + i * 3 * 86400000)
        .toISOString().slice(0, 10)
      await agregarLote({
        producto: l.producto,
        categoria: l.categoria,
        litrosPlanificados: l.litros,
        fechaPlanificada: base < hoy ? hoy : base,
        origen: 'sugerido',
        motivo: `Confirmado desde la necesidad mensual de ${l.mes.slice(0, 7)}`,
      })
    }
  }, [])

  const bloquesGantt = useMemo<BloqueGantt[]>(() => {
    const hoy = hoyLocalISO()
    const confirmados: BloqueGantt[] = plan
      .filter(l => l.estado === 'planificado' || l.estado === 'en_curso')
      .map(l => ({
        id: l.id,
        tipo: 'confirmado' as const,
        producto: l.producto,
        categoria: l.categoria,
        litros: l.litrosPlanificados,
        inicioISO: l.fechaPlanificada,
        dias: l.diasOcupacion ?? diasDe(l.producto, l.categoria),
        fermentador: l.fermentador,
        motivo: l.motivo,
        atrasado: l.fechaPlanificada < hoy && l.estado === 'planificado',
      }))

    // Las sugerencias que YA existen como lote confirmado no se repiten: el
    // plan manda, y ver el mismo producto dos veces en el mismo tanque haría
    // pensar que hay que cocerlo dos veces.
    const yaEnPlan = new Set(confirmados.map(b => `${b.producto}|${b.inicioISO}`))
    const sugeridos: BloqueGantt[] = (planSugerido.lotes ?? [])
      .filter(l => !yaEnPlan.has(`${l.producto}|${l.fechaInicio}`) && esLineaFija(l.producto))
      .map(l => ({
        id: `sug:${l.id}`,
        tipo: 'sugerido' as const,
        producto: l.producto,
        categoria: l.categoria,
        litros: l.litros,
        inicioISO: l.fechaInicio,
        dias: diasDe(l.producto, l.categoria),
        fermentador: l.tanque || null,
        loteNro: l.loteNro,
        motivo: l.llegaATiempo ? null : 'El stock se agota antes de que esta cocción esté lista.',
      }))

    /* Lo que el ERP dice que hay AHORA en los fermentadores, para los tanques
     * que ningún lote 'en_curso' del plan ya cubre. Sin esto, un tanque
     * físicamente ocupado —lo carga el enólogo directo en planta, sin pasar
     * por esta app— sólo se veía como un puntito ámbar junto al nombre del
     * tanque: ocupado, pero sin fecha, sin producto, sin saber desde cuándo.
     *
     * No hay fecha de INICIO en el informe del ERP, sólo la de embarrilado
     * ESTIMADA (columna del enólogo). El inicio se retrocede desde ahí con la
     * duración de fermentación del producto — la misma que usa el resto del
     * Gantt — así que el rango es una reconstrucción, no un dato que el ERP
     * entregó directamente. Si el ERP tampoco trajo la fecha de embarrilado,
     * se asume que arrancó hoy: sigue siendo mejor que el punto sin fecha que
     * había antes, y el motivo lo deja explícito para no confundirlo con un
     * dato firme.
     */
    const tanquesConLoteEnCurso = new Set(
      plan.filter(l => l.estado === 'en_curso' && l.fermentador).map(l => l.fermentador as string)
    )
    // Corrección manual por lote físico (tanque + código de lote del ERP) —
    // ver ajuste_lote_tanque. Se cruza por las dos claves juntas para que un
    // ajuste no se quede pegado al tanque cuando el lote real ya cambió.
    const ajustePorTanqueYCodigo = new Map(
      ajustesTanque.map(a => [`${a.tanque}|${a.codigoLote}`, a])
    )
    const enTanque: BloqueGantt[] = splitFermentadores.flatMap(sf => {
      const categoria = sf.categoria ?? 'cerveza'
      return sf.tanques
        .filter(t => t.litros > 0 && !tanquesConLoteEnCurso.has(t.nombre))
        .map(t => {
          const diasCalculados = diasDe(sf.producto, categoria)
          const conFecha = t.fechaEstimada != null
          // El ERP no siempre trae código de lote. Sin uno, se usa el nombre
          // del tanque como clave — no identifica el lote físico tan bien
          // (una corrección podría "heredarla" el próximo lote que ocupe ese
          // mismo tanque), pero es mejor que dejar el bloque sin poder
          // editarse nunca por faltarle un dato que el ERP no siempre trae.
          const codigoLote = t.codigoLote ?? t.nombre
          const ajuste = ajustePorTanqueYCodigo.get(`${t.nombre}|${codigoLote}`)

          // La fecha de embarrilado que se usa para retroceder es la manual
          // si existe, si no la del ERP. El inicio, en cambio, prioriza la
          // fecha de cocción manual DIRECTA sobre la reconstrucción — es
          // justo el dato que el usuario puede corregir con más certeza que
          // cualquier cálculo hacia atrás.
          const embarrilladoUsado = ajuste?.fechaEmbarriladoManual ?? (t.fechaEstimada as string | null)
          let inicioISO: string
          let dias: number
          if (ajuste?.fechaInicioManual) {
            inicioISO = ajuste.fechaInicioManual
            dias = embarrilladoUsado ? Math.max(1, diffDiasISO(inicioISO, embarrilladoUsado)) : diasCalculados
          } else if (embarrilladoUsado) {
            dias = diasCalculados
            inicioISO = sumarDiasCalISO(embarrilladoUsado, -dias)
          } else {
            dias = diasCalculados
            inicioISO = hoy
          }

          return {
            id: `erp:${t.nombre}`,
            tipo: 'en_tanque' as const,
            producto: sf.producto,
            categoria,
            litros: t.litros,
            inicioISO,
            dias,
            fermentador: t.nombre,
            codigoLote,
            motivo: ajuste
              ? 'Fecha corregida a mano para este lote.'
              : conFecha
                ? `Detectado en el informe del ERP — inicio estimado hacia atrás desde el embarrilado que calculó el enólogo (${t.fechaEstimada}). Clic para corregir.`
                : 'Detectado en el informe del ERP — sin fecha de embarrilado en el informe, se asume que arrancó hoy. Clic para corregir.',
          }
        })
    })

    return [...confirmados, ...sugeridos, ...enTanque]
  }, [plan, planSugerido.lotes, diasDe, splitFermentadores, ajustesTanque])

  /** Necesidad del paso 2 contra lo agendado, mes a mes. Se calcula con el
   *  MISMO criterio que la tabla de necesidad (límite superior del forecast,
   *  que es la base con la que se viene trabajando) para que las dos
   *  pantallas no muestren dos verdades distintas del mismo mes. */
  const coberturaGantt = useMemo(() => {
    const meses = [...new Set(
      series.filter(s => s.nivel === 'producto')
        .flatMap(s => s.puntos.filter(p => p.tipo === 'forecast').map(p => p.mes))
    )].sort().slice(0, 4)

    return meses.map(mes => {
      const necesidad = series
        .filter(s => s.nivel === 'producto')
        .reduce((a, s) => {
          const p = s.puntos.find(x => x.mes === mes && x.tipo === 'forecast')
          return a + (p?.litrosMax ?? p?.litros ?? 0)
        }, 0)
      const planificado = plan
        .filter(l => l.estado !== 'cancelado' && l.estado !== 'completado'
          && l.fechaPlanificada.slice(0, 8) + '01' === mes)
        .reduce((a, l) => a + l.litrosPlanificados, 0)
      return { mes, necesidad: Math.round(necesidad), planificado }
    })
  }, [series, plan])

  /** Stock de hoy y ritmo de venta por producto, para que el Gantt calcule
   *  hasta cuándo alcanza. El mes EN CURSO usa venta REAL de las últimas 4
   *  semanas (`ritmoRealPorProducto`, mismo criterio que las Alarmas de
   *  quiebre) — auditado 21-sep-2026: el forecast mensual ÷ días calendario
   *  subestimaba la venta real hasta 107% en 6 de 11 productos, entre el
   *  denominador (calendario en vez de hábiles) y el propio desvío del
   *  modelo contra lo que se está vendiendo. Los meses FUTUROS siguen en el
   *  forecast mes a mes, no un promedio plano: diciembre consume más rápido
   *  que septiembre y la fecha de quiebre tiene que reflejarlo — de esos
   *  meses no hay venta real todavía. */
  const necesidadGantt = useMemo(() => {
    const mesHoy = hoyLocalISO().slice(0, 8) + '01'
    const stockPorProducto = new Map<string, number>()
    /* El colchón de cada producto, para que el Gantt sepa dónde poner el
       ámbar. Se toma la fila del mes más cercano (la primera, que es como ya
       se toma el stock actual): el stock de seguridad cambia mes a mes con la
       estacionalidad, y el que importa para decidir hoy es el de hoy. */
    const colchonPorProducto = new Map<string, number>()
    for (const ss of stockSeguridad) {
      if (ss.nivel !== 'producto' || ss.stockActualLitros == null) continue
      if (!stockPorProducto.has(ss.producto)) stockPorProducto.set(ss.producto, ss.stockActualLitros)
      if (!colchonPorProducto.has(ss.producto)) colchonPorProducto.set(ss.producto, ss.stockSeguridadLitros)
    }

    /* Lo mismo, pero partido en BARRIL vs LATA — la única frontera que no se
       puede cruzar al servir un pedido (ver familiaEnvase en reglas.ts). El
       número por producto, solo, esconde el caso que más duele: un producto
       con el barril al día y la lata en cero se ve "bien" en el agregado.

       Los dos tamaños de barril se SUMAN acá (30 + 50) porque son
       intercambiables. Sumar sus colchones es conservador — al juntar dos
       formatos la variabilidad real baja, así que el colchón correcto sería
       algo menor que la suma. Se prefiere pecar de exigente mientras el
       script de forecast no calcule la familia con su propia σ.

       Sólo el mes más cercano, igual que el stock y el colchón de arriba. */
    const familiasPorProducto = new Map<string, Map<FamiliaEnvase, { stockActual: number; colchon: number }>>()
    const mesFamilia = new Map<string, string>()
    for (const ss of stockSeguridad) {
      if (ss.nivel !== 'producto_envase') continue
      const familia = familiaEnvase(ss.envase)
      if (!familia) continue
      // La primera fila que aparece de cada producto fija el mes; el resto de
      // los meses proyectados se ignora.
      if (!mesFamilia.has(ss.producto)) mesFamilia.set(ss.producto, ss.mes)
      if (mesFamilia.get(ss.producto) !== ss.mes) continue

      let porFamilia = familiasPorProducto.get(ss.producto)
      if (!porFamilia) { porFamilia = new Map(); familiasPorProducto.set(ss.producto, porFamilia) }
      const acum = porFamilia.get(familia) ?? { stockActual: 0, colchon: 0 }
      acum.stockActual += ss.stockActualLitros ?? 0
      acum.colchon += ss.stockSeguridadLitros
      porFamilia.set(familia, acum)
    }
    return series
      // Sólo el catálogo estable. Un rotativo que se agota no es una alarma:
      // se agota porque dejó de producirse a propósito.
      .filter(s => s.nivel === 'producto' && s.producto && esLineaFija(s.producto))
      .map(s => {
        const ritmoReal = ritmoRealPorProducto[s.producto as string]
        const ritmo = s.puntos
          .filter(p => p.tipo === 'forecast')
          .map(p => {
            // El mes EN CURSO usa la venta real de las últimas 4 semanas, no
            // el forecast — auditado contra el informe de venta detallada
            // (21-sep-2026): el forecast mensual ÷ días calendario subestimaba
            // la venta real hasta 107% en varios productos. Los meses
            // FUTUROS siguen en forecast: de venta real todavía no hay dato.
            if (p.mes === mesHoy && ritmoReal != null) return { mes: p.mes, litrosDia: ritmoReal }
            const d = new Date(Date.parse(p.mes + 'T00:00:00Z'))
            const diasDelMes = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate()
            return { mes: p.mes, litrosDia: p.litros / diasDelMes }
          })
        return {
          producto: s.producto as string,
          categoria: (s.categoria === 'kombucha' ? 'kombucha' : 'cerveza') as 'cerveza' | 'kombucha',
          stockActual: stockPorProducto.get(s.producto as string) ?? 0,
          colchon: colchonPorProducto.get(s.producto as string),
          familias: ORDEN_FAMILIA.flatMap(f => {
            const d = familiasPorProducto.get(s.producto as string)?.get(f)
            return d ? [{ familia: f, stockActual: d.stockActual, colchon: d.colchon }] : []
          }),
          ritmo,
        }
      })
      .filter(n => n.ritmo.length > 0)
  }, [series, stockSeguridad, ritmoRealPorProducto])

  /** Último mes proyectado: hasta ahí llega la grilla del Gantt. */
  const ultimoMesForecast = useMemo(() => {
    const meses = series
      .filter(s => s.nivel === 'producto')
      .flatMap(s => s.puntos.filter(p => p.tipo === 'forecast').map(p => p.mes))
    return meses.length > 0 ? meses.sort()[meses.length - 1] : null
  }, [series])

  const fermentadoresGantt = useMemo(
    () => ocupacionPlanta.tanques.map(t => ({
      nombre: t.tanque, tipo: t.tipo, categoria: t.categoria as 'cerveza' | 'kombucha',
      capacidadLitros: t.capacidadLitros, litrosActuales: t.litros,
    })),
    [ocupacionPlanta.tanques]
  )


  /** Mes que muestra el calendario diario — 0 = mes actual, navegable con
   *  las flechas. Sólo cambia qué página del plan ya calculado se mira; el
   *  horizonte de planificación son siempre 3 meses. */
  // El navegador de mes vivía en la cabecera del calendario que reemplazó el
  // Gantt (que trae el suyo, por semanas). `calendarioCobertura` sigue
  // alimentando las tarjetas de cocciones, así que el offset queda fijo en el
  // mes en curso en vez de arrastrar un setter que ya nadie llama.
  const mesCoberturaOffset = 0

  /* ── Calendario diario: proyección del plan sobre el mes visible ─────── */
  const calendarioCobertura = useMemo(() => {
    const hoy = new Date()
    const base = new Date(hoy.getFullYear(), hoy.getMonth() + mesCoberturaOffset, 1)
    const anio = base.getFullYear(), mesIdx = base.getMonth()
    const diasEnMesCal = new Date(anio, mesIdx + 1, 0).getDate()
    const offsetPrimerDia = (new Date(anio, mesIdx, 1).getDay() + 6) % 7

    const porDia = new Map<number, typeof planSugerido.lotes>()
    for (const l of planSugerido.lotes) {
      // Una cocción sugerida se muestra el día que hay que PRENDER LA OLLA.
      // Una que ya está en el tanque, el día real de EMBARRILADO que trae el
      // ERP — aunque esté vencido: eso es justo lo que hay que ver (un
      // fermentador que debió liberarse hace días y sigue con producto), no
      // esconderlo bajo "hoy". `fechaListo` (que sí se recorta a hoy) sólo
      // alimenta la simulación de stock, no la posición en el calendario.
      const posicion = l.enCurso ? (l.fechaEmbarriladoReal ?? l.fechaListo) : l.fechaInicio
      const [y, m, d] = posicion.split('-').map(Number)
      if (y !== anio || m !== mesIdx + 1) continue
      if (!porDia.has(d)) porDia.set(d, [])
      porDia.get(d)!.push(l)
    }
    const dias = Array.from({ length: diasEnMesCal }, (_, i) => ({ dia: i + 1, lotes: porDia.get(i + 1) ?? [] }))
    return {
      dias, offsetPrimerDia, anio, mesIdx, hoyISO: hoyLocalISO(),
      etiqueta: base.toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
      lotesEnElMes: [...porDia.values()].reduce((s, arr) => s + arr.length, 0),
    }
  }, [planSugerido, mesCoberturaOffset])

  /* ══════════ PRESUPUESTO DE INSUMOS DEL CALENDARIO ══════════
     Toma las cocciones SELECCIONADAS del calendario, las baja a insumos por
     receta y las valoriza. Es distinto del MRP de más abajo y de "Presupuesto
     de insumos mes a mes": aquéllos parten del forecast agregado ("cuántos
     litros voy a vender"), éste parte del PLAN CONCRETO ("estas cocciones,
     estos días, en estos tanques"), así que cada peso tiene una cocción con
     fecha detrás y se puede emitir la orden de compra.

     Lo que aporta y no existía:
       · Fecha de compra por insumo: la cocción menos el lead time de compra.
       · Selección: se presupuesta lo que el usuario marca, no todo.
       · Ventana libre de meses (mensual, trimestral, lo que elija).
       · Exportable a Excel como orden de compra. */

  /** Lead time de compra de insumos: días HÁBILES entre emitir la orden y
   *  tener el insumo en planta. Se deriva de LEAD_TIME_INSUMOS_SEMANAS (misma
   *  constante que usa el punto de reorden de Necesidad de Producción
   *  Anticipada y las Alarmas de quiebre de stock, ver lib/produccion/reglas)
   *  para no mantener dos números de "cuánto se demora un insumo" por
   *  separado — actualizado 16-sep-2026 de 1 a 2 semanas (5→10 días hábiles)
   *  con el tiempo real que toma la gestión con los proveedores, medido por
   *  el usuario. */
  const LEAD_COMPRA_DIAS_HABILES = LEAD_TIME_INSUMOS_SEMANAS * 5

  /** Ninguna cocción SUGERIDA arranca marcada para el presupuesto — ni
   *  siquiera las de este mes. Toda sugerencia es una proyección (forecast +
   *  punto de reorden + tanque asignado por el modelo, no algo que ya se
   *  decidió cocer), así que ninguna debería sumar plata al presupuesto sin
   *  que alguien la mire primero y la active a mano.
   *
   *  Las cocciones EN CURSO (ya en un fermentador) son la única excepción, y
   *  ni siquiera pasan por acá: no son una sugerencia que activar, ya
   *  ocurrieron — quedan afuera del set de selección directamente (`!l.enCurso`
   *  en `lotesEnVentana` más abajo), se ven en el calendario en azul, y nunca
   *  entran al presupuesto porque sus insumos ya se compraron. */
  const [togglesPresupuesto, setTogglesPresupuesto] = useState<Set<string>>(new Set())
  const [presupuestoDesde, setPresupuestoDesde] = useState<string>('')
  const [presupuestoHasta, setPresupuestoHasta] = useState<string>('')
  const [vistaPresupuesto, setVistaPresupuesto] = useState<'insumo' | 'producto'>('insumo')
  const [descargando, setDescargando] = useState(false)

  /** Lotes CONFIRMADOS (plan_produccion, estado 'planificado') que
   *  planSugerido no generó por su cuenta — un producto agregado a mano
   *  desde el Gantt ("Agregar producto"), o cualquiera fuera de las
   *  LINEAS_FIJAS que la simulación no cubre (planSugerido sólo mira ésas).
   *
   *  Sin esto, confirmar algo en el Gantt no movía un peso el presupuesto:
   *  esta sección leía sólo lo que el MODELO propone, nunca lo que el
   *  usuario ya decidió cocer — que es justo lo que se supone que hay que
   *  poder comprar. 'en_curso' queda afuera igual que en `lotesEnVentana`
   *  más abajo: sus insumos ya se compraron.
   *
   *  Se dedupe contra planSugerido por producto+fecha para no mostrar dos
   *  veces la misma cocción cuando la simulación ya la generó (mismo
   *  criterio que `yaEnPlan` en bloquesGantt, más arriba). */
  const lotesConfirmadosParaPresupuesto = useMemo(() => {
    const yaSimulado = new Set(planSugerido.lotes.map(l => `${l.producto}|${l.fechaInicio}`))
    return plan
      .filter(l => l.estado === 'planificado' && !yaSimulado.has(`${l.producto}|${l.fechaPlanificada}`))
      .map(l => {
        const dias = l.diasOcupacion ?? diasDe(l.producto, l.categoria)
        const fechaListo = sumarDiasCalISO(l.fechaPlanificada, dias)
        const capacidadTanque = l.fermentador
          ? ocupacionPlanta.tanques.find(t => t.tanque === l.fermentador)?.capacidadLitros ?? l.litrosPlanificados
          : l.litrosPlanificados
        const leadTimeSemanas = stockSeguridad.find(s => s.nivel === 'producto' && s.producto === l.producto)?.leadTimeSemanas ?? 4
        return {
          id: l.id, producto: l.producto, categoria: l.categoria,
          litros: l.litrosPlanificados, tanque: l.fermentador ?? '—', capacidadTanque,
          fechaInicio: l.fechaPlanificada, fechaListo, mes: l.fechaPlanificada.slice(0, 8) + '01',
          fechaObjetivo: l.fechaPlanificada, diasTarde: 0,
          leadTimeSemanas, conAlarma: false, loteNro: 1, loteDe: 1,
          // No hay proyección de stock detrás de un lote agregado a mano —
          // eso lo calcula planSugerido, y este lote quedó afuera de esa
          // simulación a propósito. Se deja optimista (llega a tiempo, cubre
          // hasta que sale) en vez de inventar un número.
          fechaAgotamiento: fechaListo, cubreHasta: fechaListo,
          llegaATiempo: true, enCurso: false,
          movidoManual: l.fermentador != null, tanqueManual: l.fermentador != null,
          fechaEmbarriladoReal: null,
        }
      })
  }, [plan, planSugerido.lotes, diasDe, ocupacionPlanta.tanques, stockSeguridad])

  const idsConfirmadosPresupuesto = useMemo(
    () => new Set(lotesConfirmadosParaPresupuesto.map(l => l.id)),
    [lotesConfirmadosParaPresupuesto]
  )

  const lotesPresupuestables = useMemo(
    () => [...planSugerido.lotes, ...lotesConfirmadosParaPresupuesto],
    [planSugerido.lotes, lotesConfirmadosParaPresupuesto]
  )

  /** Meses que ofrece el selector de ventana: los que tienen cocciones. */
  const mesesPlan = useMemo(
    () => [...new Set(lotesPresupuestables.filter(l => !l.enCurso).map(l => l.fechaInicio.slice(0, 7)))].sort(),
    [lotesPresupuestables]
  )
  const ventanaDesde = presupuestoDesde || mesesPlan[0] || ''
  const ventanaHasta = presupuestoHasta || mesesPlan[mesesPlan.length - 1] || ''

  /** Cocciones dentro de la ventana elegida. Una cocción EN CURSO no entra
   *  nunca: sus insumos ya se compraron y ya están en el tanque. */
  const lotesEnVentana = useMemo(
    () => lotesPresupuestables.filter(l =>
      !l.enCurso && l.fechaInicio.slice(0, 7) >= ventanaDesde && l.fechaInicio.slice(0, 7) <= ventanaHasta
    ),
    [lotesPresupuestables, ventanaDesde, ventanaHasta]
  )
  /** Una SUGERENCIA arranca sin marcar (hay que activarla a mano, ver el
   *  comentario de arriba); un lote ya CONFIRMADO arranca marcado — el
   *  usuario ya decidió cocerlo, así que ya debería sumar al presupuesto sin
   *  que haga falta un segundo clic para lo que ya es un hecho. El mismo Set
   *  sirve para las dos cosas con sentido invertido según el caso: para un
   *  confirmado, estar en el Set es haberlo EXCLUIDO a mano. */
  const estaSeleccionado = (l: { id: string }) =>
    idsConfirmadosPresupuesto.has(l.id) ? !togglesPresupuesto.has(l.id) : togglesPresupuesto.has(l.id)
  const alternarLote = (l: { id: string }) => {
    setTogglesPresupuesto(prev => {
      const siguiente = new Set(prev)
      if (siguiente.has(l.id)) siguiente.delete(l.id); else siguiente.add(l.id)
      return siguiente
    })
  }

  /** Redondea un desglose por mes de forma que la suma dé EXACTAMENTE el
   *  total. Redondear cada mes por su cuenta deja un descuadre de unos pesos
   *  (el total se redondea una vez por insumo y el desglose una vez por
   *  insumo y mes), y un presupuesto cuyos meses no suman el total se lee
   *  como roto aunque la diferencia sea $87 sobre $16 millones. Método del
   *  resto mayor: se redondea hacia abajo y los pesos que sobran van a los
   *  meses con el decimal más grande. */
  function repartirExacto(entradas: [string, number][], total: number) {
    if (entradas.length === 0) return []
    /* Primero se escalan los meses para que su suma sea el total. Hace falta
       porque las dos cifras se calculan por caminos distintos: el total sale
       de redondear `precio × a-comprar` UNA vez por insumo, y el desglose de
       repartir cantidades sin redondear entre las cocciones. Sobre $16
       millones la diferencia era de $87 — invisible en plata, pero deja el
       desglose sin cuadrar con su propio total. */
    const sumaCruda = entradas.reduce((s, [, v]) => s + v, 0)
    const factor = sumaCruda > 0 ? total / sumaCruda : 0
    const piso = entradas.map(([mes, v]) => {
      const ajustado = v * factor
      return { mes, costo: Math.floor(ajustado), resto: ajustado - Math.floor(ajustado) }
    })
    let sobran = total - piso.reduce((s, p) => s + p.costo, 0)
    for (const p of [...piso].sort((a, b) => b.resto - a.resto)) {
      if (sobran <= 0) break
      p.costo++
      sobran--
    }
    return piso.map(({ mes, costo }) => ({ mes, costo }))
  }

  const presupuesto = useMemo(() => {
    interface LineaInsumo {
      insumo: string; categoria: string; unidadBase: 'gr' | 'ml'
      cantidad: number; precioUnitario: number | null; costo: number | null
      /** Lo antes que hay que emitir la orden para que llegue a tiempo. */
      fechaCompra: string
      /** Qué cocciones lo piden — el vínculo producto → insumo que hace
       *  auditable cada línea del presupuesto. */
      detalle: {
        producto: string; fechaCoccion: string; fechaCompra: string
        litros: number; tanque: string; cantidad: number; costo: number | null
      }[]
      disponible: number | null
      aComprar: number
      costoAComprar: number | null
    }
    interface GrupoProducto {
      producto: string; cocciones: number; litros: number
      costo: number | null; sinPrecio: number
      insumos: { insumo: string; cantidad: number; unidadBase: 'gr' | 'ml'; costo: number | null }[]
    }
    const vacio = {
      lineas: [] as LineaInsumo[], porProducto: [] as GrupoProducto[],
      porMesCompra: [] as { mes: string; costo: number }[],
      total: 0, totalBruto: 0, cocciones: 0, litros: 0,
      sinPrecio: [] as string[], sinReceta: [] as string[],
    }

    const seleccionados = lotesEnVentana.filter(l => estaSeleccionado(l))
    if (seleccionados.length === 0) return vacio

    const disponiblePorInsumo = new Map(stockInsumos.map(s => [s.insumo, s.disponible]))
    const lineasPorProducto = new Map<string, RecetaInsumoLinea[]>()
    for (const l of recetaInsumos) {
      const arr = lineasPorProducto.get(l.producto) ?? []
      arr.push(l)
      lineasPorProducto.set(l.producto, arr)
    }

    const porInsumo = new Map<string, LineaInsumo>()
    const porProducto = new Map<string, GrupoProducto>()
    const sinReceta = new Set<string>()
    const sinPrecio = new Set<string>()

    for (const lote of seleccionados) {
      const receta = lineasPorProducto.get(lote.producto)
      if (!receta || receta.length === 0) { sinReceta.add(lote.producto); continue }
      const fechaCompra = restarDiasHabilesISO(lote.fechaInicio, LEAD_COMPRA_DIAS_HABILES)

      const grupo = porProducto.get(lote.producto)
        ?? { producto: lote.producto, cocciones: 0, litros: 0, costo: 0 as number | null, sinPrecio: 0, insumos: [] }
      grupo.cocciones++
      grupo.litros += lote.litros

      for (const linea of receta) {
        // La receta está escrita para `litrosBase`; se escala al volumen real
        // de ESTA cocción, que sale del tamaño del tanque asignado.
        const cantidad = linea.cantidadPorLote * (lote.litros / linea.litrosBase)
        const costo = linea.precioUnitario != null ? cantidad * linea.precioUnitario : null
        if (linea.precioUnitario == null) { sinPrecio.add(linea.insumo); grupo.sinPrecio++ }
        else if (grupo.costo != null) grupo.costo += costo ?? 0

        /* Un mismo insumo puede venir varias veces en la misma receta con
           distinto uso (el mismo lúpulo en whirlpool y en dry hop, por
           ejemplo — verificado en los datos: pasa en 5 recetas). Para cocer
           son momentos distintos; para COMPRAR es el mismo saco, así que acá
           se suman. */
        const acc = porInsumo.get(linea.insumo) ?? {
          insumo: linea.insumo, categoria: linea.categoria, unidadBase: linea.unidadBase,
          cantidad: 0, precioUnitario: linea.precioUnitario, costo: linea.precioUnitario != null ? 0 : null,
          fechaCompra, detalle: [], disponible: disponiblePorInsumo.get(linea.insumo) ?? null,
          aComprar: 0, costoAComprar: null,
        }
        acc.cantidad += cantidad
        if (acc.costo != null && costo != null) acc.costo += costo
        // La fecha que manda es la MÁS TEMPRANA: si el insumo se usa en tres
        // cocciones, la orden hay que emitirla para la primera.
        if (fechaCompra < acc.fechaCompra) acc.fechaCompra = fechaCompra
        const yaEsaCoccion = acc.detalle.find(d => d.producto === lote.producto && d.fechaCoccion === lote.fechaInicio)
        if (yaEsaCoccion) {
          yaEsaCoccion.cantidad += cantidad
          if (yaEsaCoccion.costo != null && costo != null) yaEsaCoccion.costo += costo
        } else {
          acc.detalle.push({
            producto: lote.producto, fechaCoccion: lote.fechaInicio, fechaCompra,
            litros: lote.litros, tanque: lote.tanque, cantidad, costo,
          })
        }
        porInsumo.set(linea.insumo, acc)

        const gi = grupo.insumos.find(x => x.insumo === linea.insumo)
        if (gi) { gi.cantidad += cantidad; if (gi.costo != null && costo != null) gi.costo += costo }
        else grupo.insumos.push({ insumo: linea.insumo, cantidad, unidadBase: linea.unidadBase, costo })
      }
      porProducto.set(lote.producto, grupo)
    }

    /* Neteo contra el inventario de insumos que ya hay en bodega: no se
       compra lo que está en la estantería. Es una aproximación deliberada —
       el stock se descuenta del total del período, no cocción por cocción,
       porque el informe de insumos es una foto sin reservas por lote. Por eso
       se muestran las dos cifras (necesidad y a comprar) y no sólo una. */
    const lineas = [...porInsumo.values()].map(l => {
      const cantidad = Math.round(l.cantidad)
      const aComprar = l.disponible != null ? Math.max(cantidad - l.disponible, 0) : cantidad
      return {
        ...l, cantidad,
        costo: l.costo != null ? Math.round(l.costo) : null,
        aComprar,
        costoAComprar: l.precioUnitario != null ? Math.round(l.precioUnitario * aComprar) : null,
        detalle: l.detalle.sort((a, b) => a.fechaCoccion.localeCompare(b.fechaCoccion)),
      }
    }).sort((a, b) => (b.costoAComprar ?? 0) - (a.costoAComprar ?? 0) || a.insumo.localeCompare(b.insumo))

    /* Desembolso por mes: se reparte COCCIÓN POR COCCIÓN, no se carga entero
       al mes de la compra más temprana. La diferencia no es cosmética: un
       insumo que usan cocciones de septiembre, octubre y noviembre tiene una
       sola `fechaCompra` (la más temprana, que es cuando hay que emitir la
       primera orden), y cargarle todo el costo a ese mes metía el presupuesto
       entero en el primer mes del horizonte. Con el reparto, cada mes muestra
       lo que de verdad hay que desembolsar.

       El stock de bodega se asigna a las cocciones MÁS TEMPRANAS primero
       (FIFO): lo que ya está en la estantería se consume en la próxima
       cocción, no se reserva para diciembre. Por construcción la suma de los
       meses da exactamente el mismo total que la línea agregada. */
    const porMes = new Map<string, number>()
    for (const l of lineas) {
      if (l.precioUnitario == null) continue
      let cubiertoPorBodega = l.disponible ?? 0
      for (const d of l.detalle) {
        const desdeBodega = Math.min(cubiertoPorBodega, d.cantidad)
        cubiertoPorBodega -= desdeBodega
        const aComprarAcá = d.cantidad - desdeBodega
        if (aComprarAcá <= 0) continue
        const mes = d.fechaCompra.slice(0, 7)
        porMes.set(mes, (porMes.get(mes) ?? 0) + l.precioUnitario * aComprarAcá)
      }
    }

    return {
      lineas,
      porProducto: [...porProducto.values()]
        .map(g => ({ ...g, litros: Math.round(g.litros), costo: g.costo != null ? Math.round(g.costo) : null,
          insumos: g.insumos.map(i => ({ ...i, cantidad: Math.round(i.cantidad), costo: i.costo != null ? Math.round(i.costo) : null }))
            .sort((a, b) => (b.costo ?? 0) - (a.costo ?? 0)) }))
        .sort((a, b) => (b.costo ?? 0) - (a.costo ?? 0)),
      porMesCompra: repartirExacto([...porMes.entries()].sort(), lineas.reduce((s, l) => s + (l.costoAComprar ?? 0), 0)),
      total: lineas.reduce((s, l) => s + (l.costoAComprar ?? 0), 0),
      totalBruto: lineas.reduce((s, l) => s + (l.costo ?? 0), 0),
      cocciones: seleccionados.length,
      litros: seleccionados.reduce((s, l) => s + l.litros, 0),
      sinPrecio: [...sinPrecio].sort(),
      sinReceta: [...sinReceta].sort(),
    }
    // `estaSeleccionado` se deriva de togglesPresupuesto, que ya está en la
    // lista — no hace falta como dependencia propia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotesEnVentana, togglesPresupuesto, recetaInsumos, stockInsumos])

  /** Excel de orden de compra. El xlsx se carga sólo al apretar el botón
   *  (import dinámico): es una librería pesada y no tiene por qué viajar en
   *  el bundle de todos los que abren Producción. */
  async function descargarPresupuesto() {
    if (presupuesto.lineas.length === 0) return
    setDescargando(true)
    try {
      const XLSX = await import('xlsx')
      const libro = XLSX.utils.book_new()

      // Hoja 1 — la orden de compra propiamente tal.
      const compra = presupuesto.lineas.map(l => ({
        'Fecha de compra': l.fechaCompra,
        'Insumo': l.insumo,
        'Categoría': l.categoria,
        'Necesidad total': l.cantidad,
        'En bodega': l.disponible ?? '',
        'A comprar': l.aComprar,
        'Unidad': l.unidadBase,
        'Precio unitario': l.precioUnitario ?? '',
        'Costo a comprar': l.costoAComprar ?? '',
        'Para cocciones': l.detalle.map(d => `${d.producto} ${d.fechaCoccion} (${Math.round(d.litros)} L)`).join(' · '),
      }))
      compra.push({
        'Fecha de compra': '', 'Insumo': 'TOTAL', 'Categoría': '', 'Necesidad total': '' as never,
        'En bodega': '', 'A comprar': '' as never, 'Unidad': '' as never, 'Precio unitario': '',
        'Costo a comprar': presupuesto.total, 'Para cocciones': '',
      })
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(compra), 'Orden de compra')

      // Hoja 2 — el vínculo cocción → insumo, línea por línea, para auditar
      // de dónde sale cada peso.
      const detalle: Record<string, string | number>[] = []
      for (const l of presupuesto.lineas) {
        for (const d of l.detalle) {
          detalle.push({
            'Fecha de compra': d.fechaCompra, 'Fecha de cocción': d.fechaCoccion,
            'Producto': d.producto, 'Litros': Math.round(d.litros), 'Tanque': d.tanque,
            'Insumo': l.insumo, 'Cantidad': Math.round(d.cantidad), 'Unidad': l.unidadBase,
            'Precio unitario': l.precioUnitario ?? '', 'Costo': d.costo != null ? Math.round(d.costo) : '',
          })
        }
      }
      detalle.sort((a, b) => String(a['Fecha de compra']).localeCompare(String(b['Fecha de compra'])))
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(detalle), 'Detalle por cocción')

      // Hoja 3 — resumen por producto y por mes de compra.
      const resumen: Record<string, string | number>[] = [
        { Concepto: 'Ventana', Valor: `${ventanaDesde} a ${ventanaHasta}` },
        { Concepto: 'Cocciones consideradas', Valor: presupuesto.cocciones },
        { Concepto: 'Litros a producir', Valor: presupuesto.litros },
        { Concepto: 'Costo insumos (necesidad total)', Valor: presupuesto.totalBruto },
        { Concepto: 'Costo a comprar (neto de bodega)', Valor: presupuesto.total },
        { Concepto: '', Valor: '' },
        { Concepto: 'POR MES DE COMPRA', Valor: '' },
        ...presupuesto.porMesCompra.map(m => ({ Concepto: m.mes, Valor: m.costo })),
        { Concepto: '', Valor: '' },
        { Concepto: 'POR PRODUCTO', Valor: '' },
        ...presupuesto.porProducto.map(p => ({ Concepto: `${p.producto} (${p.cocciones} cocc., ${p.litros} L)`, Valor: p.costo ?? '' })),
      ]
      if (presupuesto.sinPrecio.length > 0) {
        resumen.push({ Concepto: '', Valor: '' },
          { Concepto: 'INSUMOS SIN PRECIO (quedaron fuera del total)', Valor: presupuesto.sinPrecio.join(', ') })
      }
      if (presupuesto.sinReceta.length > 0) {
        resumen.push({ Concepto: 'PRODUCTOS SIN RECETA (no se pudo costear)', Valor: presupuesto.sinReceta.join(', ') })
      }
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(resumen), 'Resumen')

      XLSX.writeFile(libro, `presupuesto-insumos-${ventanaDesde}-a-${ventanaHasta}.xlsx`)
    } finally {
      setDescargando(false)
    }
  }

  /* ── Inventario actual agrupado: producto → formato → cámara ───────────
     `stock` llega como una fila por (producto, formato, cámara) — se
     reagrupa acá para que la tabla muestre de un vistazo cuánto hay de cada
     producto, segmentado entre lata y barril 30L/50L, y en qué depósito
     está cada parte (un barril de 30L en Frío Planta no sirve para lo mismo
     que uno en Barrios Bajos si hay que ir a buscarlo). */
  const inventarioAgrupado = useMemo(() => {
    interface FilaCamara { camara: string; cantidad: number; litros: number | null }
    interface GrupoFormato { bucket: EnvaseBucket; cantidad: number; litros: number | null; camaras: FilaCamara[] }
    interface GrupoProducto { producto: string; categoria: string | null; cantidad: number; litros: number | null; formatos: GrupoFormato[] }

    const porProducto = new Map<string, GrupoProducto>()
    for (const s of stock) {
      let grupo = porProducto.get(s.producto)
      if (!grupo) {
        grupo = { producto: s.producto, categoria: s.categoria, cantidad: 0, litros: null, formatos: [] }
        porProducto.set(s.producto, grupo)
      }
      grupo.cantidad += s.cantidad
      if (s.litros != null) grupo.litros = (grupo.litros ?? 0) + s.litros

      let formato = grupo.formatos.find(f => f.bucket === s.envaseBucket)
      if (!formato) {
        formato = { bucket: s.envaseBucket, cantidad: 0, litros: null, camaras: [] }
        grupo.formatos.push(formato)
      }
      formato.cantidad += s.cantidad
      if (s.litros != null) formato.litros = (formato.litros ?? 0) + s.litros

      const nombreCamara = s.camara ?? 'Sin cámara'
      let filaCamara = formato.camaras.find(c => c.camara === nombreCamara)
      if (!filaCamara) {
        filaCamara = { camara: nombreCamara, cantidad: 0, litros: null }
        formato.camaras.push(filaCamara)
      }
      filaCamara.cantidad += s.cantidad
      if (s.litros != null) filaCamara.litros = (filaCamara.litros ?? 0) + s.litros
    }

    const resultado = [...porProducto.values()]
    for (const g of resultado) {
      g.formatos.sort((a, b) => ORDEN_ENVASE.indexOf(a.bucket) - ORDEN_ENVASE.indexOf(b.bucket))
      for (const f of g.formatos) f.camaras.sort((a, b) => b.cantidad - a.cantidad)
    }
    resultado.sort((a, b) => (b.litros ?? 0) - (a.litros ?? 0) || b.cantidad - a.cantidad)
    return resultado
  }, [stock])

  /* ── Contadores del menú ───────────────────────────────────────────────
     Sólo los que se pueden calcular de verdad: advertencias del modelo y
     productos en o bajo su punto de reorden. Las secciones de maqueta no
     llevan número — inventar uno ahí sería peor que no mostrarlo. */


  // Antes se derivaba de necesidadInsumos, que con la cola de producción
  // vacía queda vacío también (aunque el stock SÍ esté cargado) — ese falso
  // "sin dato" fue justamente la confusión que reportó el usuario, 11-sep-2026.
  const stockInsumosVacio = stockInsumos.every(i => i.disponible == null)
  const stockInsumosFiltrado = stockInsumos.filter(i =>
    i.insumo.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
    i.categoria.toLowerCase().includes(busquedaInsumo.toLowerCase())
  )

  /* ── MRP neto simple ──────────────────────────────────────────────────
     A diferencia de "Necesidad de Insumos" (que sólo escala los lotes YA
     en la cola del Plan Maestro), acá la fuente de la necesidad es el
     FORECAST del modelo — cuánto se espera vender de cada producto en los
     próximos 30 días — así que no depende de que haya algo planificado
     todavía. Es "neto simple": no reparte por semana ni considera lead
     time de compra, sólo dice cuánto hace falta comprar en total dentro
     del horizonte.

     Mismo criterio de escalado lineal que Necesidad de Insumos (decisión
     del usuario, 7-sep-2026): cantidadPorLote × (demanda del horizonte /
     litrosBase de la receta). */
  const mrpInsumos = useMemo(() => {
    const hoyISO = hoyLocalISO()
    // Suma pura sobre el string ISO (no Date.now()): mismo horizonte para
    // todo el cálculo sin importar cuándo exactamente re-renderiza React.
    const hastaISO = new Date(Date.parse(`${hoyISO}T00:00:00Z`) + mrpHorizonteDias * 86400000)
      .toISOString().slice(0, 10)
    const disponiblePorInsumo = new Map(stockInsumos.map(s => [s.insumo, s.disponible]))
    const precioPorInsumo = new Map(stockInsumos.map(s => [s.insumo, s.precioUnitario]))

    const demandaPorProducto = new Map<string, number>()
    const productosSinForecast = new Set<string>()
    for (const producto of new Set(recetaInsumos.map(l => l.producto))) {
      const serie = series.find(s => s.nivel === 'producto' && s.clave === producto)
      if (!serie) { productosSinForecast.add(producto); continue }
      const demanda = Math.max(demandaProyectadaEnPeriodo(serie, avanceMes, hoyISO, hastaISO), 0)
      if (demanda > 0) demandaPorProducto.set(producto, demanda)
    }

    const necesidadPorInsumo = new Map<string, {
      categoria: string; unidadBase: 'gr' | 'ml'; bruta: number
      productos: { producto: string; litrosDemanda: number }[]
    }>()
    for (const linea of recetaInsumos) {
      const demandaLitros = demandaPorProducto.get(linea.producto)
      if (!demandaLitros) continue
      const factor = demandaLitros / linea.litrosBase
      const acc = necesidadPorInsumo.get(linea.insumo)
        ?? { categoria: linea.categoria, unidadBase: linea.unidadBase, bruta: 0, productos: [] }
      acc.bruta += linea.cantidadPorLote * factor
      if (!acc.productos.some(p => p.producto === linea.producto)) {
        acc.productos.push({ producto: linea.producto, litrosDemanda: Math.round(demandaLitros) })
      }
      necesidadPorInsumo.set(linea.insumo, acc)
    }

    const filas = [...necesidadPorInsumo.entries()].map(([insumo, n]) => {
      const bruta = Math.round(n.bruta)
      const disponible = disponiblePorInsumo.get(insumo) ?? null
      const necesidadNeta = disponible != null ? Math.max(bruta - disponible, 0) : bruta
      const precioUnitario = precioPorInsumo.get(insumo) ?? null
      return {
        insumo, categoria: n.categoria as NecesidadInsumo['categoria'], unidadBase: n.unidadBase,
        necesidadBruta: bruta, disponible, necesidadNeta,
        costoCompra: precioUnitario != null ? Math.round(precioUnitario * necesidadNeta) : null,
        productos: n.productos.sort((a, b) => b.litrosDemanda - a.litrosDemanda),
      }
    }).sort((a, b) => b.necesidadNeta - a.necesidadNeta)

    // Valorización del horizonte completo: es la cifra que se pide para
    // presupuestar a 1-3 meses. `sinPrecio` cuenta las filas que quedaron
    // fuera del total por no tener precio cargado — sin eso el total se lee
    // como presupuesto completo cuando en realidad es parcial.
    const conNecesidad = filas.filter(f => f.necesidadNeta > 0)
    const costoTotal = conNecesidad.reduce((s, f) => s + (f.costoCompra ?? 0), 0)
    const sinPrecio = conNecesidad.filter(f => f.costoCompra == null).length

    return {
      filas, hastaISO, costoTotal, sinPrecio,
      conNecesidad: conNecesidad.length,
      productosSinForecast: [...productosSinForecast].sort(),
    }
  }, [recetaInsumos, series, avanceMes, stockInsumos, mrpHorizonteDias])

  /* ── Presupuesto de insumos, mes a mes ────────────────────────────────────
     Responde "cuánto plata necesito para comprar insumos los próximos meses".
     Usa el forecast mensual de cada producto (litros), lo baja a insumos por
     receta y lo valoriza al último precio de compra.

     Lo que lo hace un presupuesto de COMPRA y no de consumo: el stock actual
     se va descontando mes a mes en cadena. Lo que ya está en bodega cubre
     primero el mes 1; sólo lo que falta se compra. El mes 2 arranca con el
     remanente que dejó el 1, y así. Sin esto, el mes 1 pediría comprar cosas
     que ya están compradas. */
  const PRESUPUESTO_MESES = 3
  const presupuestoInsumos = useMemo(() => {
    const seriePorProducto = new Map(
      series.filter(s => s.nivel === 'producto' && s.clave).map(s => [s.clave as string, s])
    )
    const meses = [...new Set(
      series.flatMap(s => s.puntos.filter(p => p.tipo === 'forecast').map(p => p.mes))
    )].sort().slice(0, PRESUPUESTO_MESES)

    const precioPorInsumo = new Map(stockInsumos.map(s => [s.insumo, s.precioUnitario]))
    // Saldo de bodega que se va consumiendo a lo largo de los meses.
    const stockRestante = new Map(stockInsumos.map(s => [s.insumo, s.disponible ?? 0]))

    const filas = meses.map(mes => {
      // Necesidad bruta del mes por insumo, separando cuánto viene de cerveza
      // y cuánto de kombucha — un mismo insumo (azúcar, CO₂) lo piden las dos
      // líneas, así que el costo se reparte después en esa misma proporción.
      const bruta = new Map<string, { total: number; cerveza: number; kombucha: number }>()
      for (const l of recetaInsumos) {
        const serie = seriePorProducto.get(l.producto)
        const litros = serie?.puntos.find(p => p.mes === mes && p.tipo === 'forecast')?.litros ?? 0
        if (litros <= 0) continue
        const cantidad = l.cantidadPorLote * (litros / l.litrosBase)
        const acc = bruta.get(l.insumo) ?? { total: 0, cerveza: 0, kombucha: 0 }
        acc.total += cantidad
        if (serie?.categoria === 'kombucha') acc.kombucha += cantidad
        else acc.cerveza += cantidad
        bruta.set(l.insumo, acc)
      }

      let cerveza = 0
      let kombucha = 0
      let sinPrecio = 0
      for (const [insumo, n] of bruta) {
        const hay = stockRestante.get(insumo) ?? 0
        const cubierto = Math.min(hay, n.total)
        stockRestante.set(insumo, hay - cubierto)
        const aComprar = n.total - cubierto
        if (aComprar <= 0) continue
        const precio = precioPorInsumo.get(insumo) ?? null
        if (precio == null) { sinPrecio++; continue }
        const propCerveza = n.total > 0 ? n.cerveza / n.total : 0
        cerveza += aComprar * precio * propCerveza
        kombucha += aComprar * precio * (1 - propCerveza)
      }

      return {
        mes,
        etiqueta: etiquetaMes(mes),
        cerveza: Math.round(cerveza),
        kombucha: Math.round(kombucha),
        total: Math.round(cerveza + kombucha),
        sinPrecio,
      }
    })

    return {
      filas,
      total: filas.reduce((s, f) => s + f.total, 0),
      totalCerveza: filas.reduce((s, f) => s + f.cerveza, 0),
      totalKombucha: filas.reduce((s, f) => s + f.kombucha, 0),
      sinPrecio: filas.reduce((m, f) => Math.max(m, f.sinPrecio), 0),
    }
  }, [series, recetaInsumos, stockInsumos])

  const mrpFiltrado = mrpInsumos.filas.filter(i =>
    i.insumo.toLowerCase().includes(busquedaInsumo.toLowerCase()) ||
    i.categoria.toLowerCase().includes(busquedaInsumo.toLowerCase())
  )


  /* ══════════ REDISEÑO 4-OCT-2026 ══════════
     Lo que leen las pestañas nuevas (Hoy, Plan, Planta, Compras). Todo lo
     que diga "cuánto y cuándo producir" sale de UN cálculo: el motor de
     lib/produccion/cobertura.ts. */

  /** Hasta dónde hay que llegar cubierto: fin de ciclo, ofrecido en atajos y
   *  acotado a donde llega el forecast. '' = el valor por defecto (3 ciclos). */
  const [hastaPlan, setHastaPlan] = useState('')
  const opcionesHorizontePlan = useMemo(() => {
    const ciclos = [avanceMes.mes, ...mesesSeguridad.filter(m => m > avanceMes.mes)].slice(0, 6)
    return ciclos.map((mes, i) => ({ mes, fecha: finDeCiclo(mes), label: i === 0 ? 'Este ciclo' : `${i + 1} ciclos` }))
  }, [avanceMes.mes, mesesSeguridad])
  const hastaPlanActivo = hastaPlan || opcionesHorizontePlan[Math.min(2, opcionesHorizontePlan.length - 1)]?.fecha || finDeCiclo(avanceMes.mes)

  const coberturaProductos = useMemo<CoberturaProducto[]>(() => {
    const primerMes = mesesSeguridad[0]
    if (!primerMes) return []
    const colchones = stockSeguridad
      .filter(x => x.nivel === 'producto_envase' && x.mes === primerMes && x.envase)
      .map(x => ({
        producto: x.producto, envase: x.envase, categoria: x.categoria,
        stockActualLitros: x.stockActualLitros, stockActualUnidades: x.stockActualUnidades,
        litrosEnProduccion: x.litrosEnProduccion, stockSeguridadLitros: x.stockSeguridadLitros,
        puntoReordenLitros: x.puntoReordenLitros, leadTimeSemanas: x.leadTimeSemanas,
      }))
    return calcularCobertura(series.filter(x => x.nivel === 'producto_envase'), colchones, avanceMes, { hoyISO: hoyLocalISO(), hastaISO: hastaPlanActivo })
  }, [series, stockSeguridad, mesesSeguridad, avanceMes, hastaPlanActivo])

  const conteoCobertura = useMemo(() => {
    const c = { urgente: 0, reponer: 0, ok: 0, sin_dato: 0, urgenteFija: 0, reponerFija: 0 }
    for (const p of coberturaProductos) {
      c[p.estado]++
      if (p.lineaFija && p.estado === 'urgente') c.urgenteFija++
      if (p.lineaFija && p.estado === 'reponer') c.reponerFija++
    }
    return c
  }, [coberturaProductos])

  /** Abre el modal de "Programar cocción" con la necesidad del motor. */
  const programarDesdeCobertura = useCallback((p: CoberturaProducto) => {
    const items = aSugerencias(p, hoyLocalISO())
    if (items.length === 0) return
    setSugerenciaModal({ producto: p.producto, categoria: p.categoria, items })
  }, [])

  /* ── Seguimiento de lotes ── */
  const [cierreLote, setCierreLote] = useState<LotePlan | null>(null)
  const seguimientoLotes = useMemo(() => {
    const hoy = hoyLocalISO()
    const d = new Date(`${hoy}T00:00:00Z`)
    const lunes = sumarDiasCalISO(hoy, -((d.getUTCDay() + 6) % 7))
    const domingo = sumarDiasCalISO(lunes, 6)
    const vencidos = plan.filter(l => l.estado === 'planificado' && l.fechaPlanificada < hoy)
    const enCurso = plan.filter(l => l.estado === 'en_curso')
    const estaSemana = plan.filter(l => l.estado === 'planificado' && l.fechaPlanificada >= hoy && l.fechaPlanificada <= domingo)
      .sort((a, b) => a.fechaPlanificada.localeCompare(b.fechaPlanificada))
    const completados = lotesCerrados.filter(l => l.estado === 'completado')
    const cancelados = lotesCerrados.filter(l => l.estado === 'cancelado')
    const conReal = completados.filter(l => l.litrosReales != null)
    const litrosPlan = conReal.reduce((s, l) => s + l.litrosPlanificados, 0)
    const litrosReal = conReal.reduce((s, l) => s + (l.litrosReales ?? 0), 0)
    const aTiempo = completados.filter(l => l.fechaInicioReal != null && diffDiasISO(l.fechaPlanificada, l.fechaInicioReal) <= 2).length
    return {
      hoy, lunes, domingo, vencidos, enCurso, estaSemana, completados, cancelados,
      rendimiento: litrosPlan > 0 ? litrosReal / litrosPlan : null,
      aTiempo, conFecha: completados.filter(l => l.fechaInicioReal != null).length,
    }
  }, [plan, lotesCerrados])

  /* ── Historial de stock: días en quiebre de las líneas fijas ── */
  const quiebresLineasFijas = useMemo(() => {
    const fechas = [...new Set(historialStock.map(h => h.fecha))].sort()
    const vendeLata = new Set(series.filter(x => x.nivel === 'producto_envase' && x.envaseBucket === 'lata' && x.producto).map(x => x.producto as string))
    const porProducto = new Map<string, { producto: string; diasSinBarril: number; diasSinLata: number; serie: { fecha: string; litros: number }[] }>()
    for (const prod of [...LINEAS_FIJAS]) {
      const filas = historialStock.filter(h => h.producto === prod)
      const porFecha = new Map(filas.map(f => [f.fecha, f]))
      let sinBarril = 0, sinLata = 0
      const serie = fechas.map(f => {
        const h = porFecha.get(f)
        if (!h || h.barrilLitros <= 0) sinBarril++
        if (vendeLata.has(prod) && (!h || h.lataLitros <= 0)) sinLata++
        return { fecha: f, litros: (h?.barrilLitros ?? 0) + (h?.lataLitros ?? 0) }
      })
      porProducto.set(prod, { producto: prod, diasSinBarril: sinBarril, diasSinLata: sinLata, serie })
    }
    return { dias: fechas.length, desde: fechas[0] ?? null, productos: [...porProducto.values()] }
  }, [historialStock, series])

  /* ── Envase: latas, etiquetas y tapas ──
     Las latas que se venden según el forecast de cada producto en lata,
     convertidas a unidades con el ml real de su lata (473 cerveza, 354
     kombucha, según el inventario). Etiquetas y tapas siguen a las latas. */
  const [envase, setEnvase] = useState<EnvaseItem[]>(envaseInicial)
  const [envaseRecibido, setEnvaseRecibido] = useState(envaseInicial)
  if (envaseRecibido !== envaseInicial) { setEnvaseRecibido(envaseInicial); setEnvase(envaseInicial) }
  const [errorEnvase, setErrorEnvase] = useState<string | null>(null)
  async function guardarEnvase(clave: string, cambios: { precioUnitario?: number | null; stockUnidades?: number | null; porLata?: number }) {
    setErrorEnvase(null)
    const previo = envase
    setEnvase(e => e.map(x => x.clave === clave ? { ...x, ...cambios } : x))
    try {
      const r = await fetch('/api/produccion/envase', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clave, ...cambios }) })
      if (!r.ok) throw new Error((await r.json()).error ?? 'No se pudo guardar')
    } catch (e) {
      setEnvase(previo)
      setErrorEnvase(e instanceof Error ? e.message : 'No se pudo guardar')
    }
  }

  const necesidadEnvase = useMemo(() => {
    const meses = [...new Set(series.flatMap(x => x.puntos.filter(pt => pt.tipo === 'forecast').map(pt => pt.mes)))].sort().slice(0, PRESUPUESTO_MESES)
    // latas por ml y mes
    const latas = new Map<number, number[]>()
    for (const x of series) {
      if (x.nivel !== 'producto_envase' || x.envaseBucket !== 'lata' || !x.producto) continue
      const ml = mlLataPorProducto[x.producto] ?? (x.categoria === 'kombucha' ? 354 : 473)
      const fila = latas.get(ml) ?? meses.map(() => 0)
      meses.forEach((m, i) => {
        const litros = x.puntos.find(pt => pt.mes === m && pt.tipo === 'forecast')?.litros ?? 0
        fila[i] += litros / (ml / 1000)
      })
      latas.set(ml, fila)
    }
    const totalLatas = meses.map((_, i) => [...latas.values()].reduce((s, f) => s + f[i], 0))
    const items = envase.map(e => {
      const base = e.ml == null ? totalLatas : (latas.get(e.ml) ?? meses.map(() => 0))
      const porMes = base.map(n => Math.ceil(n * e.porLata))
      const total = porMes.reduce((s, n) => s + n, 0)
      const aComprar = Math.max(0, total - (e.stockUnidades ?? 0))
      // la compra se reparte por mes descontando el stock en el primero que lo necesite
      let saldo = e.stockUnidades ?? 0
      const compraPorMes = porMes.map(n => { const cubre = Math.min(saldo, n); saldo -= cubre; return n - cubre })
      return {
        ...e, porMes, total, aComprar, compraPorMes,
        costo: e.precioUnitario != null ? aComprar * e.precioUnitario : null,
        costoPorMes: compraPorMes.map(n => (e.precioUnitario != null ? n * e.precioUnitario : 0)),
      }
    })
    return {
      meses,
      latasPorMl: [...latas.entries()].sort((a, b) => b[0] - a[0]).map(([ml, f]) => ({ ml, porMes: f.map(n => Math.ceil(n)), total: Math.ceil(f.reduce((s, n) => s + n, 0)) })),
      items,
      costoPorMes: meses.map((_, i) => items.reduce((s, it) => s + it.costoPorMes[i], 0)),
      costoTotal: items.reduce((s, it) => s + (it.costo ?? 0), 0),
      sinPrecio: items.filter(it => it.precioUnitario == null && it.total > 0).length,
    }
  }, [series, envase, mlLataPorProducto])

  /** Marca roja en cada pestaña: lo que hay que mirar sin tener que entrar. */
  const alertasPorTab = useMemo<Partial<Record<TabId, number>>>(() => ({
    plan: conteoCobertura.urgente,
    // Una cocción que no alcanza a estar lista antes de que el producto se
    // agote, o un lote cuya fecha pasó sin que nadie dijera si se cocinó.
    planta: planSugerido.lotes.filter(l => !l.enCurso && !l.llegaATiempo).length
      + planSugerido.sinTanque.length + seguimientoLotes.vencidos.length,
  }), [conteoCobertura.urgente, planSugerido, seguimientoLotes.vencidos.length])

  /* ── Plan trimestral: cocinar + insumos + envase por ciclo ── */
  const planTrimestral = useMemo(() => {
    const litrosPorMes = new Map<string, { cerveza: number; kombucha: number }>()
    for (const x of series) {
      if (x.nivel !== 'producto' || !x.producto) continue
      for (const pt of x.puntos) {
        if (pt.tipo !== 'forecast') continue
        const acc = litrosPorMes.get(pt.mes) ?? { cerveza: 0, kombucha: 0 }
        if (x.categoria === 'kombucha') acc.kombucha += pt.litros
        else acc.cerveza += pt.litros
        litrosPorMes.set(pt.mes, acc)
      }
    }
    const filas = presupuestoInsumos.filas.map(f => {
      const i = necesidadEnvase.meses.indexOf(f.mes)
      const l = litrosPorMes.get(f.mes) ?? { cerveza: 0, kombucha: 0 }
      const latas = i >= 0 ? necesidadEnvase.latasPorMl.reduce((s, x) => s + x.porMes[i], 0) : 0
      const envaseCosto = i >= 0 ? necesidadEnvase.costoPorMes[i] : 0
      return {
        mes: f.mes, etiqueta: f.etiqueta, litrosCerveza: Math.round(l.cerveza), litrosKombucha: Math.round(l.kombucha),
        insumos: f.total, latas, envase: Math.round(envaseCosto), total: f.total + Math.round(envaseCosto),
      }
    })
    return { filas, total: filas.reduce((s, f) => s + f.total, 0) }
  }, [series, presupuestoInsumos, necesidadEnvase])

  return { quitarLoteConDeshacer, deshacer, deshacerQuitar, cerrarDeshacer, series, calidad, splitFermentadores, ocupacionPlanta, stockInsumos, recetaInsumos, lotesSinReceta, stock, stockSeguridad, ultimaCorrida, minutosDesdeSyncStock, avanceMes, activeTab, setActiveTab, plan, guardandoPlan, errorPlan, setErrorPlan, mostrarFormLote, setMostrarFormLote, sugerenciaModal, setSugerenciaModal, moverLote, cambiarEstadoLote, guardarAjusteTanque, restablecerAjusteTanque, agregarLote, busquedaInsumo, panelInsumosAbierto, setPanelInsumosAbierto, mrpHorizonteDias, setMrpHorizonteDias, filtroCategoria, setFiltroCategoria, filtroEnvase, setFiltroEnvase, verModelo, setVerModelo, serieGeneral, filtroCategoriaForecast, filtroEnvaseForecast, setFiltroEnvaseForecast, filtroProductoForecast, setFiltroProductoForecast, productosForecastDisponibles, envasesForecastDisponibles, serieActual, cambiarCategoriaForecast, mtdLitros, ritmoProyectado, monedaForecast, setMonedaForecast, precioNeto, verNeto, kMoneda, fUnidad, valorSerie, unidadEnvaseSerieActual, chartData, hayDescomposicion, descomposicionProximo, curvaEstacional, ecuacionModelo, tramosTemporadaAlta, precisionSerie, envasesDisponibles, filasTablaDetalle, horizontePlanMeses, setHorizontePlanMeses, horizontePlanMax, anclasCoccion, detalleCoccion, cancelarCierrePreview, programarCierrePreview, fijarDetalle, cerrarDetalle, anclarCoccion, anclasTanque, anclarTanque, limpiarAnclas, configGantt, setConfigGantt, configAbierta, setConfigAbierta, proyeccionCargaAbierta, agregarProductoAbierto, setAgregarProductoAbierto, ajustesTanque, editarTanqueAbierto, setEditarTanqueAbierto, guardandoAjusteTanque, errorAjusteTanque, setErrorAjusteTanque, bloqueRecienMovido, arrastreStore, fantasmaRef, propsOrigenGantt, quitarBloqueGantt, planSugerido, resumenCargaMeses, confirmarNecesidad, bloquesGantt, coberturaGantt, necesidadGantt, ultimoMesForecast, fermentadoresGantt, calendarioCobertura, LEAD_COMPRA_DIAS_HABILES, setTogglesPresupuesto, setPresupuestoDesde, setPresupuestoHasta, vistaPresupuesto, setVistaPresupuesto, descargando, mesesPlan, ventanaDesde, ventanaHasta, lotesEnVentana, estaSeleccionado, alternarLote, presupuesto, descargarPresupuesto, inventarioAgrupado, alertasPorTab, stockInsumosVacio, stockInsumosFiltrado, mrpInsumos, PRESUPUESTO_MESES, presupuestoInsumos, mrpFiltrado, lotesCerrados, setHastaPlan, opcionesHorizontePlan, hastaPlanActivo, coberturaProductos, conteoCobertura, programarDesdeCobertura, cierreLote, setCierreLote, seguimientoLotes, quiebresLineasFijas, envase, guardarEnvase, errorEnvase, setErrorEnvase, necesidadEnvase, planTrimestral }
}

export type Produccion = ReturnType<typeof useProduccion>
