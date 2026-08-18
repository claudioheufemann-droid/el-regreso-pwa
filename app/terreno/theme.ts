/**
 * Tokens del módulo Terreno — tema CLARO, el mismo de la pantalla de Ventas
 * (app/ventas/VentasHoyClient.tsx).
 *
 * Antes Terreno era oscuro con gradientes, glows y dorado; se migró al claro
 * por pedido de Claudio: el vendedor trabaja con el celular al sol, y el
 * contraste alto sobre fondo claro se lee mucho mejor que el dorado sobre
 * negro. Los valores van hardcodeados a propósito y NO usan las variables
 * --bg/--cream de globals.css: si se usaran, al cambiar el tema global estas
 * pantallas quedarían con texto claro sobre fondo claro.
 */
export const C = {
  bg: '#F1F5F9',
  card: '#FFFFFF',
  hero: '#0F172A',
  text: '#0F172A',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  blue: '#2563EB',
  blueSoft: '#EFF6FF',
  green: '#059669',
  greenSoft: '#ECFDF5',
  purple: '#7C3AED',
  purpleSoft: '#F5F3FF',
  amber: '#D97706',
  amberSoft: '#FFFBEB',
  red: '#DC2626',
  redSoft: '#FEF2F2',
} as const

/** Alto mínimo de cualquier control que se toque con el dedo en terreno. */
export const TAP = 44

export const fPeso = (n: number) =>
  `$${Math.round(n).toLocaleString('es-CL')}`

export const fNum = (n: number) => n.toLocaleString('es-CL')

export const fHora = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

export const fFechaCorta = (iso: string) => {
  const d = new Date(iso.length <= 10 ? iso + 'T12:00:00' : iso)
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

/** Contenedor de página: fondo claro + espacio para el BottomNav flotante. */
export const paginaStyle: React.CSSProperties = {
  minHeight: '100vh',
  background: C.bg,
  paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))',
}

export const contenedorStyle: React.CSSProperties = {
  maxWidth: 720,
  margin: '0 auto',
  padding: '20px 16px 0',
}

/** Tarjeta blanca estándar. */
export const cardStyle: React.CSSProperties = {
  background: C.card,
  border: `1px solid ${C.line}`,
  borderRadius: 16,
}

/** Botón principal de acción (oscuro sobre claro, como "Nueva" en Ventas). */
export const btnPrimario: React.CSSProperties = {
  width: '100%',
  minHeight: 52,
  borderRadius: 14,
  border: 'none',
  background: C.hero,
  color: '#fff',
  fontSize: 16,
  fontWeight: 800,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
}
