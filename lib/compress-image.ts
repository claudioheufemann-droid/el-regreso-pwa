/**
 * Comprime una imagen en el navegador antes de subirla a Supabase Storage.
 * Reduce dimensiones y calidad para ahorrar almacenamiento.
 *
 * Configuración:
 * - Max 1200px en el lado mayor
 * - JPEG quality 0.78 (buen balance calidad/tamaño)
 * - Típicamente reduce 5-10x el tamaño original
 */
export async function compressImage(
  file: File,
  options: { maxDim?: number; quality?: number } = {}
): Promise<File> {
  const { maxDim = 1200, quality = 0.78 } = options

  return new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      URL.revokeObjectURL(url)

      // Calcular nuevas dimensiones manteniendo aspect ratio
      let { width, height } = img
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height / width) * maxDim)
          width = maxDim
        } else {
          width = Math.round((width / height) * maxDim)
          height = maxDim
        }
      }

      // Si la imagen ya es pequeña, devolver sin cambios
      if (img.width <= maxDim && img.height <= maxDim && file.size < 300_000) {
        resolve(file)
        return
      }

      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height

      const ctx = canvas.getContext('2d')
      if (!ctx) { resolve(file); return }

      // Fondo blanco para imágenes con transparencia (PNG → JPEG)
      ctx.fillStyle = '#FFFFFF'
      ctx.fillRect(0, 0, width, height)
      ctx.drawImage(img, 0, 0, width, height)

      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return }
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), {
            type: 'image/jpeg',
            lastModified: Date.now(),
          })
          console.log(
            `[compress] ${(file.size / 1024).toFixed(0)}KB → ${(compressed.size / 1024).toFixed(0)}KB ` +
            `(${Math.round((1 - compressed.size / file.size) * 100)}% reducción) ${width}×${height}px`
          )
          resolve(compressed)
        },
        'image/jpeg',
        quality
      )
    }

    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Error cargando imagen')) }
    img.src = url
  })
}
