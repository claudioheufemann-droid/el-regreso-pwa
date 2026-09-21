/**
 * Límites de foto de evidencia — compartidos entre compresión en el cliente
 * (lib/terreno/comprimirFoto.ts) y validación en el servidor
 * (lib/terreno/fotoServidor.ts). El límite es el mismo número en los dos
 * lados a propósito: 300.000 bytes, ni más ni menos.
 */
export const FOTO_LIMITE_BYTES = 300_000
export const FOTO_OBJETIVO_MIN_BYTES = 100_000
export const FOTO_OBJETIVO_MAX_BYTES = 250_000
export const FOTO_LADO_MAYOR_INICIAL = 1280
export const FOTO_LADO_MAYOR_MINIMO = 960
export const MINIATURA_LADO = 280
export const MINIATURA_OBJETIVO_MAX_BYTES = 25_000

/**
 * Cuota mensual de fotos por vendedor — propuesta inicial, ajustable sin
 * migrar nada (es solo este número). A ~200 KB por foto de llegada y un
 * vendedor con ~25 visitas/día hábil, 500 MB/mes deja margen holgado antes
 * de la primera alerta.
 */
export const CUOTA_MENSUAL_BYTES_VENDEDOR = 500 * 1024 * 1024
export const CUOTA_ALERTA_UMBRALES = [0.70, 0.85, 0.95] as const

/** Ventana de sesión de captura online — debe calzar con verificacion.ts. */
export const SESION_CAPTURA_MAX_MS = 5 * 60 * 1000
/** Tolerancia de reloj: lectura GPS más "futura" que esto respecto al servidor = reloj incoherente. */
export const RELOJ_TOLERANCIA_FUTURO_MS = 2 * 60 * 1000
/** Lectura GPS más vieja que esto respecto al servidor = reloj incoherente (no solo "antigua"). */
export const RELOJ_TOLERANCIA_PASADO_MS = 24 * 60 * 60 * 1000
