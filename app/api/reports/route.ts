import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { Resend } from 'resend'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

function buildReportEmailHtml(area: string | null, dateStr: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="background:#080808;color:#E8DFC8;font-family:system-ui,sans-serif;margin:0;padding:0">
  <div style="max-width:520px;margin:40px auto;padding:0 20px">

    <div style="border-bottom:1px solid rgba(212,175,55,0.2);padding-bottom:20px;margin-bottom:28px;display:flex;align-items:center;gap:12px">
      <div style="width:36px;height:36px;background:#D4AF37;border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;color:#080808">RC</div>
      <div>
        <div style="color:#D4AF37;font-weight:900;font-size:14px;letter-spacing:1px">EL REGRESO CONTROL</div>
        <div style="color:#4A4540;font-size:10px;letter-spacing:1.5px">SISTEMA OPERATIVO EJECUTIVO</div>
      </div>
    </div>

    <div style="background:rgba(212,175,55,0.08);border:1px solid rgba(212,175,55,0.25);border-radius:10px;padding:14px 18px;margin-bottom:24px">
      <div style="font-size:11px;color:#D4AF37;font-weight:700;letter-spacing:1.5px;margin-bottom:4px">
        📊 ${area ? `REPORTE DE ÁREA: ${area.toUpperCase()}` : 'REPORTE GENERAL DE GESTIÓN'}
      </div>
      <div style="font-size:12px;color:#8A8076">Generado el ${dateStr}</div>
    </div>

    <div style="background:#141414;border:1px solid rgba(255,255,255,0.07);border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="font-size:15px;font-weight:800;color:#F0EAD6;margin-bottom:10px">
        ${area ? `Informe de Desempeño — ${area}` : 'Informe Consolidado de Todas las Áreas'}
      </div>
      <div style="font-size:13px;color:#8A8076;line-height:1.7">
        Se adjunta el reporte de gestión en formato PDF con los indicadores clave de desempeño,
        análisis de cumplimiento y recomendaciones operativas correspondientes al período actual.
      </div>
    </div>

    <div style="background:#0A0A0A;border:1px solid rgba(255,255,255,0.05);border-radius:10px;padding:14px 18px;margin-bottom:20px">
      <div style="font-size:10px;color:#6B6460;margin-bottom:8px;letter-spacing:1px;text-transform:uppercase">El reporte incluye</div>
      ${[
        'Resumen ejecutivo con KPIs principales',
        area ? 'Listado de tareas críticas y próximas a vencer' : 'Ranking comparativo de todas las áreas',
        'Análisis automatizado de gestión con recomendaciones',
      ].map(item => `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="width:5px;height:5px;border-radius:50%;background:#D4AF37;flex-shrink:0"></div>
          <span style="font-size:12px;color:#C8C0B0">${item}</span>
        </div>
      `).join('')}
    </div>

    <div style="border-top:1px solid rgba(255,255,255,0.05);padding-top:16px">
      <p style="font-size:10px;color:#3A3530;margin:0">Cervecería El Regreso · Sistema Operativo Ejecutivo</p>
    </div>
  </div>
</body>
</html>`
}

export async function POST(req: NextRequest) {
  const supabase = await getSupabase()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { data: profile } = await supabase
    .from('users')
    .select('is_admin')
    .eq('email', user.email!)
    .single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const body = await req.json() as {
    pdfBase64: string
    area?: string | null
    recipientEmail?: string
  }

  const { pdfBase64, area, recipientEmail } = body
  if (!pdfBase64) return NextResponse.json({ error: 'PDF no proporcionado' }, { status: 400 })

  const resendKey = process.env.RESEND_API_KEY
  if (!resendKey) return NextResponse.json({ error: 'Email no configurado' }, { status: 500 })

  const toEmail = recipientEmail?.trim() ||
    process.env.ADMIN_REVIEW_EMAIL ||
    user.email!

  const dateStr = new Date().toLocaleDateString('es-CL', {
    day: '2-digit', month: 'long', year: 'numeric',
  })

  const filename = area
    ? `reporte-${area.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`
    : `reporte-general-${new Date().toISOString().slice(0, 10)}.pdf`

  try {
    const resend = new Resend(resendKey)
    const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev'

    console.log(`[reports] Enviando PDF a: ${toEmail} desde: ${fromEmail}`)

    // Resend v6 devuelve { data, error } — no lanza excepciones en errores de API
    const { data, error } = await resend.emails.send({
      from: `El Regreso Control <${fromEmail}>`,
      to: [toEmail],
      subject: area
        ? `📊 Reporte de Área: ${area} — ${dateStr}`
        : `📊 Reporte General de Gestión — ${dateStr}`,
      html: buildReportEmailHtml(area ?? null, dateStr),
      attachments: [
        {
          filename,
          // Resend v6 acepta base64 string directamente
          content: pdfBase64,
        },
      ],
    })

    if (error) {
      console.error('[reports] Resend error:', JSON.stringify(error))
      return NextResponse.json(
        { error: `Error Resend: ${(error as { message?: string }).message ?? JSON.stringify(error)}` },
        { status: 500 },
      )
    }

    console.log(`[reports] Email enviado. ID: ${data?.id}`)
    return NextResponse.json({ ok: true, sentTo: toEmail, emailId: data?.id })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('[reports] Error inesperado:', msg)
    return NextResponse.json({ error: `Error inesperado: ${msg}` }, { status: 500 })
  }
}
