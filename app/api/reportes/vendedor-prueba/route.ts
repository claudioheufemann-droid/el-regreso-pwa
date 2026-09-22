import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { emailReporteVendedorPrueba } from '@/lib/email'

/**
 * GET /api/reportes/vendedor-prueba
 *
 * Primer paso de "enviarle reportes a los vendedores por correo" (22-sep-2026):
 * un envío de prueba, sólo a quien lo pide, para validar que Resend entrega y
 * que la plantilla se ve bien ANTES de conectar el reporte a datos reales de
 * venta y mandarlo a todo el equipo.
 *
 * Sólo admin, y sólo a su PROPIO correo — no hay parámetro para mandarlo a
 * otro destinatario. Es una prueba de humo, no una forma de mandar correo a
 * cualquiera desde la URL.
 */
export async function GET() {
  const user = await getServerUser()
  if (!user || !user.isAdmin) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!user.email) return NextResponse.json({ error: 'Tu usuario no tiene email cargado' }, { status: 400 })

  const result = await emailReporteVendedorPrueba({ toEmail: user.email, vendedorNombre: user.nombre })
  if (result.error) {
    // Mientras no haya un dominio verificado en Resend, la cuenta está en modo
    // sandbox: sólo entrega al correo con el que se registró la cuenta de
    // Resend, no a cualquier destinatario válido. El mensaje de la API ya lo
    // explica, pero se agrega el contexto de qué hacer — sin esto, un admin
    // que no sea quien configuró Resend ve un 403 sin pista de por qué.
    const esSandbox = /own email address|domain is not verified/i.test(result.error.message ?? '')
    return NextResponse.json({
      error: result.error.message ?? 'Resend rechazó el envío',
      ...(esSandbox ? { pista: 'Cuenta de Resend en modo sandbox: sólo entrega al correo con el que se creó la cuenta. Verificar un dominio en resend.com/domains para poder mandarle a cualquier vendedor.' } : {}),
    }, { status: 500 })
  }

  return NextResponse.json({ ok: true, enviadoA: user.email, id: result.data?.id })
}
