import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { SUPABASE_URL as SUPABASE_URL_CFG } from '@/lib/supabase/config'
import * as XLSX from 'xlsx'
import { esClienteExcluido } from '@/lib/types'
import { sendPushToAllAdmins } from '@/lib/push'

// Alias local para mantener compatibilidad con el nombre anterior
const esClienteInterno = esClienteExcluido

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
      const fechaEntrega = parseFecha(
        row['FechaEntrega'] ?? row['Fecha entrega'] ?? row['Fecha Entrega']
      )
      const fechaEntregaEstimada = parseFecha(
        row['FechaEntregaEstimada'] ?? row['Fecha Entrega Estimada'] ?? row['Fecha entrega estimada']
      )

      return {
        fecha_pedido: fechaPedido,
        fecha_entrega: fechaEntrega,
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
  const pedidosEnArchivo = [
    ...new Set(registros.map(r => r.pedido).filter((p): p is string => !!p)),
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

  // Filas sin número de pedido (cargas manuales antiguas sin ese dato):
  // mantener el criterio anterior de reemplazo por vendedor+fecha, acotado a
  // esas mismas filas para no interferir con el borrado por pedido de arriba.
  const combinacionesSinPedido = [
    ...new Map(
      registros
        .filter(r => !r.pedido)
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
      .is('pedido', null)

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

  // 🔔 Notificación a admins cuando se cargan ventas
  if (insertadas > 0) {
    sendPushToAllAdmins({
      title: '📊 Ventas cargadas',
      body: `Se insertaron ${insertadas} registros de ventas`,
      url: '/ventas',
      tag: 'venta_cargada',
    }).catch(() => {})
  }

  // Visibilidad del estado de entrega en el log del sync: si un día "faltan"
  // ventas, se ve de una si es que están cargadas pero sin entregar.
  const sinEntregar = registros.filter(r => !r.fecha_entrega).length

  return NextResponse.json({
    insertadas,
    entregadas: insertadas - sinEntregar,
    pendientesDeEntrega: sinEntregar,
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
