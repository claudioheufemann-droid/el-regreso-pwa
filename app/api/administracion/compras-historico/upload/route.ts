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
 * POST /api/administracion/compras-historico/upload
 *
 * Carga el informe "Compras detalladas" del ERP (línea por insumo, no por
 * factura) a `compras_historico`, agregando por Fecha + Proveedor con
 * "Total$" — mismo criterio que el histórico inicial (15-sep-2026).
 * Alimenta el forecast de Compras (por proveedor) en la pestaña Forecast.
 *
 * A diferencia de "Compras Pagos" (que alimenta compras_comprometidas, el
 * flujo de caja semanal), esto es sólo para el forecast de PATRÓN de compra
 * — no tiene fecha de pago ni estado, y una fila puede llegar antes de que
 * se pague. Soporta tanto el export normal (columnas reales) como el caso
 * "una sola columna separada por tabs" que se vio en el informe de
 * Restaurante (Toteat) — Compras detalladas normalmente NO cae en ese caso,
 * pero el parser lo detecta igual por si el ERP cambia el formato.
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
  // El export trae una hoja "Sheet1" (con encabezados en español, acentos
  // rotos) y una hoja "Datos" (mismos datos, encabezados normalizados sin
  // espacios/acentos) — se prefiere "Datos" cuando existe, es más fácil de
  // matchear de forma estable.
  const nombreHoja = wb.SheetNames.includes('Datos') ? 'Datos' : wb.SheetNames[0]
  const ws = wb.Sheets[nombreHoja]
  let filas: unknown[][] = XLSX.utils.sheet_to_json(ws, { defval: null, header: 1 }) as unknown[][]

  if (filas.length === 0) return NextResponse.json({ error: 'Archivo vacío' }, { status: 400 })

  const primeraCelda = filas[0]?.[0]
  if (typeof primeraCelda === 'string' && primeraCelda.includes('\t') && (filas[0]?.length ?? 0) <= 2) {
    filas = filas.map(fila => String(fila[0] ?? '').split('\t'))
  }

  const header = filas[0].map(h => String(h ?? '').trim())
  const idxFecha = header.findIndex(h => /^fecha$/i.test(h))
  const idxProveedor = header.findIndex(h => /^proveedor$/i.test(h))
  const idxTotal = header.findIndex(h => /^total\$?$/i.test(h))

  if (idxFecha === -1 || idxProveedor === -1 || idxTotal === -1) {
    return NextResponse.json({
      error: `No se encontraron las columnas esperadas ("Fecha", "Proveedor", "Total$"). Columnas leídas: ${header.join(', ')}`,
    }, { status: 400 })
  }

  const porFechaProveedor = new Map<string, { proveedor: string; monto: number; filas: number }>()
  let filasIgnoradas = 0
  for (let i = 1; i < filas.length; i++) {
    const fila = filas[i]
    if (!fila || fila.length === 0) continue
    const fecha = aFechaISO(fila[idxFecha])
    const proveedor = String(fila[idxProveedor] ?? '').trim()
    if (!fecha || !proveedor) { filasIgnoradas++; continue }
    const monto = aNumero(fila[idxTotal])
    const clave = `${fecha}::${proveedor}`
    const acc = porFechaProveedor.get(clave) ?? { proveedor, monto: 0, filas: 0 }
    acc.monto += monto
    acc.filas += 1
    porFechaProveedor.set(clave, acc)
  }

  if (porFechaProveedor.size === 0) {
    return NextResponse.json({ error: 'No se pudo leer ninguna fila válida del archivo' }, { status: 400 })
  }

  const admin = getAdminClient()
  const filasUpsert = [...porFechaProveedor.entries()].map(([clave, v]) => ({
    fecha: clave.split('::')[0], proveedor: v.proveedor,
    monto: Math.round(v.monto * 100) / 100, filas: v.filas, actualizado_at: new Date().toISOString(),
  }))

  for (let i = 0; i < filasUpsert.length; i += 500) {
    const { error } = await admin.from('compras_historico')
      .upsert(filasUpsert.slice(i, i + 500), { onConflict: 'fecha,proveedor' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const fechas = [...new Set(filasUpsert.map(f => f.fecha))].sort()
  return NextResponse.json({
    ok: true,
    filasGuardadas: filasUpsert.length,
    proveedores: new Set(filasUpsert.map(f => f.proveedor)).size,
    filasLeidas: filas.length - 1,
    filasIgnoradas,
    desde: fechas[0],
    hasta: fechas[fechas.length - 1],
  })
}
