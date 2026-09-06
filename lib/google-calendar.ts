// Import del paquete acotado @googleapis/calendar (no el monolito `googleapis`
// completo) — el monolito trae los tipos de TODAS las APIs de Google en un
// solo namespace y hace que el paso de TypeScript de `next build` se quede
// sin memoria (probado: revienta con "JavaScript heap out of memory").
import { auth, calendar } from '@googleapis/calendar'

/**
 * lib/google-calendar.ts — Sincronización automática del Plan Maestro de
 * Producción con Google Calendar.
 *
 * Usa una CUENTA DE SERVICIO (no OAuth de usuario): no requiere que nadie
 * inicie sesión ni renueve un token — sólo que el calendario destino esté
 * COMPARTIDO con el email de la cuenta de servicio (con permiso "Hacer
 * cambios en los eventos"). Ver GOOGLE_CALENDAR_SETUP.md para los pasos.
 *
 * Si las variables de entorno no están configuradas, todas las funciones son
 * no-ops silenciosos (devuelven null) — la sincronización con Calendar es un
 * complemento, nunca debe romper la creación/edición de un lote en la base.
 */

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID_PRODUCCION ?? null

function credencialesDisponibles() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY &&
    CALENDAR_ID
  )
}

function clienteCalendar() {
  // La private key llega desde Vercel con los saltos de línea escapados
  // (`\n` literal) — hay que des-escaparlos o la firma JWT falla.
  const privateKey = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ?? '').replace(/\\n/g, '\n')
  const jwt = new auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: privateKey,
    scopes: ['https://www.googleapis.com/auth/calendar.events'],
  })
  return calendar({ version: 'v3', auth: jwt })
}

export interface EventoLoteProduccion {
  producto: string
  categoria: 'cerveza' | 'kombucha'
  litrosPlanificados: number
  fechaPlanificada: string // yyyy-mm-dd
  origen: 'sugerido' | 'manual'
  motivo?: string | null
  /** Litros que hay que cubrir según el forecast (para el detalle del evento). */
  necesidadCubrir?: number | null
  /** yyyy-mm-dd hasta cuándo alcanza lo producido, al ritmo de venta actual. */
  cubreHasta?: string | null
}

/** Evento de un día completo (all-day) el día de inicio de la elaboración —
 *  el Plan Maestro no fija hora de cocción, sólo la fecha. */
export async function crearEventoLote(lote: EventoLoteProduccion): Promise<string | null> {
  if (!credencialesDisponibles()) return null
  try {
    const calendar = clienteCalendar()
    const finExclusivo = new Date(`${lote.fechaPlanificada}T00:00:00Z`)
    finExclusivo.setUTCDate(finExclusivo.getUTCDate() + 1)
    const emoji = lote.categoria === 'cerveza' ? '🍺' : '🥤'

    const descripcionLineas = [
      `Origen: ${lote.origen === 'sugerido' ? 'Alarma de quiebre de stock (Plan Maestro)' : 'Alta manual (Plan Maestro)'}`,
      lote.motivo ? `Motivo: ${lote.motivo}` : null,
      lote.necesidadCubrir != null ? `Necesidad a cubrir: ${Math.round(lote.necesidadCubrir)} L` : null,
      lote.cubreHasta ? `Cobertura estimada hasta: ${lote.cubreHasta}` : null,
      '',
      'Creado automáticamente por El Regreso Control — Plan Maestro de Producción.',
    ].filter((l): l is string => l != null)

    const { data } = await calendar.events.insert({
      calendarId: CALENDAR_ID!,
      requestBody: {
        summary: `${emoji} Cocción: ${lote.producto} — ${Math.round(lote.litrosPlanificados)} L`,
        description: descripcionLineas.join('\n'),
        start: { date: lote.fechaPlanificada },
        end: { date: finExclusivo.toISOString().slice(0, 10) },
      },
    })
    return data.id ?? null
  } catch (e) {
    console.error('[google-calendar] crearEventoLote falló:', e instanceof Error ? e.message : e)
    return null
  }
}

export async function actualizarEventoLote(googleEventId: string, lote: EventoLoteProduccion): Promise<void> {
  if (!credencialesDisponibles()) return
  try {
    const calendar = clienteCalendar()
    const finExclusivo = new Date(`${lote.fechaPlanificada}T00:00:00Z`)
    finExclusivo.setUTCDate(finExclusivo.getUTCDate() + 1)
    const emoji = lote.categoria === 'cerveza' ? '🍺' : '🥤'
    await calendar.events.patch({
      calendarId: CALENDAR_ID!,
      eventId: googleEventId,
      requestBody: {
        summary: `${emoji} Cocción: ${lote.producto} — ${Math.round(lote.litrosPlanificados)} L`,
        start: { date: lote.fechaPlanificada },
        end: { date: finExclusivo.toISOString().slice(0, 10) },
      },
    })
  } catch (e) {
    console.error('[google-calendar] actualizarEventoLote falló:', e instanceof Error ? e.message : e)
  }
}

export async function eliminarEventoLote(googleEventId: string): Promise<void> {
  if (!credencialesDisponibles()) return
  try {
    const calendar = clienteCalendar()
    await calendar.events.delete({ calendarId: CALENDAR_ID!, eventId: googleEventId })
  } catch (e) {
    // 410/404 = ya no existe (borrado a mano en Calendar) — no es un error real.
    console.error('[google-calendar] eliminarEventoLote falló:', e instanceof Error ? e.message : e)
  }
}
