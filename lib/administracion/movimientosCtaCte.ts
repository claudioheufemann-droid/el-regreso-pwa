/**
 * Parser del informe "Movimientos Cta. Cte." del ERP — la única fuente de
 * PAGOS REALES que tiene el sistema.
 *
 * Hasta septiembre de 2026 el módulo de Finanzas no tenía ninguna tabla de
 * cobros: sabía qué se despachó (`ventas`) y cuánta deuda quedaba
 * (`deudores`), pero nunca cuándo entró la plata. Por eso `calcularPrecisionCobro`
 * está documentado como una aproximación y no una conciliación. Este informe
 * cierra ese hueco: trae fecha real de pago, monto, método y —en la mayoría
 * de los casos— a qué guía corresponde.
 *
 * ── LAS TRES TRAMPAS DEL INFORME ──────────────────────────────────────────
 *
 * 1) CUENTAS ESPEJO DE PDV — un mismo pago aparece TRES veces en la columna
 *    "Debe". Para un pedido de $5.600 el ERP escribe:
 *      · Cliente PDV        | "Pago Pedido 00054979"          | Debe 5.600
 *      · Cliente Debito PDV | "Débito Pago Pedido 00054979"   | Debe 5.600
 *      · Cliente Debito PDV | "Pago Pedido 00054979"          | Debe 5.600
 *    Sumar plano infla PDV 3x. Verificado contra los datos reales de 12
 *    meses: las cuentas espejo suman $329.502.910 = exactamente 2× los
 *    $164.684.520 de la cuenta real `Cliente PDV`, y el desglose por método
 *    de las espejo (débito 128,6M + crédito 23,6M + efectivo 12,5M) calza
 *    al peso con ese mismo total. O sea: las espejo NO son plata adicional,
 *    son el desglose por medio de pago de la misma plata.
 *    → Se cuenta la plata SÓLO en la cuenta real, y las espejo se usan
 *      únicamente para saber CÓMO se pagó cada pedido.
 *
 * 2) EL MÉTODO DE PAGO ESTÁ EN DOS LUGARES DISTINTOS — para clientes B2B
 *    viene en la columna "TipoDePago" (Depósito bancario, Transferencia…),
 *    pero para PDV esa columna miente: el ERP marca "Efectivo" en las filas
 *    espejo aunque el pago haya sido con tarjeta. Para PDV el método real
 *    está en el PREFIJO de la descripción de la fila espejo ("Débito Pago
 *    Pedido", "Tarjeta Crédito Pago Pedido", "Efectivo Pago Pedido").
 *
 * 3) NO TODO "Debe" ES PLATA QUE ENTRA — hay anulaciones de guía
 *    ($55,3M en 12 meses), notas de crédito y ajustes manuales contables.
 *    Se excluyen a propósito y se devuelven contados aparte, para que
 *    Administración vea que existen en vez de que desaparezcan en silencio.
 */

/** Métodos normalizados. 'otro' cubre anticipos y casos sin clasificar. */
export type MetodoPago =
  | 'deposito'
  | 'transferencia'
  | 'efectivo'
  | 'tarjeta_debito'
  | 'tarjeta_credito'
  | 'otro'

export const LABEL_METODO: Record<MetodoPago, string> = {
  deposito: 'Depósito bancario',
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  tarjeta_debito: 'Tarjeta débito',
  tarjeta_credito: 'Tarjeta crédito',
  otro: 'Otro',
}

export interface CobroParsed {
  /** yyyy-mm-dd del pago. */
  fecha: string
  cliente: string
  monto: number
  metodo: MetodoPago
  /** Nº de guía que paga, sin ceros a la izquierda — null si el pago no la
   *  referencia (≈22% de los casos: pagos globales, abonos parciales). */
  guia: string | null
  factura: string | null
  /** Fecha de la guía cruzada dentro del mismo informe. */
  fechaGuia: string | null
  /** fecha − fechaGuia. Null si no se pudo cruzar. Es el insumo del
   *  comportamiento de pago real por cliente. */
  diasPago: number | null
}

