import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { puedeVerControlComercial } from '@/lib/control-comercial/permisos'
import { emailReporteComercial } from '@/lib/email'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  if (!puedeVerControlComercial(user)) return NextResponse.json({ error: 'Sin acceso a Control Comercial' }, { status: 403 })

  const body = await req.json()
  const { reporteId, destinatarios, periodoNombre, resumenTexto, pdfBase64 } = body ?? {}
  if (!Array.isArray(destinatarios) || destinatarios.length === 0 || !pdfBase64) {
    return NextResponse.json({ error: 'Faltan destinatarios o el PDF' }, { status: 400 })
  }

  const result = await emailReporteComercial({ destinatarios, periodoNombre, resumenTexto, pdfBase64 })
  if ('error' in result && result.error) return NextResponse.json({ error: String(result.error) }, { status: 500 })

  if (reporteId) {
    const supabase = await createClient()
    await supabase.from('reportes_control_comercial')
      .update({ enviado_email: true, destinatarios_email: destinatarios })
      .eq('id', reporteId)
  }

  return NextResponse.json({ ok: true })
}
