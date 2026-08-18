import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@supabase/ssr'
import { createClient as createSbClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { getServerUser } from '@/lib/auth'

// Cron: lunes 13:00 UTC = 9:00 Chile (invierno UTC-4). En verano (UTC-3) llega 10:00.
// Plan Hobby solo permite 1 disparo diario; al pasar a Pro se puede afinar a "0 12,13".
export const runtime = 'nodejs'

const APP_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://el-regreso-pwa-psi.vercel.app'
const esComp = (e: string) => e === 'contactado_pedido' || e === 'auto_completado'

function ymd(d: Date) { return d.toISOString().split('T')[0] }
function fmt(s: string) { const [y, m, d] = s.split('-'); return `${+d}/${+m}/${y}` }
function fPeso(n: number) { return `$${Math.round(n).toLocaleString('es-CL')}` }
function fL(n: number) { return `${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })} L` }

// Lunes de hace N semanas (0 = esta, 1 = pasada)
function mondayAgo(weeks: number): Date {
  const d = new Date()
  const day = d.getDay()
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1) - weeks * 7)
  d.setHours(0, 0, 0, 0)
  return d
}

export async function GET(req: Request) {
  // Autoriza: (a) el cron de Vercel (Bearer CRON_SECRET) o (b) un admin logueado
  // que abre la URL en el navegador para enviar el reporte manualmente.
  const auth = req.headers.get('authorization')
  let authorized = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`
  let manual = false
  if (!authorized) {
    try {
      const user = await getServerUser()
      if (user?.isAdmin) { authorized = true; manual = true }
    } catch { /* sin sesión */ }
  }
  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
  // Para leer la tabla users (RLS bloquea al anónimo) usamos el service key si está
  const adminDb = process.env.SUPABASE_SERVICE_KEY
    ? createSbClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
    : supabase

  // Rangos: semana pasada (lun-dom) y la anterior (para delta)
  const lastMon = mondayAgo(1)
  const lastSun = new Date(lastMon); lastSun.setDate(lastMon.getDate() + 6)
  const prevMon = mondayAgo(2)
  const prevSun = new Date(prevMon); prevSun.setDate(prevMon.getDate() + 6)
  const ini = ymd(lastMon), fin = ymd(lastSun), iniP = ymd(prevMon), finP = ymd(prevSun)

  // Datos en paralelo
  const [
    aggSemana, aggPrev, misionesSemana, riesgo, volBaja, crossSell, cohortes, adminsRes,
  ] = await Promise.all([
    supabase.rpc('ventas_agg_periodo', { p_ini: ini, p_fin: fin, p_vendedor: null }),
    supabase.rpc('ventas_agg_periodo', { p_ini: iniP, p_fin: finP, p_vendedor: null }),
    supabase.from('misiones').select('vendedor, estado, resultado_litros').eq('semana', ini),
    supabase.rpc('get_pending_call_alerts', { p_vendedor: null, p_nivel_minimo: 'critico' }),
    supabase.rpc('get_clientes_volumen_baja', { p_vendedor: null, p_umbral: 0.25 }),
    supabase.rpc('get_cross_sell', { p_vendedor: null, p_min_penetracion: 0.4 }),
    supabase.rpc('get_retencion_cohortes'),
    adminDb.from('users').select('email').eq('is_admin', true),
  ])

  type AggRow = { vendedor: string; litros: number; revenue: number; clientes: number; pedidos: number }
  const agg = (aggSemana.data ?? []) as AggRow[]
  const aggP = (aggPrev.data ?? []) as AggRow[]

  const litros = agg.reduce((s, v) => s + Number(v.litros ?? 0), 0)
  const revenue = agg.reduce((s, v) => s + Number(v.revenue ?? 0), 0)
  const litrosPrev = aggP.reduce((s, v) => s + Number(v.litros ?? 0), 0)
  const deltaLitros = litrosPrev > 0 ? Math.round(((litros - litrosPrev) / litrosPrev) * 100) : 0

  const mis = (misionesSemana.data ?? []) as { vendedor: string; estado: string; resultado_litros: number | null }[]
  const misTotal = mis.length
  const misComp = mis.filter(m => esComp(m.estado)).length
  const volRescatado = mis.filter(m => esComp(m.estado)).reduce((s, m) => s + Number(m.resultado_litros ?? 0), 0)
  const misPct = misTotal > 0 ? Math.round((misComp / misTotal) * 100) : 0

  // Por vendedor (ventas + cumplimiento de misiones)
  const vendMap = new Map<string, { litros: number; misTotal: number; misComp: number }>()
  for (const v of agg) vendMap.set(v.vendedor, { litros: Number(v.litros ?? 0), misTotal: 0, misComp: 0 })
  for (const m of mis) {
    if (!vendMap.has(m.vendedor)) vendMap.set(m.vendedor, { litros: 0, misTotal: 0, misComp: 0 })
    const e = vendMap.get(m.vendedor)!; e.misTotal++; if (esComp(m.estado)) e.misComp++
  }

  const riesgoArr = (riesgo.data ?? []) as { nombre_fantasia: string; dias_sin_compra: number; segmento: string }[]
  const volBajaN = (volBaja.data ?? []).length
  const crossN = (crossSell.data ?? []).length
  const cohortesArr = (cohortes.data ?? []) as { clientes: number; repitieron: number }[]
  const cohClientes = cohortesArr.reduce((s, c) => s + Number(c.clientes), 0)
  const cohRepite = cohortesArr.reduce((s, c) => s + Number(c.repitieron), 0)
  const repeatRate = cohClientes > 0 ? Math.round((cohRepite / cohClientes) * 100) : 0

  const card = (label: string, value: string, color: string, sub?: string) => `
    <div style="background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:10px;padding:14px 10px;text-align:center">
      <div style="font-size:20px;font-weight:900;color:${color};line-height:1">${value}</div>
      <div style="font-size:9px;color:#6B6460;letter-spacing:1px;margin-top:4px;text-transform:uppercase">${label}</div>
      ${sub ? `<div style="font-size:9px;color:#8A8076;margin-top:3px">${sub}</div>` : ''}
    </div>`

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="background:#080808;color:#E8DFC8;font-family:system-ui,sans-serif;margin:0;padding:0">
<div style="max-width:580px;margin:40px auto;padding:0 20px">

  <div style="border-bottom:1px solid rgba(212,175,55,0.2);padding-bottom:20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
    <div style="width:36px;height:36px;background:#D4AF37;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#080808">ER</div>
    <div>
      <div style="color:#D4AF37;font-weight:900;font-size:14px;letter-spacing:1px">REPORTE SEMANAL DE VENTAS</div>
      <div style="color:#4A4540;font-size:10px">${fmt(ini)} — ${fmt(fin)}</div>
    </div>
  </div>

  <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:24px">
    ${card('Litros', fL(litros), '#60A5FA', `${deltaLitros >= 0 ? '+' : ''}${deltaLitros}% vs sem. ant.`)}
    ${card('Venta', fPeso(revenue), '#34D399')}
    ${card('Misiones', `${misPct}%`, '#D4AF37', `${misComp}/${misTotal}`)}
    ${card('Rescatado', fL(volRescatado), '#A78BFA')}
  </div>

  <!-- Por vendedor -->
  <div style="background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:20px">
    <div style="font-size:11px;color:#8A8076;font-weight:700;letter-spacing:1.5px;margin-bottom:14px">RENDIMIENTO POR VENDEDOR</div>
    ${[...vendMap.entries()].sort((a, b) => b[1].litros - a[1].litros).map(([vend, d]) => {
      const pct = d.misTotal > 0 ? Math.round((d.misComp / d.misTotal) * 100) : 0
      const color = pct >= 80 ? '#34D399' : pct >= 50 ? '#D4AF37' : '#FF6B6B'
      return `
      <div style="margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
          <span style="font-size:13px;color:#E8DFC8;font-weight:600">${vend.split(' ')[0]}</span>
          <span style="font-size:12px;color:#8A8076">${fL(d.litros)} · misiones <span style="color:${color};font-weight:700">${pct}%</span></span>
        </div>
        <div style="height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">
          <div style="height:100%;width:${pct}%;background:${color};border-radius:3px"></div>
        </div>
      </div>`
    }).join('') || '<div style="font-size:12px;color:#4A4540">Sin datos esta semana</div>'}
  </div>

  <!-- Focos de la semana -->
  <div style="background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:16px;margin-bottom:20px">
    <div style="font-size:11px;color:#8A8076;font-weight:700;letter-spacing:1.5px;margin-bottom:14px">FOCOS PARA ESTA SEMANA</div>
    <div style="display:flex;flex-direction:column;gap:9px">
      <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#FF6B6B">🔴 Clientes en riesgo crítico</span><span style="color:#F0EAD6;font-weight:700">${riesgoArr.length}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#F87171">📉 Volumen a la baja</span><span style="color:#F0EAD6;font-weight:700">${volBajaN}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#A78BFA">🔀 Oportunidades cross-sell</span><span style="color:#F0EAD6;font-weight:700">${crossN}</span></div>
      <div style="display:flex;justify-content:space-between;font-size:13px"><span style="color:#34D399">📈 Tasa de recompra (cartera)</span><span style="color:#F0EAD6;font-weight:700">${repeatRate}%</span></div>
    </div>
  </div>

  ${riesgoArr.length > 0 ? `
  <div style="background:rgba(255,68,68,0.05);border:1px solid rgba(255,68,68,0.15);border-radius:12px;padding:16px;margin-bottom:24px">
    <div style="font-size:11px;color:#FF6B6B;font-weight:700;letter-spacing:1.5px;margin-bottom:12px">⚠ TOP CLIENTES EN RIESGO</div>
    ${riesgoArr.slice(0, 5).map(r => `
      <div style="padding:7px 0;border-bottom:1px solid rgba(255,255,255,0.05);display:flex;justify-content:space-between">
        <span style="font-size:13px;color:#F0EAD6;font-weight:600">${r.nombre_fantasia}</span>
        <span style="font-size:11px;color:#FF6B6B">${r.dias_sin_compra}d · Seg ${r.segmento}</span>
      </div>`).join('')}
  </div>` : ''}

  <a href="${APP_URL}/ventas/misiones" style="display:block;width:100%;padding:14px;text-align:center;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;color:#D4AF37;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:24px;box-sizing:border-box">
    → Abrir Misiones de la semana
  </a>

  <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px">
    <p style="font-size:10px;color:#3A3530">Reporte automático · cada lunes 9:00 · Cervecería El Regreso</p>
  </div>
</div></body></html>`

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })

  const resend = new Resend(resendKey)
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'
  const adminEmails = ((adminsRes.data ?? []) as { email: string | null }[]).map(a => a.email).filter((e): e is string => !!e)

  if (adminEmails.length === 0) {
    const hint = process.env.SUPABASE_SERVICE_KEY
      ? 'No hay usuarios con is_admin=true y email en la tabla users.'
      : 'Falta SUPABASE_SERVICE_KEY en Vercel: el anónimo no puede leer users (RLS).'
    return NextResponse.json({ ok: true, sent_to: [], reason: 'sin admins', hint })
  }

  const { data: sendData, error: sendError } = await resend.emails.send({
    from: `El Regreso Ventas <${from}>`,
    to: adminEmails,
    subject: `📊 Reporte de Ventas ${fmt(ini)} — ${fmt(fin)}`,
    html,
  })

  if (sendError) console.error('[reporte-ventas] Resend error:', sendError)
  else console.log('[reporte-ventas] enviado, id:', sendData?.id)

  return NextResponse.json({
    ok: !sendError,
    manual,
    from,
    sent_to: adminEmails,
    resend_id: sendData?.id ?? null,
    resend_error: sendError ? { name: sendError.name, message: sendError.message } : null,
    semana: ini, litros, misPct, riesgo: riesgoArr.length,
  })
}
