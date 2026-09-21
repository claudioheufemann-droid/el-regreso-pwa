'use client'

import { FOTO_LIMITE_BYTES, FOTO_OBJETIVO_MAX_BYTES, FOTO_LADO_MAYOR_INICIAL, FOTO_LADO_MAYOR_MINIMO } from './config'

/**
 * Comprime la foto de llegada EN EL CLIENTE antes de subir — el objetivo es
 * no mandar nunca varios MB por una red de terreno. El servidor
 * (lib/terreno/fotoServidor.ts) vuelve a validar y comprimir sin confiar en
 * este resultado, así que acá basta con acercarse bien al objetivo.
 */
export async function comprimirFotoLlegada(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  let ladoMayor = Math.min(FOTO_LADO_MAYOR_INICIAL, Math.max(bitmap.width, bitmap.height))
  let calidad = 0.75
  let blob: Blob | null = null

  const soportaWebp = await navigator.mediaCapabilities
    ?.decodingInfo({ type: 'file', video: { contentType: 'image/webp', width: 1, height: 1, bitrate: 1, framerate: 1 } })
    .then(() => true).catch(() => false)
    ?? true
  const tipo = soportaWebp ? 'image/webp' : 'image/jpeg'

  for (let intento = 0; intento < 10; intento++) {
    const escala = ladoMayor / Math.max(bitmap.width, bitmap.height)
    const w = Math.max(1, Math.round(bitmap.width * Math.min(1, escala)))
    const h = Math.max(1, Math.round(bitmap.height * Math.min(1, escala)))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) break
    ctx.drawImage(bitmap, 0, 0, w, h)

    const candidato = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, tipo, calidad))
    if (!candidato) break

    if (candidato.size <= FOTO_OBJETIVO_MAX_BYTES || (calidad <= 0.4 && ladoMayor <= FOTO_LADO_MAYOR_MINIMO)) {
      blob = candidato
      break
    }
    blob = candidato // por si el bucle termina sin volver a entrar

    if (calidad > 0.4) calidad -= 0.1
    else ladoMayor = Math.max(FOTO_LADO_MAYOR_MINIMO, Math.round(ladoMayor * 0.85))
  }

  bitmap.close()
  if (!blob) throw new Error('No se pudo procesar la foto en este teléfono.')
  if (blob.size > FOTO_LIMITE_BYTES) throw new Error('La foto sigue pesando más de 300 KB — intenta de nuevo con más luz o más cerca.')
  return blob
}
