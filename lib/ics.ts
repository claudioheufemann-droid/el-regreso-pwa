/**
 * lib/ics.ts — Generador de archivos .ics (RFC 5545) para adjuntar en emails
 * de tareas. Cualquier cliente de calendario (Google Calendar, Outlook,
 * Apple Calendar) lo reconoce y ofrece agregarlo con un clic.
 */
export function buildIcs(task: { titulo: string; descripcion: string; plazo: string; area: string; horaLimite?: string | null }): string {
  const now = new Date()
  const [year, month, day] = task.plazo.split('-').map(Number)
  // Si el usuario definió una hora límite opcional se usa esa; si no, 9:00 por defecto.
  const [hh, mm] = task.horaLimite ? task.horaLimite.split(':').map(Number) : [9, 0]
  const plazo = new Date(Date.UTC(year, month - 1, day, hh, mm, 0))
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
  const end = new Date(plazo.getTime() + 60 * 60 * 1000)
  const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//El Regreso Control//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:task-${Date.now()}-${Math.random().toString(36).slice(2)}@elregresobeer.com`,
    `DTSTAMP:${fmt(now)}`,
    `DTSTART:${fmt(plazo)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(task.titulo)}`,
    `DESCRIPTION:Area: ${esc(task.area)}\\n\\n${esc(task.descripcion || 'Sin descripcion')}`,
    'STATUS:CONFIRMED',
    'TRANSP:OPAQUE',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    `DESCRIPTION:Recordatorio: ${esc(task.titulo)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}
