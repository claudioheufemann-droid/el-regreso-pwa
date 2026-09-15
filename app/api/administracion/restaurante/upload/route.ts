import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
import { getServerUser } from '@/lib/auth'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase no configurado')
  return createSupabaseClient(url, key)
}

/** yyyy-mm-dd desde un valor de celda que puede venir como fecha real
 *  (cellDates) o como texto "2026-09-15". */
function aFechaISO(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) return v.toISOString().slice(0, 10)
  const s = String(v ?? '').trim()
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

function aNumero(v: unknown): number {
  if (typeof v === 'number') return v
  const s = String(v ?? '').trim().replace(/["']/g, '')
  if (s === '' || s === '""') return 0
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/**
 * POST /api/administracion/restaurante/upload
 *
 * Carga el informe "Ventas Totales" del POS del restaurante (Toteat,
 * BaseCamp Pucón) — no viene del ERP de la cervecería, así que no hay sync
 * automático como con `ventas`: esto es la vía para mantener al día
 * `ventas_restaurante`, que alimenta el forecast de la pestaña Forecast en
 * Administración.
 *
 * El export de Toteat trae una fila por LÍNEA DE PRODUCTO (no por orden ni
 * por boleta) — "Precio a Pagar" ya es el total de esa línea (cantidad
 * incluida, con descuentos aplicados), así que sumar esa columna agrupando
 * por "Fecha de creacion" da la venta bruta (boleta, con impuesto) del día
 * sin tener que reconstruir órdenes ni boletas — evita toda la complejidad
 * de boletas partidas/pagos múltiples por mesa.
 *
 * Formato observado (15-sep-2026): el export de Toteat cae en Excel como UNA
 * sola columna con las filas separadas por tabulador en vez de columnas
 * reales — este parser detecta ese caso (la primera celda de la fila de
 * encabezado contiene '\t') y lo desarma antes de procesar; si algún día
 * Toteat exporta columnas de verdad, también funciona sin cambios.
 */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!user.isAdmin) return NextResponse.json({ error: 'Sólo administradores' }, { status: 403 })

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No se recibió archivo' }, { status: 400 })

  const buffer = await file.arrayBuffer()
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true })
  const ws = wb.Sheets[wb.SheetNames[0]]
  let filas: unknown[][] = XLSX.utils.sheet_to_json(ws, { defval: null, header: 1 }) as unknown[][]

  if (filas.length === 0) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })

  // Caso "todo en una columna separada por tabs".
  const primeraCelda = filas[0]?.[0]
  if (typeof primeraCelda === 'string' && primeraCelda.includes('\t') && (filas[0]?.length ?? 0) <= 2) {
    filas = filas.map(fila => String(fila[0] ?? '').split('\t'))
  }

  const header = filas[0].map(h => String(h ?? '').trim())
  const idxFecha = header.findIndex(h => h.toLowerCase().startsWith('fecha de creacion') || h.toLowerCase().startsWith('fecha de creación'))
  const idxPrecio = header.findIndex(h => h.toLowerCase().startsWith('precio a pagar'))

  if (idxFecha === -1 || idxPrecio === -1) {
    return NextResponse.json({
      error: `No se encontraron las columnas esperadas ("Fecha de creacion", "Precio a Pagar"). Columnas leídas: ${header.join(', ')}`,
    }, { status: 400 })
  }

  const porDia = new Map<string, { monto: number; filas: number }>()
  let filasIgnoradas = 0
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i]
    if (!fila || fila.length === 0) continue
    const fecha = aFechaISO(fila[idxFecha])
    if (!fecha) { filasIgnoradas++; continue }
    const monto = aNumero(fila[idxPrecio])
    const acc = porDia.get(fecha) ?? { monto: 0, filas: 0 }
    acc.monto += monto
    acc.filas += 1
    porDia.set(fecha, acc)
  }

  if (porDia.size === 0) {
    return NextResponse.json({ error: 'No se pudo leer ninguna fila válida del archivo' }, { status: 400 })
  }

  const admin = getAdminClient()
  const filasUpsert = [...porDia.entries()].map(([fecha, v]) => ({
    fecha, monto: Math.round(v.monto * 100) / 100, filas: v.filas, actualizado_at: new Date().toISOString(),
  }))

  // En lotes de 500 — mismo límite práctico que reemplazarTabla() en el
  // resto de la app.
  for (let i = 0; i < filasUpsert.length; i += 500) {
    const { error } = await admin.from('ventas_restaurante')
      .upsert(filasUpsert.slice(i, i + 500), { onConflict: 'fecha' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const fechas = [...porDia.keys()].sort()
  return NextResponse.json({
    ok: true,
    dias: porDia.size,
    filasLeidas: filas.length - 1,
    filasIgnoradas,
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
  })
}