export interface ResultadoParseo {
  cobros: CobroParsed[]
  /** Diagnóstico para mostrarle a quien carga el archivo: qué se contó, qué
   *  se descartó y por qué. Sin esto, un cambio de formato del ERP pasaría
   *  desapercibido hasta que los números estuvieran mal. */
  diagnostico: {
    filasLeidas: number
    filasEspejoIgnoradas: number
    montoEspejoIgnorado: number
    anulaciones: number
    montoAnulaciones: number
    ajustesContables: number
    montoAjustes: number
    cobrosConGuia: number
    cobrosCruzados: number
    desde: string | null
    hasta: string | null
  }
}

/* ── Utilidades de normalización ────────────────────────────────────────── */

function sinAcentos(v: string): string {
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Primer número de 4+ dígitos, sin ceros a la izquierda ("Guía 00065064" →
 *  "65064"). Se extrae por dígitos y no por texto a propósito: el informe
 *  llega a veces con los acentos rotos ("Gu?a") según cómo lo exporte el ERP. */
function primerNumero(v: string): string | null {
  const m = v.match(/(\d{4,})/)
  if (!m) return null
  const limpio = m[1].replace(/^0+/, '')
  return limpio === '' ? null : limpio
}

export function aFechaISO(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // El xlsx entrega la fecha en UTC; se toma la parte de fecha tal cual,
    // sin convertir a zona local (convertir corre un día hacia atrás en Chile).
    return v.toISOString().slice(0, 10)
  }
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** "$41.009.555,19" → 41009555.19. El informe viene con formato chileno
 *  (punto de miles, coma decimal) y a veces ya como número. */
export function aMonto(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0
  const s = String(v ?? '').trim()
  if (!s) return 0
  const limpio = s.replace(/[$\s]/g, '').replace(/\./g, '').replace(',', '.')
  const n = Number(limpio)
  return Number.isFinite(n) ? n : 0
}

/** ¿Es una de las cuentas espejo de PDV? (ver trampa 1 arriba) */
export function esCuentaEspejo(cliente: string): boolean {
  return /^cliente\s+(debito|credito|efectivo|merma)\s+pdv$/i.test(sinAcentos(cliente).trim())
}

function metodoDesdeTipoPago(v: string): MetodoPago | null {
  const t = sinAcentos(v).toLowerCase().trim()
  if (!t) return null
  if (t.includes('deposito')) return 'deposito'
  if (t.includes('transferencia')) return 'transferencia'
  if (t.includes('credito')) return 'tarjeta_credito'
  if (t.includes('debito')) return 'tarjeta_debito'
  if (t.includes('efectivo')) return 'efectivo'
  return 'otro'
}

/** Método real de un pago de PDV, leído del prefijo de la fila espejo. */
function metodoDesdeDescripcionEspejo(desc: string): MetodoPago | null {
  const d = sinAcentos(desc).toLowerCase().trim()
  if (d.startsWith('tarjeta credito')) return 'tarjeta_credito'
  if (d.startsWith('debito')) return 'tarjeta_debito'
  if (d.startsWith('efectivo')) return 'efectivo'
  return null
}

/** Movimientos contables que NO son plata entrando (ver trampa 3). */
function esAnulacion(desc: string): boolean {
  const d = sinAcentos(desc).toLowerCase()
  return d.startsWith('anulacion') || d.startsWith('cancelacion') || d.startsWith('saldo a favor')
}
function esAjusteContable(desc: string): boolean {
  const d = sinAcentos(desc).toLowerCase()
  return d.startsWith('ajuste') || d.startsWith('nc ') || d.startsWith('traspaso') ||
    d.startsWith('factura') || d.startsWith('menos factura') || d.startsWith('fv ')
}

interface ColIdx {
  cliente: number; fecha: number; tipoPago: number; desc: number
  remito: number; factura: number; debe: number; haber: number
}

/** Ubica las columnas por nombre, tolerando acentos rotos y las dos variantes
 *  de encabezado que exporta el ERP (hoja "Sheet1" vs. hoja "Datos"). */
export function ubicarColumnas(header: unknown[]): ColIdx | null {
  const norm = header.map(h => sinAcentos(String(h ?? '')).toLowerCase().replace(/[\s.]/g, ''))
  const buscar = (...alts: string[]) => norm.findIndex(h => alts.some(a => h === a || h.startsWith(a)))
  const idx: ColIdx = {
    cliente: buscar('nombredefantasia', 'nombredefantas'),
    fecha: buscar('fecha'),
    tipoPago: buscar('tipodepago'),
    desc: buscar('descripcion', 'descripci'),
    remito: buscar('remito', 'guia'),
    factura: buscar('facturaenminusculas', 'factura'),
    debe: buscar('debe'),
    haber: buscar('haber'),
  }
  if (idx.cliente === -1 || idx.fecha === -1 || idx.debe === -1 || idx.desc === -1) return null
  return idx
}

/**
 * Convierte las filas crudas del xlsx en cobros reales, ya deduplicados.
 * `filas[0]` debe ser el encabezado.
 */
export function parsearMovimientos(filas: unknown[][]): ResultadoParseo | { error: string } {
  if (filas.length < 2) return { error: 'El archivo no tiene filas de datos.' }

  const idx = ubicarColumnas(filas[0])
  if (!idx) {
    return {
      error: `No se encontraron las columnas esperadas (Nombre de fantasía, Fecha, Descripción, Debe). ` +
        `Columnas leídas: ${filas[0].map(h => String(h ?? '')).join(', ')}`,
    }
  }

  const cel = (fila: unknown[], i: number) => (i === -1 ? '' : String(fila[i] ?? '').trim())

  /* Paso 1 — índice de guías: número de guía → fecha en que se emitió.
     Sale de las filas "REMITO #" (la venta), que son las que cargan la deuda
     del cliente. Es lo que después permite medir cuántos días tardó el pago. */
  const fechaPorGuia = new Map<string, string>()
  /* Paso 2 — índice de métodos de PDV: nº de pedido → método real, leído de
     las filas espejo (ver trampa 2). */
  const metodoPorPedido = new Map<string, MetodoPago>()

  for (const fila of filas.slice(1)) {
    if (!fila?.length) continue
    const desc = cel(fila, idx.desc)
    const cliente = cel(fila, idx.cliente)

    if (sinAcentos(desc).toUpperCase().startsWith('REMITO') && aMonto(fila[idx.haber]) > 0) {
      const guia = primerNumero(desc)
      const fecha = aFechaISO(fila[idx.fecha])
      // Si la misma guía aparece más de una vez gana la fecha más temprana:
      // esa es la emisión, el resto son reimpresiones o ajustes posteriores.
      if (guia && fecha && (!fechaPorGuia.has(guia) || fecha < fechaPorGuia.get(guia)!)) {
        fechaPorGuia.set(guia, fecha)
      }
    }

    if (esCuentaEspejo(cliente)) {
      const metodo = metodoDesdeDescripcionEspejo(desc)
      const pedido = primerNumero(desc)
      if (metodo && pedido) metodoPorPedido.set(pedido, metodo)
    }
  }

  /* Paso 3 — recorrer los cobros reales. */
  const cobros: CobroParsed[] = []
  const diag = {
    filasLeidas: filas.length - 1,
    filasEspejoIgnoradas: 0,
    montoEspejoIgnorado: 0,
    anulaciones: 0,
    montoAnulaciones: 0,
    ajustesContables: 0,
    montoAjustes: 0,
    cobrosConGuia: 0,
    cobrosCruzados: 0,
    desde: null as string | null,
    hasta: null as string | null,
  }

  for (const fila of filas.slice(1)) {
    if (!fila?.length) continue
    const monto = aMonto(fila[idx.debe])
    if (monto <= 0) continue

    const cliente = cel(fila, idx.cliente)
    if (!cliente) continue

    if (esCuentaEspejo(cliente)) {
      diag.filasEspejoIgnoradas++
      diag.montoEspejoIgnorado += monto
      continue
    }

    const desc = cel(fila, idx.desc)
    const tipoPago = cel(fila, idx.tipoPago)

    // El método de pago declarado manda por sobre lo que diga la descripción:
    // el ERP sólo le pone método (Depósito bancario, Transferencia, Efectivo,
    // Tarjeta) a movimientos de plata de verdad. Verificado contra 12 meses:
    // NINGUNA anulación trae método declarado, mientras que $15,3M de
    // depósitos reales sí traen una nota en la descripción ("Factura 123 por
    // $X", "Anticipo…"). Filtrar por descripción antes que por método
    // descartaba esos depósitos como si fueran asientos contables.
    if (!tipoPago) {
      if (esAnulacion(desc)) { diag.anulaciones++; diag.montoAnulaciones += monto; continue }
      if (esAjusteContable(desc)) { diag.ajustesContables++; diag.montoAjustes += monto; continue }
    }

    const fecha = aFechaISO(fila[idx.fecha])
    if (!fecha) continue
    const descNorm = sinAcentos(desc).toLowerCase()
    const referencia = cel(fila, idx.remito)

    let metodo: MetodoPago
    let guia: string | null = null

    if (tipoPago) {
      // Cobro B2B: el método viene en su columna y la referencia apunta a la
      // guía que se está pagando.
      metodo = metodoDesdeTipoPago(tipoPago) ?? 'otro'
      guia = primerNumero(referencia)
    } else if (descNorm.startsWith('pago pedido')) {
      // Venta de mostrador (PDV): cobro inmediato, el método lo aporta la
      // fila espejo del mismo pedido.
      const pedido = primerNumero(desc)
      metodo = (pedido && metodoPorPedido.get(pedido)) || 'efectivo'
      guia = primerNumero(referencia)
    } else if (descNorm.startsWith('anticipo')) {
      metodo = 'otro'
    } else {
      // Descripción desconocida sin método declarado: se cuenta aparte en vez
      // de sumarla a ciegas al ingreso real.
      diag.ajustesContables++
      diag.montoAjustes += monto
      continue
    }

    const fechaGuia = guia ? fechaPorGuia.get(guia) ?? null : null
    let diasPago: number | null = null
    if (fechaGuia) {
      const d = Math.round(
        (Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${fechaGuia}T00:00:00Z`)) / 86_400_000
      )
      // Fuera de [0, 365] es basura de datos (guía reemitida, fecha mal
      // cargada): se guarda el cobro igual, pero sin contaminar el plazo.
      if (d >= 0 && d <= 365) diasPago = d
    }

    if (guia) diag.cobrosConGuia++
    if (diasPago != null) diag.cobrosCruzados++

    cobros.push({
      fecha,
      cliente,
      monto: Math.round(monto * 100) / 100,
      metodo,
      guia,
      factura: cel(fila, idx.factura) || null,
      fechaGuia,
      diasPago,
    })
  }

  if (cobros.length === 0) return { error: 'No se encontró ningún cobro válido en el archivo.' }

  const fechas = cobros.map(c => c.fecha).sort()
  diag.desde = fechas[0]
  diag.hasta = fechas[fechas.length - 1]

  return { cobros, diagnostico: diag }
}

/** Mediana de una lista (no muta el arreglo original). */
function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

/**
 * Comportamiento de pago por cliente, a partir de los cobros ya cruzados.
 * Se usa para refrescar `clientes.dias_pago_real_*`, que es lo que la
 * proyección de caja ya consulta hoy.
 */
export function comportamientoPorCliente(cobros: CobroParsed[]) {
  const porCliente = new Map<string, number[]>()
  for (const c of cobros) {
    if (c.diasPago == null) continue
    const arr = porCliente.get(c.cliente) ?? []
    arr.push(c.diasPago)
    porCliente.set(c.cliente, arr)
  }
  return [...porCliente.entries()].map(([cliente, dias]) => ({
    cliente,
    muestras: dias.length,
    mediana: Math.round(mediana(dias)),
  }))
}
