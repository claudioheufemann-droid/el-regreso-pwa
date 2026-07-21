/**
 * lib/email.ts — Sistema centralizado de emails para El Regreso Control
 * Usa Resend. Se invoca desde rutas de API (server-side only).
 */

import { Resend } from 'resend'

const FROM = process.env.RESEND_FROM_EMAIL ?? 'notificaciones@elregresobeer.com'
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://control.elregresobeer.com'

function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY
  if (!key) return null
  return new Resend(key)
}

// ── Colores corporativos ───────────────────────────────────────────────
const COLOR = {
  gold:    '#D4AF37',
  dark:    '#141414',
  darker:  '#0A0A0A',
  text:    '#E8DFC8',
  muted:   '#7A7268',
  green:   '#4A7A3A',
  red:     '#A8341F',
  blue:    '#5B8AA8',
  orange:  '#E67E22',
}

// ── Base HTML template ─────────────────────────────────────────────────
function baseTemplate(content: string, accentColor = COLOR.gold): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>El Regreso Control</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.darker};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.darker};">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;">

          <!-- Header -->
          <tr>
            <td style="background:${COLOR.dark};border-top:3px solid ${accentColor};border-radius:16px 16px 0 0;padding:24px 32px 20px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span style="font-size:22px;font-weight:900;color:${accentColor};letter-spacing:2px;">EL REGRESO</span>
                <span style="font-size:11px;color:${COLOR.muted};letter-spacing:2px;text-transform:uppercase;border-left:1px solid rgba(255,255,255,0.1);padding-left:12px;margin-left:4px;">Control</span>
              </div>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="background:${COLOR.dark};border-radius:0 0 16px 16px;padding:0 32px 32px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 0;text-align:center;">
              <p style="margin:0;font-size:11px;color:${COLOR.muted};letter-spacing:0.5px;">
                Cervecería El Regreso Beer Co. · Valdivia, Chile
              </p>
              <p style="margin:6px 0 0;font-size:10px;color:#4A4540;">
                <a href="${APP_URL}" style="color:#6A6050;text-decoration:none;">Abrir aplicación</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ── Templates de notificación ─────────────────────────────────────────
function taskAsignadaHtml(params: {
  destinatarioNombre: string
  taskTitulo: string
  taskArea: string
  taskPlazo: string
  taskDescripcion?: string
  asignadoPor?: string
}): string {
  const plazoDate = new Date(params.taskPlazo)
  const fechaStr = plazoDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })

  const content = `
    <div style="border-bottom:1px solid rgba(255,255,255,0.06);padding:24px 0 20px;">
      <p style="margin:0 0 6px;font-size:11px;color:${COLOR.blue};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">${params.taskArea}</p>
      <h1 style="margin:0;font-size:22px;font-weight:900;color:${COLOR.text};line-height:1.2;">${params.taskTitulo}</h1>
    </div>
    <div style="padding:20px 0;">
      <p style="margin:0 0 16px;font-size:14px;color:${COLOR.muted};">
        Hola <strong style="color:${COLOR.text};">${params.destinatarioNombre}</strong>, te han asignado una nueva tarea.
      </p>
      ${params.taskDescripcion ? `
      <div style="background:#1A1A1A;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
        <p style="margin:0;font-size:13px;color:${COLOR.text};line-height:1.6;">${params.taskDescripcion}</p>
      </div>` : ''}
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
        <tr>
          <td style="padding:4px 0;">
            <span style="font-size:10px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:1px;">Plazo</span><br>
            <strong style="font-size:16px;color:${COLOR.orange};">${fechaStr}</strong>
          </td>
          ${params.asignadoPor ? `
          <td style="padding:4px 0;padding-left:24px;">
            <span style="font-size:10px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:1px;">Asignada por</span><br>
            <strong style="font-size:14px;color:${COLOR.text};">${params.asignadoPor}</strong>
          </td>` : ''}
        </tr>
      </table>
      <a href="${APP_URL}" style="display:inline-block;padding:13px 24px;background:${COLOR.blue};color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:13px;letter-spacing:0.5px;">
        Ver tarea en la app →
      </a>
    </div>`

  return baseTemplate(content, COLOR.blue)
}

