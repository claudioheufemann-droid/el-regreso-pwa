import { NextResponse } from 'next/server'
import { Resend } from 'resend'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

export const runtime = 'nodejs'

// Vercel Cron: lunes a viernes a las 08:30 UTC (05:30 Chile)
// Así llega al celular antes de que empiece el día de trabajo

const VENDEDORES_EMAIL: Record<string, string> = {
  'Javier Badilla':  'javier@elregresobeer.com',
  'Carlos Urrejola': 'carlos@elregresobeer.com',
}

const ADMIN_EMAIL = 'benja.alarcon@elregresobeer.com'

interface ClienteRiesgo {
  nombre_fantasia: string
  vendedor_actual: string
  dias_sin_compra: number
  ciclo_promedio_dias: number
  alert_level: string
  siguiente_compra_estimada: string | null
}

function alertLabel(level: string) {
  if (level === 'critico') return '🔴 CRÍTICO'
  if (level === 'vencido') return '⚠️ Vencido'
  return level
}

function buildEmailHtml(vendedor: string, clientes: ClienteRiesgo[]): string {
  const criticos = clientes.filter(c => c.alert_level === 'critico')
  const vencidos  = clientes.filter(c => c.alert_level === 'vencido')
  const total = clientes.length

  const today = new Date()
  const dayNames = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado']
  const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
  const dayStr = `${dayNames[today.getDay()]} ${today.getDate()} de ${monthNames[today.getMonth()]}`

  const clienteRow = (c: ClienteRiesgo) => `
    <div style="padding:10px 14px;border-left:3px solid ${c.alert_level === 'critico' ? '#EF4444' : '#F87171'};background:rgba(255,255,255,0.02);border-radius:0 8px 8px 0;margin-bottom:8px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
        <div>
          <div style="font-size:13px;font-weight:600;color:#F0EAD6;margin-bottom:2px">${c.nombre_fantasia}</div>
          <div style="font-size:10px;color:#5A5450">${c.ciclo_promedio_dias}d de ciclo · estimado próximo: ${c.siguiente_compra_estimada ?? '—'}</div>
        </div>
        <span style="font-size:9px;padding:2px 8px;border-radius:10px;background:${c.alert_level === 'critico' ? '#EF444420' : '#F8717120'};color:${c.alert_level === 'critico' ? '#EF4444' : '#F87171'};white-space:nowrap;flex-shrink:0">
          ${alertLabel(c.alert_level)} · ${c.dias_sin_compra}d
        </span>
      </div>
    </div>`

  const section = (title: string, color: string, items: ClienteRiesgo[]) =>
    items.length === 0 ? '' : `
    <div style="margin-bottom:22px">
      <div style="font-size:10px;color:${color};font-weight:700;letter-spacing:1.5px;margin-bottom:10px;text-transform:uppercase">${title} (${items.length})</div>
      ${items.map(clienteRow).join('')}
    </div>`

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#080808;color:#E8DFC8;font-family:system-ui,sans-serif;margin:0;padding:0">
<div style="max-width:540px;margin:40px auto;padding:0 20px">

  <!-- Header -->
  <div style="border-bottom:1px solid rgba(212,175,55,0.2);padding-bottom:20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
    <div style="width:36px;height:36px;background:#D4AF37;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#080808">ER</div>
    <div>
      <div style="color:#D4AF37;font-weight:900;font-size:14px;letter-spacing:1px">CLIENTES A CONTACTAR</div>
      <div style="color:#4A4540;font-size:10px;text-transform:capitalize">${dayStr}</div>
    </div>
  </div>

  <!-- Saludo -->
  <p style="font-size:15px;font-weight:700;color:#F0EAD6;margin-bottom:6px">Hola, ${vendedor.split(' ')[0]} 👋</p>
  <p style="font-size:13px;color:#5A5450;margin-bottom:24px">
    Tienes <strong style="color:#E8DFC8">${total} cliente${total !== 1 ? 's' : ''}</strong> que superaron su ciclo de compra habitual. Contactarlos hoy puede recuperar ventas perdidas.
  </p>

  ${section('🔴 Críticos — más de 1.5× su ciclo', '#EF4444', criticos)}
  ${section('⚠ Vencidos — superaron su ciclo', '#F87171', vencidos)}

  <!-- CTA -->
  <a href="https://el-regreso-pwa-psi.vercel.app/ventas/clientes" style="display:block;padding:14px;text-align:center;background:rgba(212,175,55,0.1);border:1px solid rgba(212,175,55,0.3);border-radius:10px;color:#D4AF37;font-weight:700;font-size:13px;text-decoration:none;margin-bottom:24px">
    → Ver cartera de clientes
  </a>

  <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px">
    <p style="font-size:10px;color:#3A3530">Alerta automática de frecuencia de compra · El Regreso Beer Co.</p>
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

  // Obtener clientes en riesgo desde get_pending_call_alerts (RFM model)
  const { data: alertsRaw, error } = await supabase
    .rpc('get_pending_call_alerts', {
      p_vendedor: null,
      p_nivel_minimo: 'vencido',
    })

  if (error) {
    console.error('Error en get_pending_call_alerts:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!alertsRaw || alertsRaw.length === 0) {
    return NextResponse.json({ ok: true, message: 'Sin clientes en riesgo hoy' })
  }

  const riesgoData: ClienteRiesgo[] = (alertsRaw as {
    nombre_fantasia: string
    vendedor_actual: string
    dias_sin_compra: number
    ciclo_promedio_dias: number
    alert_level: string
    siguiente_compra_estimada: string | null
  }[]).map(r => ({
    nombre_fantasia: r.nombre_fantasia,
    vendedor_actual: r.vendedor_actual,
    dias_sin_compra: r.dias_sin_compra,
    ciclo_promedio_dias: r.ciclo_promedio_dias,
    alert_level: r.alert_level,
    siguiente_compra_estimada: r.siguiente_compra_estimada,
  }))

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'RESEND_API_KEY not set' }, { status: 500 })
  const resend = new Resend(resendKey)
  const from = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

  const results: { destinatario: string; clientes: number; sent: boolean }[] = []

  // Enviar email por vendedor
  for (const [vendedor, email] of Object.entries(VENDEDORES_EMAIL)) {
    const misClientes = (riesgoData as ClienteRiesgo[]).filter(c => c.vendedor_actual === vendedor)
    if (misClientes.length === 0) {
      results.push({ destinatario: vendedor, clientes: 0, sent: false })
      continue
    }

    const criticos = misClientes.filter(c => c.alert_level === 'critico').length
    const html = buildEmailHtml(vendedor, misClientes)

    try {
      await resend.emails.send({
        from: `El Regreso Beer Co. <${from}>`,
        to: [email],
        subject: `📋 ${misClientes.length} clientes a contactar hoy${criticos > 0 ? ` — 🔴 ${criticos} crítico${criticos > 1 ? 's' : ''}` : ''}`,
        html,
      })
      results.push({ destinatario: vendedor, clientes: misClientes.length, sent: true })
    } catch (e) {
      console.error(`Error enviando a ${email}:`, e)
      results.push({ destinatario: vendedor, clientes: misClientes.length, sent: false })
    }
  }

  // Email resumen para admin
  const todosClientes = riesgoData as ClienteRiesgo[]
  const htmlAdmin = buildEmailHtml('Admin', todosClientes)
  try {
    await resend.emails.send({
      from: `El Regreso Beer Co. <${from}>`,
      to: [ADMIN_EMAIL],
      subject: `📊 Resumen equipo: ${todosClientes.length} clientes en riesgo de compra`,
      html: htmlAdmin,
    })
    results.push({ destinatario: 'admin', clientes: todosClientes.length, sent: true })
  } catch {}

  return NextResponse.json({ ok: true, results })
}
