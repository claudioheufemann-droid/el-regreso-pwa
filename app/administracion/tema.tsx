'use client'

import type { CSSProperties, ReactNode } from 'react'
import { Info } from 'lucide-react'

/* ────────────────────────────────────────────────────────────────────────
   Paleta y piezas comunes de Administración y Finanzas (rediseño 5-oct-2026).

   El módulo es CLARO a propósito: lo pidió el usuario el 10-sep-2026 porque
   "el negro predominaba demasiado". Antes había OCHO copias de esta paleta,
   una por archivo y con diferencias (en una `gold` era azul, en otra ámbar),
   todas con el gris pizarra + azul por defecto de Tailwind. Ahora hay una
   sola, con la marca: papel cálido, tinta oscura y dorado para lo que se
   toca, igual que el modo claro de Producción.

   Los nombres viejos (blue, sky, teal…) se conservan para no reescribir cada
   uso: `blue` es ahora el color de ACCIÓN (dorado oscuro), no un azul. Los
   valores son hex (no var(--x)) porque Recharts los pasa como atributos SVG.
   ──────────────────────────────────────────────────────────────────────── */
export const C = {
  // superficies y texto
  bg: '#F5F2EC',
  card: '#FFFFFF',
  hero: '#1C1915',
  text: '#1C1915',
  muted: '#6B6457',
  faint: '#9A9284',
  line: '#E7E1D5',
  hoy: '#1C1915',
  // acción y primera serie de los gráficos (dorado de la marca, oscurecido para leerse sobre blanco)
  blue: '#87691A',
  blueSoft: '#F6EFD9',
  gold: '#87691A',
  goldSoft: '#F6EFD9',
  sky: '#D9C27A',
  // semánticos
  green: '#2F7D4F',
  greenSoft: '#EAF4EC',
  teal: '#2F7D6D',
  amber: '#B4690E',
  amberSoft: '#FDF4E3',
  amberBorder: '#F0D9A8',
  red: '#B42318',
  redSoft: '#FDECEA',
  redBorder: '#F5C2BC',
  purple: '#6D4FB0',
  purpleSoft: '#F1ECF9',
  violet: '#6D4FB0',
  stone: '#A8A29E',
}

/** Tarjeta: blanca, borde cálido, esquinas de 14 px. Un solo tratamiento para
 *  todo el módulo (antes había cinco versiones con bordes y rellenos distintos). */
export function Card({ children, acento, padding = 'clamp(14px, 4vw, 20px)', style }: {
  children: ReactNode
  /** Color del borde cuando la tarjeta tiene que destacarse. */
  acento?: string
  padding?: number | string
  style?: CSSProperties
}) {
  return (
    <div className="adm-card" style={{ border: `1px solid ${acento ?? C.line}`, padding, ...style }}>
      {children}
    </div>
  )
}

/** Aviso con fondo suave del mismo tono que su borde. */
export function CardAlerta({ children, tono = 'amber' }: { children: ReactNode; tono?: 'amber' | 'red' }) {
  return (
    <div className="adm-card" style={{
      background: tono === 'amber' ? C.amberSoft : C.redSoft,
      border: `1px solid ${tono === 'amber' ? C.amberBorder : C.redBorder}`,
      boxShadow: 'none', padding: 18,
    }}>
      {children}
    </div>
  )
}

/** Etiqueta en mayúsculas sobre una cifra; con `title`, muestra el ícono de ayuda. */
export function Etiqueta({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <p title={title} className="adm-eyebrow" style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
      {children}
      {title && <Info size={11} style={{ opacity: 0.5 }} aria-hidden />}
    </p>
  )
}

/** Cifra grande: números tabulares y tracking negativo (el texto grande se
 *  ve suelto con el espaciado del texto de lectura). */
export function Cifra({ children, color = C.text, tamano = 28, style }: { children: ReactNode; color?: string; tamano?: number; style?: CSSProperties }) {
  return (
    <p className="adm-cifra" style={{ fontSize: tamano, color, marginTop: 6, ...style }}>
      {children}
    </p>
  )
}

/** Franja de cifras: una superficie con divisores finos en vez de varias
 *  tarjetas iguales sueltas. Los hijos son <Card> y pierden su borde propio. */
export function Franja({ children, min = 240 }: { children: ReactNode; min?: number }) {
  return (
    <div className="adm-franja" style={{ ['--franja-min' as string]: `min(${min}px, 100%)` }}>
      {children}
    </div>
  )
}