function taskAprobadaHtml(params: {
  destinatarioNombre: string
  taskTitulo: string
  taskArea: string
  aprobadoPor?: string
}): string {
  const content = `
    <div style="border-bottom:1px solid rgba(255,255,255,0.06);padding:24px 0 20px;">
      <p style="margin:0 0 6px;font-size:11px;color:${COLOR.green};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">✅ Tarea Aprobada</p>
      <h1 style="margin:0;font-size:22px;font-weight:900;color:${COLOR.text};line-height:1.2;">${params.taskTitulo}</h1>
    </div>
    <div style="padding:20px 0;">
      <p style="margin:0 0 16px;font-size:14px;color:${COLOR.muted};">
        Hola <strong style="color:${COLOR.text};">${params.destinatarioNombre}</strong>, tu tarea ha sido <strong style="color:#4ADE80;">aprobada y completada</strong> exitosamente.
      </p>
      <div style="background:rgba(74,122,58,0.08);border:1px solid rgba(74,122,58,0.25);border-radius:10px;padding:14px 16px;margin-bottom:24px;">
        <p style="margin:0;font-size:12px;color:#4ADE80;font-weight:600;">Área: ${params.taskArea}${params.aprobadoPor ? ` · Aprobado por: ${params.aprobadoPor}` : ''}</p>
      </div>
      <a href="${APP_URL}" style="display:inline-block;padding:13px 24px;background:${COLOR.green};color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:13px;">
        Ver en la app →
      </a>
    </div>`
  return baseTemplate(content, COLOR.green)
}

function taskRechazadaHtml(params: {
  destinatarioNombre: string
  taskTitulo: string
  taskArea: string
  motivo?: string
}): string {
  const content = `
    <div style="border-bottom:1px solid rgba(255,255,255,0.06);padding:24px 0 20px;">
      <p style="margin:0 0 6px;font-size:11px;color:${COLOR.red};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">❌ Tarea Rechazada</p>
      <h1 style="margin:0;font-size:22px;font-weight:900;color:${COLOR.text};line-height:1.2;">${params.taskTitulo}</h1>
    </div>
    <div style="padding:20px 0;">
      <p style="margin:0 0 16px;font-size:14px;color:${COLOR.muted};">
        Hola <strong style="color:${COLOR.text};">${params.destinatarioNombre}</strong>, tu tarea ha sido <strong style="color:#FF6666;">rechazada</strong> y necesita correcciones.
      </p>
      ${params.motivo ? `
      <div style="background:rgba(168,52,31,0.08);border:1px solid rgba(168,52,31,0.25);border-radius:10px;padding:14px 16px;margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:10px;color:${COLOR.red};text-transform:uppercase;letter-spacing:1px;font-weight:700;">Motivo del rechazo</p>
        <p style="margin:0;font-size:13px;color:${COLOR.text};line-height:1.6;">${params.motivo}</p>
      </div>` : ''}
      <a href="${APP_URL}" style="display:inline-block;padding:13px 24px;background:${COLOR.red};color:#fff;text-decoration:none;border-radius:10px;font-weight:800;font-size:13px;">
        Ver tarea y corregir →
      </a>
    </div>`
  return baseTemplate(content, COLOR.red)
}

function comentarioNuevoHtml(params: {
  destinatarioNombre: string
  taskTitulo: string
  taskArea: string
  autorNombre: string
  comentario: string
}): string {
  const content = `
    <div style="border-bottom:1px solid rgba(255,255,255,0.06);padding:24px 0 20px;">
      <p style="margin:0 0 6px;font-size:11px;color:${COLOR.gold};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">💬 Nuevo Comentario</p>
      <h1 style="margin:0;font-size:20px;font-weight:900;color:${COLOR.text};line-height:1.2;">${params.taskTitulo}</h1>
      <p style="margin:4px 0 0;font-size:11px;color:${COLOR.muted};">Área: ${params.taskArea}</p>
    </div>
    <div style="padding:20px 0;">
      <p style="margin:0 0 14px;font-size:14px;color:${COLOR.muted};">
        <strong style="color:${COLOR.text};">${params.autorNombre}</strong> escribió un comentario en tu tarea:
      </p>
      <div style="background:#1E1E1E;border-left:3px solid ${COLOR.gold};border-radius:0 10px 10px 0;padding:14px 16px;margin-bottom:24px;">
        <p style="margin:0;font-size:14px;color:${COLOR.text};line-height:1.6;">"${params.comentario}"</p>
      </div>
      <a href="${APP_URL}" style="display:inline-block;padding:13px 24px;background:${COLOR.gold};color:#0A0A0A;text-decoration:none;border-radius:10px;font-weight:800;font-size:13px;">
        Responder en la app →
      </a>
    </div>`
  return baseTemplate(content, COLOR.gold)
}

