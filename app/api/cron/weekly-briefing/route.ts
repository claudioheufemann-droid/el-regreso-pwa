import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

// Vercel Cron: cada lunes a las 08:00 UTC (05:00 Chile)
// Llega antes que empiece el día — pauta de contactos de la semana
export const runtime = 'nodejs'

const VENDEDORES_EMAIL: Record<string, string> = {
  'Javier Badilla':  'javier@elregresobeer.com',
  'Carlos Urrejola': 'carlos@elregresobeer.com',
}
const ADMIN_EMAIL = 'benja.alarcon@elregresobeer.com'

interface ClientePlan {
  nombre_fantasia: string
  vendedor_actual: string
  score: number
  segmento: string
  alert_level: string
  dias_sin_compra: number
  ciclo_promedio_dias: number
  siguiente_compra_estimada: string | null
  porcentaje_ciclo_vencido: number
}

const SEG_COLORS: Record<string, string> = {
  A: '#D4AF37', B: '#34D399', C: '#60A5FA', D: '#F59E0B', E: '#F87171',
}

function clienteRow(c: ClientePlan): string {
  const alertColor = c.alert_level === 'critico' ? '#EF4444' : c.alert_level === 'vencido' ? '#F87171' : '#F59E0B'
  const segColor = SEG_COLORS[c.segmento] ?? '#888'
  return `
  <div style="padding:10px 14px;border-left:3px solid ${alertColor};background:rgba(255,255,255,0.02);border-radius:0 8px 8px 0;margin-bottom:6px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:600;color:#F0EAD6;margin-bottom:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.nombre_fantasia}</div>
        <div style="font-size:10px;color:#5A5450">${c.ciclo_promedio_dias}d ciclo · próximo: ${c.siguiente_compra_estimada ?? '—'}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:12px;font-weight:800;color:${alertColor}">${c.dias_sin_compra}d</div>
        <div style="font-size:9px;padding:1px 6px;border-radius:8px;background:${segColor}25;color:${segColor};font-weight:700;margin-top:2px">${c.segmento} · ${c.score}pts</div>
      </div>
    </div>
  </div>`
}

function section(emoji: string, title: string, subtitle: string, borderColor: string, items: ClientePlan[], maxItems = 8): string {
  if (items.length === 0) return ''
  const shown = items.slice(0, maxItems)
  const rest = items.length - maxItems
  return `
  <div style="margin-bottom:24px">
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">
      <span style="font-size:18px">${emoji}</span>
      <div>
        <div style="font-size:12px;color:${borderColor};font-weight:800;letter-spacing:1.2px;text-transform:uppercase">${title} — ${items.length} clientes</div>
        <div style="font-size:10px;color:#5A5450">${subtitle}</div>
      </div>
    </div>
    ${shown.map(clienteRow).join('')}
    ${rest > 0 ? `<div style="text-align:center;font-size:11px;color:#4A4540;padding:8px 0;font-style:italic">+${rest} más en la app</div>` : ''}
  </div>`
}

