/**
 * Cron diario — alerta_deuda. Notifica por push a cada vendedor (por región)
 * y a los admins cuando hay clientes con deuda vencida en su zona.
 *
 * Usa SERVICE ROLE: el RLS por región (clientes/deudores) bloquearía esta
 * lectura agregada si se usara la key anónima, ya que el cron no tiene
 * sesión de usuario autenticado.
 */
import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { regionDeProvincia, REGIONES_OPERATIVAS } from '@/lib/regiones'
import { sendPushToUsers, sendPushToAllAdmins } from '@/lib/push'

export const runtime = 'nodejs'

function fmtPeso(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 })
  const supabase = createServiceClient(url, key)

  // 1. Deudores con deuda vencida
  const { data: deudoresRaw } = await supabase
    .from('deudores')
    .select('nombre_fantasia, deuda_vencida')
    .gt('deuda_vencida', 0)

  const deudores = deudoresRaw ?? []
  if (deudores.length === 0) {
    return NextResponse.json({ ok: true, message: 'Sin deuda vencida hoy' })
  }

  // 2. Provincia de cada cliente con deuda (para derivar región)
  const nombres = deudores.map(d => d.nombre_fantasia).filter(Boolean) as string[]
  const { data: clientesRaw } = await supabase
    .from('clientes')
    .select('nombre_fantasia, provincia')
    .in('nombre_fantasia', nombres)

  const provinciaPorCliente = new Map<string, string | null>()
  for (const c of clientesRaw ?? []) provinciaPorCliente.set(c.nombre_fantasia as string, c.provincia as string | null)

  // 3. Agrupar deuda por región
  const porRegion = new Map<string, { count: number; total: number }>()
  for (const d of deudores) {
    const provincia = provinciaPorCliente.get(d.nombre_fantasia)
    const region = regionDeProvincia(provincia)
    if (!region) continue
    const acc = porRegion.get(region) ?? { count: 0, total: 0 }
    acc.count += 1
    acc.total += d.deuda_vencida ?? 0
    porRegion.set(region, acc)
  }

  // 4. Vendedores por región → push individual
  const { data: vendedores } = await supabase
    .from('users')
    .select('id, region')
    .eq('is_admin', false)
    .in('region', REGIONES_OPERATIVAS as unknown as string[])

  const results: { region: string; vendedores: number; clientes: number }[] = []

  for (const [region, info] of porRegion.entries()) {
    const ids = (vendedores ?? []).filter(v => v.region === region).map(v => v.id)
    if (ids.length === 0) continue
    await sendPushToUsers(ids, {
      title: `💰 ${info.count} cliente${info.count !== 1 ? 's' : ''} con deuda vencida`,
      body: `${fmtPeso(info.total)} en total · región ${region}`,
      url: '/ventas/clientes',
      tag: 'alerta_deuda',
    })
    results.push({ region, vendedores: ids.length, clientes: info.count })
  }

  // 5. Resumen global a admins
  const totalClientes = deudores.length
  const totalDeuda = deudores.reduce((s, d) => s + (d.deuda_vencida ?? 0), 0)
  await sendPushToAllAdmins({
    title: `💰 ${totalClientes} clientes con deuda vencida hoy`,
    body: `${fmtPeso(totalDeuda)} vencido en total · todas las regiones`,
    url: '/ventas/admin/deudores',
    tag: 'alerta_deuda',
  })

  return NextResponse.json({ ok: true, results, totalClientes, totalDeuda })
}
