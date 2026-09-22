/**
 * lib/email-gmail.ts — Envío por Gmail/Google Workspace (SMTP).
 *
 * Alternativa a Resend (lib/email.ts) mientras `elregresobeer.com` no tenga
 * un dominio verificado ahí — sin eso, Resend manda desde un dominio
 * compartido de pruebas y sólo entrega al correo de la cuenta, nunca a un
 * vendedor real (ver la nota en lib/email.ts sobre RESEND_FROM_EMAIL).
 *
 * Se autentica como una casilla real de Workspace con login propio
 * (GMAIL_SMTP_USER + una "contraseña de aplicación" — no la contraseña
 * normal de la cuenta, esa no sirve para SMTP con 2FA activado) y el
 * remitente visible es GMAIL_SMTP_FROM, un alias de esa misma cuenta. Gmail
 * permite mandar "como" un alias propio sin que se lea como suplantación.
 *
 * Como llega desde un buzón real de Workspace con historial, no tiene el
 * problema de reputación de un dominio de pruebas compartido — no debería
 * caer en spam. Documentar acá si igual pasa.
 */

import nodemailer from 'nodemailer'

function getTransporter() {
  const user = process.env.GMAIL_SMTP_USER
  const pass = process.env.GMAIL_APP_PASSWORD
  if (!user || !pass) return null
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user, pass },
  })
}

export async function enviarEmailGmail(params: {
  toEmail: string
  subject: string
  html: string
}) {
  const transporter = getTransporter()
  if (!transporter) {
    console.error('enviarEmailGmail: falta GMAIL_SMTP_USER o GMAIL_APP_PASSWORD')
    return { error: 'GMAIL_SMTP_USER o GMAIL_APP_PASSWORD no configurados' }
  }
  const from = process.env.GMAIL_SMTP_FROM ?? process.env.GMAIL_SMTP_USER!

  try {
    const info = await transporter.sendMail({
      from: `El Regreso <${from}>`,
      to: params.toEmail,
      subject: params.subject,
      html: params.html,
    })
    console.log(`Email (Gmail) enviado a ${params.toEmail}: ${info.messageId}`)
    return { id: info.messageId, error: null }
  } catch (e) {
    console.error(`Email (Gmail) falló para ${params.toEmail}:`, e)
    return { error: e instanceof Error ? e.message : 'Error desconocido enviando por Gmail' }
  }
}