function taskPorAprobarHtml(params: {
  taskTitulo: string
  taskArea: string
  responsableNombre: string
  taskPlazo: string
  resumen?: string
  fotoAntesUrl?: string
  fotoDespuesUrl?: string
}): string {
  const plazoDate = new Date(params.taskPlazo)
  const fechaStr = plazoDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' })

  const content = `
    <div style="border-bottom:1px solid rgba(255,255,255,0.06);padding:24px 0 20px;">
      <p style="margin:0 0 6px;font-size:11px;color:${COLOR.gold};letter-spacing:1.5px;text-transform:uppercase;font-weight:700;">⭐ Lista para Aprobar</p>
      <h1 style="margin:0;font-size:22px;font-weight:900;color:${COLOR.text};line-height:1.2;">${params.taskTitulo}</h1>
    </div>
    <div style="padding:20px 0;">
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:18px;">
        <tr>
          <td><span style="font-size:10px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:1px;">Responsable</span><br>
            <strong style="font-size:14px;color:${COLOR.text};">${params.responsableNombre}</strong></td>
          <td style="padding-left:24px;"><span style="font-size:10px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:1px;">Área / Plazo</span><br>
            <strong style="font-size:14px;color:${COLOR.text};">${params.taskArea} · ${fechaStr}</strong></td>
        </tr>
      </table>
      ${params.resumen ? `
      <div style="background:#1A1A1A;border-radius:10px;padding:14px 16px;margin-bottom:16px;">
        <p style="margin:0 0 4px;font-size:10px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:1px;">Resumen de cierre</p>
        <p style="margin:0;font-size:13px;color:${COLOR.text};line-height:1.6;">${params.resumen}</p>
      </div>` : ''}
      ${(params.fotoAntesUrl || params.fotoDespuesUrl) ? `
      <p style="margin:0 0 8px;font-size:10px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:1px;">Evidencia fotográfica</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
        <tr>
          ${params.fotoAntesUrl ? `<td style="padding-right:8px;"><img src="${params.fotoAntesUrl}" alt="Antes" style="width:100%;max-width:240px;border-radius:8px;display:block;"/><p style="margin:4px 0 0;font-size:9px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:1px;">Antes</p></td>` : ''}
          ${params.fotoDespuesUrl ? `<td style="padding-left:8px;"><img src="${params.fotoDespuesUrl}" alt="Después" style="width:100%;max-width:240px;border-radius:8px;display:block;"/><p style="margin:4px 0 0;font-size:9px;color:${COLOR.muted};text-transform:uppercase;letter-spacing:1px;">Después</p></td>` : ''}
        </tr>
      </table>` : ''}
      <a href="${APP_URL}" style="display:inline-block;padding:13px 24px;background:${COLOR.gold};color:#0A0A0A;text-decoration:none;border-radius:10px;font-weight:800;font-size:13px;">
        Revisar y aprobar →
      </a>
    </div>`
  return baseTemplate(content, COLOR.gold)
}

// ── Funciones públicas de envío ─────────────────────────────────────────

// El SDK de Resend devuelve {data,error} en vez de lanzar excepción en fallos
// de la API (dominio no verificado, key inválida, destinatario inválido…),
// así que un .catch() solo no alcanza para detectarlos — hay que revisar
// `error` explícitamente o el fallo queda invisible en los logs.
function logResultado(tag: string, destinatarios: string[], result: Awaited<ReturnType<Resend['emails']['send']>>) {
  if (result.error) console.error(`Email ${tag} falló para ${destinatarios.join(', ')}:`, result.error)
  else console.log(`Email ${tag} enviado a ${destinatarios.join(', ')} (id: ${result.data?.id})`)
}

