/**
 * Cron diario (09:00 Chile) — resumen de cartera: clientes en riesgo de
 * quiebre de stock + clientes con deuda vencida hasta el momento.
 *
 * Reemplaza a /api/cron/deuda-alerts (sólo cubría deuda, agrupada por
 * REGIÓN). Acá se agrupa por CARTERA real del vendedor (vendedoresErp, el
 * mismo criterio ya corregido hoy en app/ventas/clientes/page.tsx — región y
 * cartera no siempre calzan 1 a 1), y el resumen de admin queda segmentado
 * por vendedor en vez de un solo total global.
 *
 * SERVICE ROLE a propósito: el RLS de `deudores`/`client_scores`/`users`
 * exige sesión autenticada; el cron no tiene una. Ver lib/supabase/admin.ts.
 *
 * Horario: vercel.json usa "0 13 * * *" (13:00 UTC = 09:00 Chile con el
 * huso de invierno, UTC-4). Vercel Cron no soporta zona horaria con nombre,
 * así que si Chile entra en horario de verano (UTC-3) esto va a disparar a
 * las 10:00 en vez de las 09:00 — mismo límite que ya tienen el resto de los
 * crons de este repo (agenda-diaria, task-alerts, etc.), no es nuevo acá.
 */
import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { vendedorCanonico, nombresErpDe, esClienteExcluido } from '@/lib/types'
import { calcularStock, riesgoDeBand, type FrequencyStat } from '@/lib/stockRiesgo'
import { sendPushToUsers, sendPushToAllAdmins } from '@/lib/push'

export const runtime = 'nodejs'

function fmtPeso(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

type ScoreRow = FrequencyStat & { nombre_fantasia: string; ultima_compra: string | null }

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 })
  const supabase = createServiceClient(url, key)

  const [{ data: scoresRaw }, { data: clientesRaw }, { data: deudoresRaw }, { data: vendedoresRaw }] = await Promise.all([
    supabase.from('client_scores')
      .select('nombre_fantasia, ciclo_promedio_dias, dias_sin_compra, total_pedidos, litros_totales, revenue_total, siguiente_compra_estimada, temporada_baja, ultima_compra'),
    supabase.from('clientes').select('nombre_fantasia, vendedor'),
    supabase.from('deudores').select('nombre_fantasia, deuda_vencida, vendedor').gt('deuda_vencida', 0),
    supabase.from('users').select('id, nombre, vendedores_erp').eq('is_admin', false),
  ])

  // client_scores trae UNA FILA POR (nombre_fantasia, vendedor_actual) — un
  // mismo cliente puede tener varias si el ERP le cambió el vendedor. Nos
  // quedamos con la más reciente (mismo criterio que app/ventas/clientes/page.tsx).
  const scorePorCliente = new Map<string, ScoreRow>()
  for (const s of (scoresRaw ?? []) as ScoreRow[]) {
    if (!s.nombre_fantasia) continue
    const actual = scorePorCliente.get(s.nombre_fantasia)
    if (!actual || (s.ultima_compra ?? '') > (actual.ultima_compra ?? '')) scorePorCliente.set(s.nombre_fantasia, s)
  }

  const vendedorPorCliente = new Map((clientesRaw ?? []).map(c => [c.nombre_fantasia as string, c.vendedor as string | null]))

  // ── Clientes en riesgo de quiebre de stock ──────────────────────────────
  const riesgo: { nombre: string; vendedorRaw: string | null }[] = []
  for (const [nombre, s] of scorePorCliente) {
    if (esClienteExcluido(nombre)) continue
    const stock = calcularStock(s)
    if (!stock) continue
    if (riesgoDeBand(stock.band, stock.temporadaBaja) !== 'alto') continue
    riesgo.push({ nombre, vendedorRaw: vendedorPorCliente.get(nombre) ?? null })
  }

  // ── Clientes con deuda vencida ───────────────────────────────────────────
  const deuda = (deudoresRaw ?? [])
    .filter(d => !esClienteExcluido(d.nombre_fantasia as string))
    .map(d => ({
      nombre: d.nombre_fantasia as string,
      monto: d.deuda_vencida as number,
      vendedorRaw: (d.vendedor as string | null) ?? vendedorPorCliente.get(d.nombre_fantasia as string) ?? null,
    }))

  if (riesgo.length === 0 && deuda.length === 0) {
    return NextResponse.json({ ok: true, message: 'Sin riesgo de stock ni deuda vencida hoy' })
  }

  // ── Agrupar por cartera real del vendedor ───────────────────────────────
  const resumenPorVendedor: { id: string; nombre: string; riesgo: number; deuda: number; montoDeuda: number }[] = []

  for (const v of vendedoresRaw ?? []) {
    const erp = (v.vendedores_erp ?? []) as string[]
    if (erp.length === 0) continue
    const canonico = vendedorCanonico(erp[0])
    const scopeRaw = new Set(nombresErpDe(canonico))

    const miRiesgo = riesgo.filter(r => r.vendedorRaw && scopeRaw.has(r.vendedorRaw))
    const miDeuda = deuda.filter(d => d.vendedorRaw && scopeRaw.has(d.vendedorRaw))
    if (miRiesgo.length === 0 && miDeuda.length === 0) continue

    const montoDeuda = miDeuda.reduce((s, d) => s + d.monto, 0)
    resumenPorVendedor.push({ id: v.id, nombre: v.nombre, riesgo: miRiesgo.length, deuda: miDeuda.length, montoDeuda })

    const partes: string[] = []
    if (miRiesgo.length > 0) partes.push(`${miRiesgo.length} en riesgo de quiebre de stock`)
    if (miDeuda.length > 0) partes.push(`${miDeuda.length} con deuda vencida (${fmtPeso(montoDeuda)})`)

    await sendPushToUsers([v.id], {
      title: '📋 Resumen diario de tu cartera',
      body: partes.join(' · '),
      url: '/ventas/clientes',
      tag: 'cartera-diaria',
    })
  }

  // ── Resumen a admins, segmentado por vendedor ───────────────────────────
  if (resumenPorVendedor.length > 0) {
    const lineas = resumenPorVendedor
      .sort((a, b) => (b.riesgo + b.deuda) - (a.riesgo + a.deuda))
      .map(r => `${r.nombre.split(' ')[0]}: ${r.riesgo} riesgo · ${r.deuda} deuda (${fmtPeso(r.montoDeuda)})`)

    const totalRiesgo = riesgo.length
    const totalDeuda = deuda.reduce((s, d) => s + d.monto, 0)

    await sendPushToAllAdmins({
      title: `📋 Cartera: ${totalRiesgo} en riesgo de stock, ${deuda.length} con deuda`,
      body: `${fmtPeso(totalDeuda)} vencido en total\n${lineas.join('\n')}`,
      url: '/ventas/clientes',
      tag: 'cartera-diaria',
    })
  }

  return NextResponse.json({
    ok: true,
    totalRiesgo: riesgo.length,
    totalDeuda: deuda.length,
    montoDeuda: deuda.reduce((s, d) => s + d.monto, 0),
    porVendedor: resumenPorVendedor,
  })
}
