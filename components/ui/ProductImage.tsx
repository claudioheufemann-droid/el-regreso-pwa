'use client'

/**
 * ProductImage — la única forma de dibujar la foto de un producto.
 *
 * Reemplaza cinco `ProductoThumb` distintos que además usaban emoji (🍺 / 🫧)
 * cuando faltaba la foto. Un emoji en una app comercial se lee como error, no
 * como diseño, y se veía distinto en cada sistema operativo.
 *
 * Fallback: monograma de la marca sobre superficie de la app, con el acento
 * de la categoría. Neutro, consistente entre dispositivos, y —lo importante—
 * inequívoco: nunca muestra la foto de OTRO producto para tapar el hueco.
 */

import { useState } from 'react'
import { imagenProducto, categoriaProducto, type CategoriaProducto } from '@/lib/producto-imagenes'

const ACENTO: Record<CategoriaProducto, string> = {
  cerveza:  '#D4AF37',
  kombucha: '#4ADE80',
  otro:     '#6B7280',
}

/** Iniciales del producto para el marcador: "Doble Hazy IPA" → "DH". */
function monograma(nombre?: string | null): string {
  if (!nombre) return '··'
  const palabras = nombre
    .replace(/^Kombucha\s+/i, '')
    .split(/\s+/)
    .filter(p => p.length > 1)
  if (palabras.length === 0) return nombre.slice(0, 2).toUpperCase()
  if (palabras.length === 1) return palabras[0].slice(0, 2).toUpperCase()
  return (palabras[0][0] + palabras[1][0]).toUpperCase()
}

export interface ProductImageProps {
  /** Nombre del producto — se usa para resolver la foto y el alt. */
  nombre?: string | null
  /** codigo_producto del ERP, si la pantalla lo tiene (tiene prioridad sobre el nombre). */
  codigo?: string | null
  /** Categoría cruda del ERP; si no viene se deduce del nombre. */
  categoria?: string | null
  /** Barril: usa la foto genérica de barril, sin importar el sabor. */
  esBarril?: boolean
  size?: number
  radius?: number
  style?: React.CSSProperties
}

export default function ProductImage({
  nombre, codigo, categoria, esBarril = false, size = 44, radius = 10, style,
}: ProductImageProps) {
  const src = imagenProducto({ nombre, codigo, esBarril })
  const [fallo, setFallo] = useState(false)
  const cat = categoriaProducto(categoria, nombre)

  const base: React.CSSProperties = {
    width: size, height: size, borderRadius: radius, flexShrink: 0,
    background: 'var(--surface2)', objectFit: 'contain', ...style,
  }

  if (src && !fallo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={nombre ?? ''}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        onError={() => setFallo(true)}
        style={base}
      />
    )
  }

  const acento = ACENTO[cat]
  return (
    <div
      // El marcador no aporta información nueva: el nombre del producto siempre
      // está al lado en la fila. Se oculta al lector de pantalla para no repetirlo.
      aria-hidden
      style={{
        ...base,
        border: `1px solid ${acento}22`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <span style={{
        fontSize: Math.max(9, Math.round(size * 0.30)),
        fontWeight: 900, letterSpacing: '-0.02em',
        color: acento, opacity: 0.85,
      }}>
        {monograma(nombre)}
      </span>
    </div>
  )
}
