import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * terreno-fotos pasa de bucket público a privado — las URLs que ya están
 * guardadas en la base son URLs públicas antiguas
 * (".../storage/v1/object/public/terreno-fotos/<path>"), no van a servir
 * más. Esta función las traduce a una URL firmada de acceso temporal en el
 * momento de mostrarlas, sin tener que reescribir ninguna fila existente:
 * la columna sigue guardando lo mismo de siempre, sólo se resuelve distinto
 * al leer.
 *
 * Nada de esto rompe fotos de otros buckets (avatars, logistica-evidence,
 * cotizaciones) — sólo actúa si la URL es de terreno-fotos; cualquier otra
 * cosa se devuelve intacta.
 */
const MARCADOR = '/storage/v1/object/public/terreno-fotos/'

function pathDesdeUrlPublica(url: string): string | null {
  const i = url.indexOf(MARCADOR)
  if (i === -1) return null
  return decodeURIComponent(url.slice(i + MARCADOR.length))
}

export async function firmarFotoTerreno(
  supabase: SupabaseClient,
  url: string | null | undefined,
  expiresInSeg = 3600,
): Promise<string | null> {
  if (!url) return null
  const path = pathDesdeUrlPublica(url)
  if (!path) return url // no es una URL pública de terreno-fotos (ya firmada, u otro bucket) — se deja igual
  const { data, error } = await supabase.storage.from('terreno-fotos').createSignedUrl(path, expiresInSeg)
  if (error || !data) return null
  return data.signedUrl
}

/** Firma las 4 fotos de una fila de visitas_terreno (las que existan). */
export async function firmarFotosVisita<
  T extends { foto_exterior?: string | null; foto_interior?: string | null; foto_exhibicion?: string | null; foto_competencia?: string | null },
>(supabase: SupabaseClient, filas: T[]): Promise<T[]> {
  return Promise.all(filas.map(async f => ({
    ...f,
    ...(('foto_exterior' in f) ? { foto_exterior: await firmarFotoTerreno(supabase, f.foto_exterior) } : {}),
    ...(('foto_interior' in f) ? { foto_interior: await firmarFotoTerreno(supabase, f.foto_interior) } : {}),
    ...(('foto_exhibicion' in f) ? { foto_exhibicion: await firmarFotoTerreno(supabase, f.foto_exhibicion) } : {}),
    ...(('foto_competencia' in f) ? { foto_competencia: await firmarFotoTerreno(supabase, f.foto_competencia) } : {}),
  })))
}
