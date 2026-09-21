import 'server-only'
import sharp, { type Metadata } from 'sharp'
import { createHash } from 'crypto'
import {
  FOTO_LIMITE_BYTES, FOTO_LADO_MAYOR_INICIAL, FOTO_LADO_MAYOR_MINIMO,
  MINIATURA_LADO, MINIATURA_OBJETIVO_MAX_BYTES,
} from './config'

/**
 * Validación y compresión de la foto de llegada en SERVIDOR.
 *
 * El cliente ya comprime antes de subir (ver comprimirFoto.ts), pero nunca
 * es la fuente de verdad: acá se decodifica de nuevo con sharp (si no
 * decodifica, no es una foto real, sin importar el Content-Type que haya
 * declarado el navegador), se vuelve a codificar a WebP para eliminar
 * metadatos (EXIF/GPS incrustado) y se fuerza el mismo límite de bytes que
 * en el cliente — no se confía en el tamaño reportado.
 */

export interface FotoProcesada {
  buffer: Buffer
  ancho: number
  alto: number
  bytes: number
  hashSha256: string
  miniatura: Buffer
  formatoOriginal: string | undefined
}

export type ResultadoFoto =
  | { ok: true; foto: FotoProcesada }
  | { ok: false; error: string }

const FORMATOS_ACEPTADOS = new Set(['jpeg', 'png', 'webp', 'heif'])

export async function procesarFotoLlegada(entrada: Buffer): Promise<ResultadoFoto> {
  let meta: Metadata
  try {
    meta = await sharp(entrada).metadata()
  } catch {
    return { ok: false, error: 'La imagen no se pudo decodificar — no parece ser una foto válida.' }
  }

  if (!meta.format || !FORMATOS_ACEPTADOS.has(meta.format)) {
    return { ok: false, error: `Formato de imagen no aceptado (${meta.format ?? 'desconocido'}).` }
  }
  if (!meta.width || !meta.height || meta.width < 200 || meta.height < 200) {
    return { ok: false, error: 'La imagen es demasiado pequeña para ser una foto de evidencia real.' }
  }

  let ladoMayor = Math.min(FOTO_LADO_MAYOR_INICIAL, Math.max(meta.width, meta.height))
  let calidad = 78
  let salida: Buffer | null = null
  let ancho = meta.width
  let alto = meta.height

  // Itera calidad hacia abajo y, si no alcanza, reduce dimensión — nunca al revés,
  // para no perder legibilidad de la fachada antes de agotar la calidad.
  for (let intento = 0; intento < 12; intento++) {
    const redimensionado = sharp(entrada).rotate() // rotate() sin args: aplica la orientación EXIF y la descarta
    if (ladoMayor < Math.max(meta.width, meta.height)) {
      redimensionado.resize({
        width: meta.width >= meta.height ? ladoMayor : undefined,
        height: meta.height > meta.width ? ladoMayor : undefined,
        withoutEnlargement: true,
      })
    }
    const candidato = await redimensionado.webp({ quality: calidad }).toBuffer({ resolveWithObject: true })
    if (candidato.data.length <= FOTO_LIMITE_BYTES) {
      salida = candidato.data
      ancho = candidato.info.width
      alto = candidato.info.height
      break
    }
    if (calidad > 40) {
      calidad -= 12
    } else if (ladoMayor > FOTO_LADO_MAYOR_MINIMO) {
      ladoMayor = Math.max(FOTO_LADO_MAYOR_MINIMO, Math.round(ladoMayor * 0.85))
      calidad = 60
    } else {
      salida = candidato.data
      ancho = candidato.info.width
      alto = candidato.info.height
      break
    }
  }

  if (!salida) {
    return { ok: false, error: 'No se pudo comprimir la imagen bajo el límite permitido.' }
  }
  if (salida.length > FOTO_LIMITE_BYTES) {
    return { ok: false, error: 'La foto sigue superando 300 KB incluso comprimida al mínimo — repite la toma.' }
  }

  const miniatura = await sharp(salida)
    .resize({ width: MINIATURA_LADO, height: MINIATURA_LADO, fit: 'cover' })
    .webp({ quality: 65 })
    .toBuffer()

  if (miniatura.length > MINIATURA_OBJETIVO_MAX_BYTES * 2) {
    // Miniatura fuera de rango no bloquea la evidencia — solo es peor UX en listas.
  }

  return {
    ok: true,
    foto: {
      buffer: salida,
      ancho, alto,
      bytes: salida.length,
      hashSha256: createHash('sha256').update(salida).digest('hex'),
      miniatura,
      formatoOriginal: meta.format,
    },
  }
}