export async function emailTaskAsignada(params: {
  toEmail: string
  toNombre: string
  taskTitulo: string
  taskArea: string
  taskPlazo: string
  taskDescripcion?: string
  asignadoPor?: string
}) {
  const resend = getResend()
  if (!resend) { console.error('emailTaskAsignada: RESEND_API_KEY no configurada'); return }

  const result = await resend.emails.send({
    from: `El Regreso Control <${FROM}>`,
    to: [params.toEmail],
    subject: `📋 Nueva tarea: ${params.taskTitulo}`,
    html: taskAsignadaHtml({ destinatarioNombre: params.toNombre, taskTitulo: params.taskTitulo, taskArea: params.taskArea, taskPlazo: params.taskPlazo, taskDescripcion: params.taskDescripcion, asignadoPor: params.asignadoPor }),
  }).catch(e => ({ data: null, error: e }) as Awaited<ReturnType<Resend['emails']['send']>>)
  logResultado('asignada', [params.toEmail], result)
}

export async function emailTaskAprobada(params: {
  toEmail: string
  toNombre: string
  taskTitulo: string
  taskArea: string
  aprobadoPor?: string
}) {
  const resend = getResend()
  if (!resend) { console.error('emailTaskAprobada: RESEND_API_KEY no configurada'); return }

  const result = await resend.emails.send({
    from: `El Regreso Control <${FROM}>`,
    to: [params.toEmail],
    subject: `✅ Tarea aprobada: ${params.taskTitulo}`,
    html: taskAprobadaHtml({ destinatarioNombre: params.toNombre, taskTitulo: params.taskTitulo, taskArea: params.taskArea, aprobadoPor: params.aprobadoPor }),
  }).catch(e => ({ data: null, error: e }) as Awaited<ReturnType<Resend['emails']['send']>>)
  logResultado('aprobada', [params.toEmail], result)
}

export async function emailTaskRechazada(params: {
  toEmail: string
  toNombre: string
  taskTitulo: string
  taskArea: string
  motivo?: string
}) {
  const resend = getResend()
  if (!resend) { console.error('emailTaskRechazada: RESEND_API_KEY no configurada'); return }

  const result = await resend.emails.send({
    from: `El Regreso Control <${FROM}>`,
    to: [params.toEmail],
    subject: `❌ Tarea rechazada: ${params.taskTitulo}`,
    html: taskRechazadaHtml({ destinatarioNombre: params.toNombre, taskTitulo: params.taskTitulo, taskArea: params.taskArea, motivo: params.motivo }),
  }).catch(e => ({ data: null, error: e }) as Awaited<ReturnType<Resend['emails']['send']>>)
  logResultado('rechazada', [params.toEmail], result)
}

export async function emailComentarioNuevo(params: {
  toEmail: string
  toNombre: string
  taskTitulo: string
  taskArea: string
  autorNombre: string
  comentario: string
}) {
  const resend = getResend()
  if (!resend) { console.error('emailComentarioNuevo: RESEND_API_KEY no configurada'); return }

  const result = await resend.emails.send({
    from: `El Regreso Control <${FROM}>`,
    to: [params.toEmail],
    subject: `💬 Comentario en: ${params.taskTitulo}`,
    html: comentarioNuevoHtml({ destinatarioNombre: params.toNombre, taskTitulo: params.taskTitulo, taskArea: params.taskArea, autorNombre: params.autorNombre, comentario: params.comentario }),
  }).catch(e => ({ data: null, error: e }) as Awaited<ReturnType<Resend['emails']['send']>>)
  logResultado('comentario', [params.toEmail], result)
}

export async function emailTaskPorAprobar(params: {
  toEmails: string[]
  taskTitulo: string
  taskArea: string
  responsableNombre: string
  taskPlazo: string
  resumen?: string
  fotoAntesUrl?: string
  fotoDespuesUrl?: string
}) {
  const resend = getResend()
  if (!resend) { console.error('emailTaskPorAprobar: RESEND_API_KEY no configurada'); return }
  if (!params.toEmails.length) return

  const result = await resend.emails.send({
    from: `El Regreso Control <${FROM}>`,
    to: params.toEmails,
    subject: `⭐ Por aprobar: ${params.taskTitulo}`,
    html: taskPorAprobarHtml(params),
  }).catch(e => ({ data: null, error: e }) as Awaited<ReturnType<Resend['emails']['send']>>)
  logResultado('por aprobar', params.toEmails, result)
}
