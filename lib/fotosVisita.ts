/**
 * lib/fotosVisita.ts — Definición única de las 4 fotos de una visita en
 * terreno (frontis, interior, exhibición, competencia).
 *
 * Antes había DOS listas por separado (una en PasoCheckin.tsx para el
 * flujo de venta, otra en HistorialClient.tsx para la subida tardía) y ya
 * se habían desalineado: la del historial no sabía de la foto de interior
 * porque no existía, y `fotos_status` se marcaba "COMPLETO" con solo
 * subir UNA foto sin revisar si faltaban las demás. Una sola fuente de
 * verdad, importable tanto desde componentes cliente como desde el cron
 * de recordatorios (server, sin 'use client').
 */

export type SlotFoto = 'exterior' | 'interior' | 'exhibicion' | 'competencia'

export interface DefSlotFoto {
  key: SlotFoto
  /** Columna real en `visitas_terreno`. */
  campo: string
  label: string
  ayuda: string
  emoji: string
}

export const SLOTS_FOTO: DefSlotFoto[] = [
  { key: 'exterior',    campo: 'foto_exterior',    label: 'Frontis',     ayuda: 'La fachada del local, desde afuera',               emoji: '🏪' },
  { key: 'interior',    campo: 'foto_interior',    label: 'Interior',    ayuda: 'Cómo se ve el local por dentro',                   emoji: '🏠' },
  { key: 'exhibicion',  campo: 'foto_exhibicion',  label: 'Exhibición',  ayuda: 'Cómo (o dónde podría) exhibirse nuestro producto', emoji: '🍺' },
  { key: 'competencia', campo: 'foto_competencia', label: 'Competencia', ayuda: 'Qué otras marcas se venden en el local',           emoji: '🔍' },
]

export const CAMPO_DE_SLOT: Record<SlotFoto, string> =
  Object.fromEntries(SLOTS_FOTO.map(s => [s.key, s.campo])) as Record<SlotFoto, string>

/** true si las 4 columnas de foto están presentes en la fila. */
export function fotosCompletas(row: object): boolean {
  const r = row as Record<string, unknown>
  return SLOTS_FOTO.every(s => !!r[s.campo])
}
