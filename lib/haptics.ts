'use client'

/**
 * Feedback háptico — pequeñas vibraciones en momentos clave para que la app
 * se sienta nativa. navigator.vibrate es no-op en iOS Safari (no soportado),
 * pero funciona en Android/Chrome — degrada silenciosamente donde no aplica.
 */
export function hapticExito() {
  try { navigator.vibrate?.([15, 40, 15]) } catch {}
}

export function hapticTap() {
  try { navigator.vibrate?.(10) } catch {}
}

export function hapticError() {
  try { navigator.vibrate?.([20, 30, 20, 30, 20]) } catch {}
}
