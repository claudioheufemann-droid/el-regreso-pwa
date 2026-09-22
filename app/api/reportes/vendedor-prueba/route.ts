import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { reporteVendedorPruebaHtml } from '@/lib/email'
import { enviarEmailGmail } from '@/lib/email-gmail'

/**
 * GET /api/reportes/vendedor-prueba
 *
 * Primer paso de "enviarle reportes a los vendedores por correo" (22-sep-2026):
 * un envío de prueba, sólo a quien lo pide, para validar la entrega y que la
 * plantilla se ve bien ANTES de conectar el reporte a datos reales de venta y
 * mandarlo a todo el equipo.
 *
 * Va por Gmail/Workspace (lib/email-gmail.ts), no por Resend: mientras
 * `elregresobeer.com` no tenga un dominio verificado en Resend, esa vía sólo
 * entrega al correo de la cuenta de Resend, nunca a un vendedor real. Gmail,
 * autenticado con una casilla real de Workspace, no tiene esa restricción.
 *
 * Sólo admin, y sólo a su PROPIO correo — no hay parámetro para mandarlo a
 * otro destinatario. Es una prueba de humo, no una forma de mandar correo a
 * cualquiera desde la URL.
 */
export async function GET() {
  const user = await getServerUser()
  if (!user || !user.isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!user.email) return NextResponse.json({ error: 'Tu usuario no tiene email cargado' }, { status: 400 })

  const result = await enviarEmailGmail({
    toEmail: user.email,
    subject: '🧪 Prueba — Reporte semanal de vendedor',
    html: reporteVendedorPruebaHtml({ vendedorNombre: user.nombre }),
  })
  if (result.error) return NextResponse.json({ error: result.error }, { status: 500 })

  return NextResponse.json({ ok: true, enviadoA: user.email, id: result.id })
}