function buildHtml(vendedor: string, clientes: ClientePlan[]): string {
  const today = new Date()
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const dateStr = `lunes ${today.getDate()} de ${monthNames[today.getMonth()]} ${today.getFullYear()}`

  const criticos = clientes.filter(c => c.alert_level === 'critico')
  const vencidos  = clientes.filter(c => c.alert_level === 'vencido')
  const proximos  = clientes.filter(c => c.alert_level === 'proximo')

  const summaryBoxes = [
    { label: '🔴 Urgentes',  count: criticos.length, color: '#EF4444', bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)' },
    { label: '⚠ Vencidos',  count: vencidos.length,  color: '#F87171', bg: 'rgba(248,113,113,0.06)', border: 'rgba(248,113,113,0.15)' },
    { label: '⏰ Próximos',  count: proximos.length,  color: '#F59E0B', bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.15)' },
  ].map(s => `
    <div style="background:${s.bg};border:1px solid ${s.border};border-radius:10px;padding:12px;text-align:center">
      <div style="font-size:9px;color:${s.color};font-weight:700;letter-spacing:1px;margin-bottom:4px;text-transform:uppercase">${s.label}</div>
      <div style="font-size:26px;font-weight:900;color:${s.color};line-height:1">${s.count}</div>
    </div>`).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#080808;color:#E8DFC8;font-family:system-ui,sans-serif;margin:0;padding:0">
<div style="max-width:540px;margin:40px auto;padding:0 20px">

  <div style="border-bottom:1px solid rgba(212,175,55,0.2);padding-bottom:20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
    <div style="width:36px;height:36px;background:#D4AF37;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#080808">ER</div>
    <div>
      <div style="color:#D4AF37;font-weight:900;font-size:14px;letter-spacing:1px">PLAN DE VENTAS — SEMANA</div>
      <div style="color:#4A4540;font-size:10px;text-transform:capitalize">${dateStr}</div>
    </div>
  </div>

  <p style="font-size:15px;font-weight:700;color:#F0EAD6;margin-bottom:6px">Hola, ${vendedor === 'Admin' ? 'equipo' : vendedor.split(' ')[0]} 👋</p>
  <p style="font-size:13px;color:#5A5450;margin-bottom:22px">
    Esta semana tienes <strong style="color:#E8DFC8">${clientes.length} cliente${clientes.length !== 1 ? 's' : ''}</strong> que deberías contactar, ordenados por score y urgencia. Prioriza los A primero.
  </p>

  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-bottom:28px">
    ${summaryBoxes}
  </div>

  ${section('🔴', 'Urgentes', 'Superaron 1.5× su ciclo — contactar hoy', '#EF4444', criticos)}
  ${section('⚠', 'Vencidos', 'Superaron su ciclo de compra habitual', '#F87171', vencidos)}
  ${section('⏰', 'Próximos', 'En radar — más del 80% del ciclo transcurrido', '#F59E0B', proximos)}

  <a href="https://el-regreso-pwa-psi.vercel.app/ventas/clientes" style="display:block;padding:14px;text-align:center;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;color:#D4AF37;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:24px">
    → Ver cartera completa
  </a>

  <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px">
    <p style="font-size:10px;color:#3A3530">Plan automático de contactos · El Regreso Beer Co. · Solo lunes</p>
  </div>
</div>
</body>
</html>`
}

export async function GET(req: Request) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })

  // Todos los que necesitan contacto esta semana (critico + vencido + proximo)
  const { data: alertsRaw, error } = await supabase
    .rpc('get_pending_call_alerts', {
      p_vendedor: null,
      p_nivel_minimo: 'proximo',
    })

  if (error) {
    console.error('Error en get_pending_call_alerts:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!alertsRaw || alertsRaw.length === 0) {
    return NextResponse.json({ ok: true, message: 'Sin clientes para el plan de esta semana' })
  }

  const planData = alertsRaw as ClientePlan[]

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  const resend = new Resend(resendKey)
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  const results: { destinatario: string; clientes: number; sent: boolean }[] = []

  for (const [vendedor, email] of Object.entries(VENDEDORES_EMAIL)) {
    const misClientes = planData.filter(c => c.vendedor_actual === vendedor)
    if (misClientes.length === 0) {
      results.push({ destinatario: vendedor, clientes: 0, sent: false })
      continue
    }
    const criticos = misClientes.filter(c => c.alert_level === 'critico').length
    try {
      await resend.emails.send({
        from: `El Regreso Beer Co. <${from}>`,
        to: [email],
        subject: `📋 Plan semana — ${misClientes.length} clientes${criticos > 0 ? ` · 🔴 ${criticos} urgente${criticos > 1 ? 's' : ''}` : ''}`,
        html: buildHtml(vendedor, misClientes),
      })
      results.push({ destinatario: vendedor, clientes: misClientes.length, sent: true })
    } catch (e) {
      console.error(`Error enviando plan semanal a ${email}:`, e)
      results.push({ destinatario: vendedor, clientes: misClientes.length, sent: false })
    }
  }

  // Admin: resumen completo del equipo
  try {
    await resend.emails.send({
      from: `El Regreso Beer Co. <${from}>`,
      to: [ADMIN_EMAIL],
      subject: `📊 Plan equipo — ${planData.length} contactos pendientes esta semana`,
      html: buildHtml('Admin', planData),
    })
    results.push({ destinatario: 'admin', clientes: planData.length, sent: true })
  } catch {}

  return NextResponse.json({ ok: true, results, total: planData.length })
}
