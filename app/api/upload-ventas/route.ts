import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { SUPABASE_URL as SUPABASE_URL_CFG } from '@/lib/supabase/config'
import * as XLSX from 'xlsx'
import { esClienteNoGuardar } from '@/lib/types'

// Alias local para mantener compatibilidad con el nombre anterior. Usa
// esClienteNoGuardar (no esClienteExcluido): PDV/Feria/BaseCamp ahora SÍ se
// guardan para poder mostrarlos en su propia tarjeta — siguen excluidos de
// "litros vendidos" porque eso lo filtra _excluir_cliente en SQL, no esto.
const esClienteInterno = esClienteNoGuardar

function parseFecha(raw: unknown): string | null {
  if (raw instanceof Date) {
    // Usar métodos UTC para evitar desfase por zona horaria del servidor
    const y = raw.getUTCFullYear()
    const m = String(raw.getUTCMonth() + 1).padStart(2, '0')
    const d = String(raw.getUTCDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  if (typeof raw === 'string') {
    // Acepta: "2024-05-15", "2024-05-15T...", "15/05/2024", "05/15/2024"
    const iso = raw.split('T')[0].split(' ')[0]
    if (iso.match(/^\d{4}-\d{2}-\d{2}$/)) return iso
    // Formato dd/mm/yyyy o mm/dd/yyyy → intentar ambos
    const parts = raw.split('/')
    if (parts.length === 3) {
      // Asumir dd/mm/yyyy (formato chileno)
      const [dd, mm, yyyy] = parts
      if (yyyy.length === 4) return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`
    }
    return null
  }
  if (typeof raw === 'number') {
    // Serial de Excel — XLSX.SSF.parse_date_code es timezone-safe
    const d = XLSX.SSF.parse_date_code(raw)
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`
  }
  return null
}

/** Como parseFecha, pero conserva hora:minuto:segundo cuando el valor los
 *  trae — el ERP sí reporta hora exacta en "Fecha entrega" (ej.
 *  "28/07/2026 23:56:01"), a diferencia de "Fecha Pedido", que nunca la
 *  trae. Se devuelve como timestamp SIN zona horaria (hora literal de Chile
 *  tal cual la muestra el ERP, sin adivinar offset UTC/DST) — la UI la
 *  formatea directo, sin pasar por Date/timeZone. 00:00:00 se trata como
 *  "sin hora real" (probablemente sólo fecha, sin hora capturada). */
function parseFechaHora(raw: unknown): string | null {
  if (raw instanceof Date) {
    const y = raw.getUTCFullYear()
    const mo = String(raw.getUTCMonth() + 1).padStart(2, '0')
    const d = String(raw.getUTCDate()).padStart(2, '0')
    const h = raw.getUTCHours(), mi = raw.getUTCMinutes(), s = raw.getUTCSeconds()
    if (h === 0 && mi === 0 && s === 0) return null
    return `${y}-${mo}-${d}T${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }
  if (typeof raw === 'string') {
    const iso = raw.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(:\d{2})?/)
    if (iso) return `${iso[1]}T${iso[2]}${iso[3] ?? ':00'}`
    const dmy = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})[ T](\d{2}:\d{2})(:\d{2})?/)
    if (dmy) {
      const [, dd, mm, yyyy, hhmm, ss] = dmy
      return `${yyyy}-${mm}-${dd}T${hhmm}${ss ?? ':00'}`
    }
    return null
  }
  if (typeof raw === 'number') {
    const d = XLSX.SSF.parse_date_code(raw)
    if (!d.H && !d.M && !d.S) return null
    return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}T${String(d.H).padStart(2, '0')}:${String(d.M).padStart(2, '0')}:${String(Math.round(d.S)).padStart(2, '0')}`
  }
  return null
}

function deduplicarRegistros(registros: Record<string, unknown>[]) {
  // Contador de apariciones por clave base — permite 2 barriles idénticos
  // del mismo cliente en el mismo pedido (e.g. El Growler: 2 × Barril 30L).
  // Solo elimina filas que son 100% copias exactas del mismo archivo.
  const contadorBase = new Map<string, number>()
  const seen = new Set<string>()
  const unicos: Record<string, unknown>[] = []
  const dupCount: number[] = []

  for (const r of registros) {
    const baseKey = [
      r.vendedor_actual,
      r.fecha_pedido,
      r.pedido,
      r.nombre_fantasia,
      r.producto,
      r.envase,
      r.litros,
      r.total_sin_impuesto,
    ].join('|')
    const n = (contadorBase.get(baseKey) ?? 0)
    contadorBase.set(baseKey, n + 1)
    const key = `${baseKey}|${n}`

    if (seen.has(key)) {
      dupCount.push(1)
    } else {
      seen.add(key)
      unicos.push(r)
    }
  }

  return { unicos, duplicadosEnArchivo: dupCount.length }
}

function parseAndValidate(rows: Record<string, unknown>[]) {
  const erroresMapeo: string[] = []
  const advertenciasLitros: string[] = []
  let clientesInternosExcluidos = 0
  let litrosInternosExcluidos = 0

  const registrosBrutos = rows
    .map((row, idx) => {
      const vendedor = String(
        row['VendedorActual'] ?? row['Vendedor actual'] ?? ''
      ).trim()

      if (!vendedor) return null

      const fechaPedido = parseFecha(
        row['FechaPedido'] ?? row['Fecha pedido'] ?? row['Fecha Pedido']
      )

      if (!fechaPedido) {
        erroresMapeo.push(`Fila ${idx + 2}: fecha inválida (${row['FechaPedido']})`)
        return null
      }

      const nombreFantasia =
        String(row['NombreDeFantasia'] ?? row['Nombre de fantasía'] ?? row['Nombre de fantasia'] ?? '').trim() || null

      // ── Excluir clientes internos en el momento de la carga ──────────────────
      if (esClienteInterno(nombreFantasia)) {
        const litrosRawInt = parseFloat(String(row['Litros'] ?? '0')) || 0
        clientesInternosExcluidos++
        litrosInternosExcluidos += litrosRawInt
        return null
      }

      const categoriaRaw = String(row['Categoria'] ?? row['Categoría'] ?? '').trim() || null
      const litrosRaw = row['Litros']
      const litros = parseFloat(String(litrosRaw ?? '0')) || 0

      if (litrosRaw === null || litrosRaw === undefined || litrosRaw === '') {
        advertenciasLitros.push(`Fila ${idx + 2}: sin valor de litros (${nombreFantasia ?? ''})`)
      } else if (litros === 0) {
        advertenciasLitros.push(`Fila ${idx + 2}: litros = 0 (${row['Producto'] ?? ''} — ${nombreFantasia ?? ''})`)
      } else if (litros < 0) {
        advertenciasLitros.push(`Fila ${idx + 2}: litros negativos ${litros} (${row['Producto'] ?? ''})`)
      }

      // Fecha real de entrega: NULL = el pedido aún no se entregó (pendiente o
      // listo para entregar). Es la que usa el ERP para filtrar el informe, así
      // que guardarla permite distinguir en la app lo entregado de lo pendiente.
      const fechaEntregaRaw = row['FechaEntrega'] ?? row['Fecha entrega'] ?? row['Fecha Entrega']
      const fechaEntrega = parseFecha(fechaEntregaRaw)
      const fechaEntregaHora = parseFechaHora(fechaEntregaRaw)
      const fechaEntregaEstimada = parseFecha(
        row['FechaEntregaEstimada'] ?? row['Fecha Entrega Estimada'] ?? row['Fecha entrega estimada']
      )

      return {
        fecha_pedido: fechaPedido,
        fecha_entrega: fechaEntrega,
        fecha_entrega_hora: fechaEntregaHora,
        fecha_entrega_estimada: fechaEntregaEstimada,
        // El archivo sí trae el estado de entrega, así que fecha_entrega es
        // confiable: NULL significa "aún no entregado", no "no sabemos".
        entrega_informada: true,
        vendedor_actual: vendedor,
        nombre_fantasia: nombreFantasia,
        categoria_producto:
          String(row['CategoriaProducto'] ?? row['Categoría producto'] ?? '').trim() || null,
        categoria_negocio: categoriaRaw && categoriaRaw !== '-' ? categoriaRaw : null,
        producto: String(row['Producto'] ?? '').trim() || null,
        envase: String(row['Envase'] ?? '').trim() || null,
        litros,
        total_sin_impuesto:
          parseFloat(String(row['TotalSImp$'] ?? row['Total s/imp $'] ?? '0')) || 0,
        pedido: String(row['Pedido'] ?? '').trim() || null,
        // La hoja "Datos" (la que usa este endpoint) trae esta columna como
        // "FacturaEnMinusculas", no "Factura" — verificado el 2026-09-02: con
        // sólo 'Factura' el campo quedaba null en el 100% de las 53.212 filas
        // ya cargadas, pese a que el ERP sí trae el número (589/795 filas con
        // dato en un export de muestra).
        numero_factura: String(row['Factura'] ?? row['FacturaEnMinusculas'] ?? '').trim() || null,
        tipo_venta:
          String(row['TipoDeVenta'] ?? row['Tipo de venta'] ?? '').trim() || null,
        localidad: String(row['Localidad'] ?? '').trim() || null,
        provincia: String(row['Provincia'] ?? '').trim() || null,
      }
    })
    .filter(Boolean) as Record<string, unknown>[]

  const { unicos: registros, duplicadosEnArchivo } = deduplicarRegistros(registrosBrutos)

  const combinaciones = [
    ...new Map(
      registros.map(r => [
        `${r.vendedor_actual}__${r.fecha_pedido}`,
        { vendedor: r.vendedor_actual as string, fecha: r.fecha_pedido as string },
      ])
    ).values(),
  ]

  const resumenVendedor: Record<string, { filas: number; litros: number; litrosNegativos: number; filasSinLitros: number; fechas: Set<string> }> = {}
  for (const r of registros) {
    const v = r.vendedor_actual as string
    if (!resumenVendedor[v]) resumenVendedor[v] = { filas: 0, litros: 0, litrosNegativos: 0, filasSinLitros: 0, fechas: new Set() }
    resumenVendedor[v].filas++
    resumenVendedor[v].litros += r.litros as number
    if ((r.litros as number) < 0) resumenVendedor[v].litrosNegativos++
    if ((r.litros as number) === 0) resumenVendedor[v].filasSinLitros++
    resumenVendedor[v].fechas.add(r.fecha_pedido as string)
  }

  // Totales de litros por fecha (para verificación cruzada)
  const litrosPorFecha: Record<string, number> = {}
  for (const r of registros) {
    const f = r.fecha_pedido as string
    litrosPorFecha[f] = (litrosPorFecha[f] ?? 0) + (r.litros as number)
  }

  const fechasOrdenadas = combinaciones.map(c => c.fecha).sort()

  return {
    registros,
    combinaciones,
    duplicadosEnArchivo,
    erroresMapeo,
    advertenciasLitros,
    fechasOrdenadas,
    resumenVendedor,
    clientesInternosExcluidos,
    litrosInternosExcluidos: Math.round(litrosInternosExcluidos * 100) / 100,
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const preview = searchParams.get('preview') === 'true'

  // ── Autenticación dual ───────────────────────────────────────────────────
  // a) UI admin: sesión por cookies (cliente normal, RLS aplica)
  // b) Cron ERP (GitHub Actions): Bearer CRON_SECRET → cliente service-role
  //    (sin sesión; el secret es la autorización)
  const auth = req.headers.get('authorization')
  const esCron = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`

  let supabase
  if (esCron) {
    const svcKey = process.env.SUPABASE_SERVICE_KEY
    if (!svcKey) return NextResponse.json({ error: 'SUPABASE_SERVICE_KEY no configurada' }, { status: 500 })
    supabase = createSbClient(SUPABASE_URL_CFG, svcKey)
  } else {
    supabase = await createClient()
    // Sin sesión válida, los writes fallan por RLS — rechazar temprano y claro
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  // ── Ventana de reconciliación (opcional) ────────────────────────────────
  // El cron manda la MISMA ventana [desde, hasta] que le pidió al ERP para
  // este tramo (filtro por FECHA DE ENTREGA, ver extractor.py). Es la única
  // fuente confiable de "qué rango cubre este archivo" — NO se debe volver a
  // inferir del contenido del archivo (fechaMin/fechaMax de fecha_pedido):
  // eso fue exactamente lo que causó el incidente del 27-ago-2026 (borró
  // 1.938 filas), porque un tramo angosto de entrega puede traer pedidos con
  // fecha_pedido de semanas atrás. Si no viene la ventana (carga manual desde
  // el admin, o un extractor viejo), simplemente no se reconcilia — no se
  // adivina el rango.
  const fechaEntregaDesde = (formData.get('fecha_entrega_desde') as string | null)?.trim() || null
  const fechaEntregaHasta = (formData.get('fecha_entrega_hasta') as string | null)?.trim() || null
  const fechaISO = /^\d{4}-\d{2}-\d{2}$/
  const ventanaReconciliacionValida =
    !!fechaEntregaDesde &&
    !!fechaEntregaHasta &&
    fechaISO.test(fechaEntregaDesde) &&
    fechaISO.test(fechaEntregaHasta) &&
    fechaEntregaDesde <= fechaEntregaHasta

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheetName = wb.SheetNames.includes('Datos') ? 'Datos' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: null })

  if (rows.length === 0) {
    return NextResponse.json({ error: 'El archivo no contiene datos' }, { status: 400 })
  }

  const {
    registros,
    duplicadosEnArchivo,
    erroresMapeo,
    advertenciasLitros,
    fechasOrdenadas,
    resumenVendedor,
    clientesInternosExcluidos,
    litrosInternosExcluidos,
  } = parseAndValidate(rows)

  if (registros.length === 0) {
    return NextResponse.json(
      { error: 'No se encontraron ventas de vendedores válidos en el archivo' },
      { status: 400 }
    )
  }

  const vendedoresResumen = Object.entries(resumenVendedor).map(([nombre, d]) => ({
    nombre,
    filas: d.filas,
    litros: Math.round(d.litros * 10) / 10,
    litrosNegativos: d.litrosNegativos,
    filasSinLitros: d.filasSinLitros,
    fechas: d.fechas.size,
    // Lista de fechas ordenadas con litros de ese día para verificación
    detalleFechas: [...d.fechas].sort().map(f => ({
      fecha: f,
      litros: Math.round(
        registros
          .filter(r => r.vendedor_actual === nombre && r.fecha_pedido === f)
          .reduce((s, r) => s + (r.litros as number), 0) * 10
      ) / 10,
    })),
  }))

  // MODO PREVIEW — sólo validar, no insertar
  if (preview) {
    return NextResponse.json({
      preview: true,
      totalFilas: registros.length,
      duplicadosEnArchivo,
      clientesInternosExcluidos,
      litrosInternosExcluidos,
      erroresMapeo: erroresMapeo.slice(0, 10),
      advertenciasLitros: advertenciasLitros.slice(0, 20),
      fechaMin: fechasOrdenadas[0],
      fechaMax: fechasOrdenadas[fechasOrdenadas.length - 1],
      vendedores: vendedoresResumen,
    })
  }

  // MODO CONFIRMADO — borrar e insertar
  //
  // El pedido (no el vendedor+fecha) es la unidad atómica correcta para el
  // reemplazo. El informe del ERP filtra por FECHA DE ENTREGA, así que un
  // mismo vendedor+día de pedido puede repartirse en varios archivos
  // entregados en fechas distintas. Borrar por (vendedor, fecha_pedido) en
  // cada carga terminaba eliminando pedidos que un archivo anterior había
  // cargado y que no venían en este — se detectó en la auditoría del 27-jul:
  // de 1.390 pedidos reales del período sólo quedaban 163 en la base tras
  // varias cargas sucesivas. El pedido es único en el ERP y sus líneas
  // siempre viajan juntas, así que borrar/reinsertar por pedido es
  // idempotente sin importar qué ventana de fechas se haya pedido.
  // Las devoluciones no tienen número de pedido propio: el ERP les pone el
  // texto literal "Devolución" a todas. Tratarlo como clave de borrado
  // eliminaría de golpe las devoluciones de cualquier otra fecha ya cargadas,
  // así que sólo se usa el pedido como unidad atómica cuando tiene el formato
  // numérico real del ERP.
  const esPedidoReal = (p: string) => /^\d+$/.test(p)
  const pedidosEnArchivo = [
    ...new Set(
      registros
        .map(r => r.pedido as string | null)
        .filter((p): p is string => !!p && esPedidoReal(p))
    ),
  ]
  for (let i = 0; i < pedidosEnArchivo.length; i += 500) {
    const lote = pedidosEnArchivo.slice(i, i + 500)
    const { error: deleteError } = await supabase.from('ventas').delete().in('pedido', lote)
    if (deleteError) {
      return NextResponse.json(
        { error: `Error al limpiar datos: ${deleteError.message}` },
        { status: 500 }
      )
    }
  }

  // Filas sin pedido numérico real (devoluciones, cargas manuales antiguas):
  // mantener el criterio anterior de reemplazo por vendedor+fecha, acotado a
  // esas mismas filas para no interferir con el borrado por pedido de arriba.
  const combinacionesSinPedido = [
    ...new Map(
      registros
        .filter(r => !r.pedido || !esPedidoReal(r.pedido as string))
        .map(r => [
          `${r.vendedor_actual}__${r.fecha_pedido}`,
          { vendedor: r.vendedor_actual as string, fecha: r.fecha_pedido as string },
        ])
    ).values(),
  ]
  for (const { vendedor, fecha } of combinacionesSinPedido) {
    const { error: deleteError } = await supabase
      .from('ventas')
      .delete()
      .eq('vendedor_actual', vendedor)
      .eq('fecha_pedido', fecha)
      // NULL no matchea el regex bajo lógica de 3 valores, así que .not() solo
      // no alcanza — hay que pedirlo explícito con is.null.
      .or('pedido.is.null,pedido.not.match.^[0-9]+$')

    if (deleteError) {
      return NextResponse.json(
        { error: `Error al limpiar datos: ${deleteError.message}` },
        { status: 500 }
      )
    }
  }

  const BATCH = 200
  let insertadas = 0

  for (let i = 0; i < registros.length; i += BATCH) {
    const batch = registros.slice(i, i + BATCH)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: insertError } = await supabase
      .from('ventas')
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(batch as any[])
      .select('id')

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }
    insertadas += data?.length ?? batch.length
  }

  // ── Reconciliación de pedidos huérfanos (rediseñada 08-sep-2026) ─────────
  // Objetivo: cuando un pedido se cancela/elimina en el ERP, deja de venir en
  // TODOS los archivos futuros — no llega marcado como "cancelado", simplemente
  // desaparece. El upsert por pedido de arriba solo corrige pedidos que SÍ
  // vienen en el archivo; esto limpia los que ya no vienen en ninguno.
  //
  // Ver INCIDENTE 27-ago-2026 (git blame de este bloque para el código que lo
  // causó): la versión anterior borró 1.938 filas porque infería el
  // "rango cubierto por el archivo" desde las fechas de PEDIDO que traía —
  // un archivo angosto de entrega puede traer pedidos con fecha_pedido de
  // semanas atrás, así que ese rango inferido terminaba siendo casi todo el
  // historial.
  //
  // Fix real: usar la ventana [fechaEntregaDesde, fechaEntregaHasta] que el
  // cron efectivamente le pidió al ERP (mismo filtro que usa el ERP: FECHA DE
  // ENTREGA — ver extractor.py), nunca inferida del contenido del archivo.
  // Sólo se borra un pedido si:
  //   1) tiene fecha_entrega NO nula y DENTRO de esa ventana exacta (nunca se
  //      toca un pedido pendiente de entrega ni uno fuera de la ventana pedida),
  //   2) su número de pedido es real (formato numérico del ERP — nunca
  //      "Devolución" ni cargas manuales antiguas), y
  //   3) no aparece en NINGUNA fila de este archivo.
  // Si no vino la ventana (carga manual, extractor viejo) no se reconcilia.
  //
  // Circuit breaker: si el candidato a huérfanos supera MAX_HUERFANOS_POR_SYNC,
  // se aborta el borrado y se reporta para revisión manual — un sync cada 15
  // min no debería cancelar decenas de pedidos de golpe; si eso pasa, es más
  // probable un bug (o un ERP devolviendo un archivo vacío/incompleto) que
  // cancelaciones reales, y el costo de esperar revisión manual es mucho
  // menor que el de repetir el incidente de agosto.
  const MAX_HUERFANOS_POR_SYNC = 50
  let pedidosHuerfanosBorrados = 0
  let pedidosPendientesHuerfanosBorrados = 0
  let huerfanosOmitidosPorSeguridad = 0

  if (ventanaReconciliacionValida) {
    const pedidosEnArchivoSet = new Set(pedidosEnArchivo)
    const candidatosPedidos = new Set<string>()

    // Paginar por si la ventana tiene muchas filas (ventas por pedido = varias
    // líneas cada uno, así que el conteo de filas es mayor al de pedidos).
    const PAGE = 1000
    for (let offset = 0; ; offset += PAGE) {
      const { data: filas, error: selError } = await supabase
        .from('ventas')
        .select('pedido')
        .not('pedido', 'is', null)
        .gte('fecha_entrega', fechaEntregaDesde)
        .lte('fecha_entrega', fechaEntregaHasta)
        .range(offset, offset + PAGE - 1)

      if (selError) {
        console.error('[upload-ventas] error leyendo candidatos a huérfano:', selError.message)
        break
      }
      for (const f of filas ?? []) {
        const p = f.pedido as string
        if (esPedidoReal(p) && !pedidosEnArchivoSet.has(p)) candidatosPedidos.add(p)
      }
      if (!filas || filas.length < PAGE) break
    }

    if (candidatosPedidos.size > MAX_HUERFANOS_POR_SYNC) {
      huerfanosOmitidosPorSeguridad = candidatosPedidos.size
      console.error(
        `[upload-ventas] Reconciliación abortada por seguridad: ${candidatosPedidos.size} ` +
        `pedidos candidatos a huérfano en ventana ${fechaEntregaDesde}..${fechaEntregaHasta} ` +
        `(tope ${MAX_HUERFANOS_POR_SYNC}). Revisar manualmente antes de subir el tope.`
      )
    } else if (candidatosPedidos.size > 0) {
      const lista = [...candidatosPedidos]
      for (let i = 0; i < lista.length; i += 500) {
        const lote = lista.slice(i, i + 500)
        const { error: deleteHuerfanoError } = await supabase.from('ventas').delete().in('pedido', lote)
        if (deleteHuerfanoError) {
          console.error('[upload-ventas] error borrando huérfanos:', deleteHuerfanoError.message)
          break
        }
        pedidosHuerfanosBorrados += lote.length
      }
    }

    // ── Reconciliación de pedidos PENDIENTES huérfanos ─────────────────────
    // El bloque de arriba nunca toca un pedido con fecha_entrega NULL (no hay
    // fecha de entrega contra la cual acotar una ventana segura). Pero un
    // pedido "Sin facturar aún" que el ERP cancela/reemplaza tampoco avisa:
    // simplemente deja de aparecer, igual que uno entregado — y sin este
    // bloque queda huérfano para siempre, sumando de más en el cliente (caso
    // real: Rausch Restobar, pedido #00054390, sep-2026).
    //
    // Señal segura sin inferir ninguna ventana de fechas: el sync borra e
    // reinserta la fila completa de cada pedido en CADA corrida (nunca hace
    // UPDATE) — created_at es entonces "última vez que este pedido apareció
    // en un archivo del ERP", no la fecha del pedido (ver migración
    // revierte_creado_en_de_pedidos_cliente_no_confiable.sql, que rechazó
    // usar created_at como fecha visible por esto mismo — pero es exactamente
    // la señal correcta para "¿lo sigue devolviendo el ERP?"). El cron pide
    // el período activo completo con "incluir pendientes" cada 15 min en
    // horario comercial, así que un pendiente vivo se refresca seguido; uno
    // con más de UMBRAL_HORAS sin refrescarse ya no viene en ningún archivo.
    // Umbral generoso para absorber fines de semana/fuera de horario sin
    // falsos positivos. Mismo circuit breaker que arriba, mismo criterio de
    // "sólo pedidos con formato numérico real".
    const UMBRAL_HORAS_PENDIENTE_HUERFANO = 48
    const limitePendiente = new Date(
      Date.now() - UMBRAL_HORAS_PENDIENTE_HUERFANO * 3600 * 1000
    ).toISOString()

    const candidatosPendientes = new Set<string>()
    let selPendError: { message: string } | null = null
    for (let offset = 0; ; offset += PAGE) {
      const { data: filas, error } = await supabase
        .from('ventas')
        .select('pedido')
        .is('fecha_entrega', null)
        .not('pedido', 'is', null)
        .lt('created_at', limitePendiente)
        .range(offset, offset + PAGE - 1)

      if (error) {
        selPendError = error
        console.error('[upload-ventas] error leyendo candidatos a pendiente huérfano:', error.message)
        break
      }
      for (const f of filas ?? []) {
        const p = f.pedido as string
        if (esPedidoReal(p) && !pedidosEnArchivoSet.has(p)) candidatosPendientes.add(p)
      }
      if (!filas || filas.length < PAGE) break
    }

    if (!selPendError) {
      if (candidatosPendientes.size > MAX_HUERFANOS_POR_SYNC) {
        huerfanosOmitidosPorSeguridad += candidatosPendientes.size
        console.error(
          `[upload-ventas] Reconciliación de pendientes abortada por seguridad: ` +
          `${candidatosPendientes.size} candidatos (tope ${MAX_HUERFANOS_POR_SYNC}). Revisar manualmente.`
        )
      } else if (candidatosPendientes.size > 0) {
        const lista = [...candidatosPendientes]
        for (let i = 0; i < lista.length; i += 500) {
          const lote = lista.slice(i, i + 500)
          const { error: deletePendHuerfanoError } = await supabase.from('ventas').delete().in('pedido', lote)
          if (deletePendHuerfanoError) {
            console.error('[upload-ventas] error borrando pendientes huérfanos:', deletePendHuerfanoError.message)
            break
          }
          pedidosPendientesHuerfanosBorrados += lote.length
        }
      }
    }
  }

  // ── Refrescar el caché de métricas de cliente ───────────────────────────
  // `client_metrics_cache` (ver supabase/migrations/client_metrics_cache_
  // materializado.sql) guarda ya calculados el ciclo de compra, el score y
  // la segmentación de cada cliente, porque recalcularlos en vivo cuesta
  // ~3,7 s por carga de pantalla. Ese caché sólo queda viejo cuando entran
  // ventas nuevas — o sea, exactamente acá.
  //
  // Tolerante a que la migración todavía no esté aplicada: si la función no
  // existe, se ignora. Y nunca hace fallar el sync: las ventas ya están
  // guardadas, y un caché un rato viejo es infinitamente mejor que perder
  // la carga del ERP por un refresco.
  let cacheRefrescado = false
  {
    const { error: refreshError } = await supabase.rpc('refrescar_client_metrics')
    cacheRefrescado = !refreshError
  }

  // Sin notificación acá a propósito: la carga de ventas es un sync de
  // datos del ERP (cron cada 10 min), no una acción de un trabajador — a
  // diferencia de entregas/ventas de vendedor/tareas, Claudio pidió
  // explícitamente que esta sea la única que NO dispare aviso.

  // ── Tracking del modelo de predicción de compra ──────────────────────────
  // Registra la predicción vigente de hoy y cierra las predicciones anteriores
  // cuyo cliente ya compró (guardando el error en días). Es lo que permite
  // medir si el modelo mejora y recalibrarlo con datos reales — ver
  // supabase/migrations/ciclo_estacional_v2.sql y calibracion_modelo.
  // Idempotente (UNIQUE por cliente+día), así que correr en cada sync no
  // duplica. No debe tumbar la carga de ventas si falla: es telemetría.
  let prediccionesNuevas = 0
  let prediccionesCerradas = 0
  let recalibracion: string | null = null
  try {
    const { data: pred, error: predError } = await supabase.rpc('actualizar_predicciones')
    if (predError) {
      console.error('[upload-ventas] actualizar_predicciones falló:', predError.message)
    } else if (pred?.[0]) {
      prediccionesNuevas   = pred[0].nuevas   ?? 0
      prediccionesCerradas = pred[0].cerradas ?? 0
    }

    // Recalibración del modelo. Trae su propio guard semanal, así que llamarla
    // en cada sync (cada 15 min) es barato y no produce ruido: sólo reajusta
    // el factor si pasaron 7 días Y hay >=100 predicciones cerradas nuevas.
    const { data: recal, error: recalError } = await supabase.rpc('recalibrar_modelo')
    if (recalError) {
      console.error('[upload-ventas] recalibrar_modelo falló:', recalError.message)
    } else if (recal?.[0]) {
      recalibracion = recal[0].aplicado
        ? `factor -> ${recal[0].factor_nuevo} (${recal[0].n} muestras, sesgo ${recal[0].sesgo}d)`
        : recal[0].motivo ?? null
    }
  } catch (e) {
    console.error('[upload-ventas] tracking del modelo, excepción:', e)
  }

  // Visibilidad del estado de entrega en el log del sync: si un día "faltan"
  // ventas, se ve de una si es que están cargadas pero sin entregar.
  const sinEntregar = registros.filter(r => !r.fecha_entrega).length

  return NextResponse.json({
    insertadas,
    cacheRefrescado,
    entregadas: insertadas - sinEntregar,
    pendientesDeEntrega: sinEntregar,
    pedidosHuerfanosBorrados,
    pedidosPendientesHuerfanosBorrados,
    huerfanosOmitidosPorSeguridad,
    reconciliacionActiva: ventanaReconciliacionValida,
    prediccionesNuevas,
    prediccionesCerradas,
    recalibracion,
    duplicadosEnArchivo,
    clientesInternosExcluidos,
    litrosInternosExcluidos,
    erroresMapeo: erroresMapeo.slice(0, 10),
    advertenciasLitros: advertenciasLitros.slice(0, 20),
    fechas: fechasOrdenadas,
    fechaMin: fechasOrdenadas[0],
    fechaMax: fechasOrdenadas[fechasOrdenadas.length - 1],
    vendedores: vendedoresResumen,
  })
}
