'use client'

import { forwardRef } from 'react'
import type { StockProductoRow } from './page'
import ProductImage from '@/components/ui/ProductImage'

const IC = {
  bg: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', line: '#E7EAEF',
  green: '#059669', greenSoft: '#ECFDF5',
  red: '#DC2626', redSoft: '#FEF2F2',
  cerveza: '#7C3AED', cervezaSoft: '#F5F3FF',
  kombucha: '#059669', kombuchaSoft: '#ECFDF5',
}

const UMBRAL_LATA_CRITICO = 24
const UMBRAL_BARRIL_CRITICO = 3
const UNIDADES_POR_CAJA = 24

function ok(f: StockProductoRow): boolean {
  if (f.tipo === 'barril') return f.cantidad >= UMBRAL_BARRIL_CRITICO
  return f.cantidad >= UMBRAL_LATA_CRITICO
}

const fNum = (n: number) => n.toLocaleString('es-CL')
function fCajas(cantidad: number): string {
  const cajas = Math.floor(cantidad / UNIDADES_POR_CAJA)
  const resto = cantidad % UNIDADES_POR_CAJA
  if (cajas === 0) return `${resto} un.`
  if (resto === 0) return `${fNum(cajas)} caja${cajas === 1 ? '' : 's'}`
  return `${fNum(cajas)} caja${cajas === 1 ? '' : 's'} + ${resto} un.`
}
function fFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d} ${meses[m - 1]} ${y}`
}

interface Grupo {
  titulo: string
  tint: string
  tintSoft: string
  items: StockProductoRow[]
}

function Fila({ f, esLata }: { f: StockProductoRow; esLata: boolean }) {
  const bien = ok(f)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '10px 0', borderBottom: `1px solid ${IC.line}`,
    }}>
      <ProductImage nombre={f.producto} codigo={f.codigo_producto} categoria={f.categoria} esBarril={!esLata} size={40} />
      <p style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: IC.text, lineHeight: 1.3 }}>{f.producto}</p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 15, fontWeight: 800, color: IC.text }}>
            {fNum(f.cantidad)} <span style={{ fontSize: 11, fontWeight: 500, color: IC.muted }}>{esLata ? 'un.' : f.cantidad === 1 ? 'barril' : 'barriles'}</span>
          </p>
          {esLata && <p style={{ fontSize: 11, color: IC.muted, marginTop: 1 }}>{fCajas(f.cantidad)}</p>}
        </div>
        <span style={{
          width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
          background: bien ? IC.green : IC.red,
        }} />
      </div>
    </div>
  )
}

function Seccion({ g, esLata }: { g: Grupo; esLata: boolean }) {
  if (g.items.length === 0) return null
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        background: g.tintSoft, color: g.tint,
        fontSize: 12, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase',
        padding: '5px 12px', borderRadius: 999, marginBottom: 8,
      }}>
        {g.titulo}
      </div>
      <div style={{ background: IC.bg, border: `1px solid ${IC.line}`, borderRadius: 14, padding: '2px 14px' }}>
        {g.items.map((f, i) => <Fila key={`${f.tipo}-${f.producto}-${i}`} f={f} esLata={esLata} />)}
      </div>
    </div>
  )
}

/**
 * Tarjeta oculta (fuera de pantalla) que se convierte a PNG con html-to-image
 * para compartir el stock como imagen — reemplaza el bloque de texto plano
 * que copiaba el botón anterior, mucho más difícil de leer para el cliente.
 * Separada en 4 secciones fijas (barriles cerveza/kombucha, latas
 * cerveza/kombucha) tal como se pidió, cada una sólo si tiene productos.
 */
const StockShareImage = forwardRef<HTMLDivElement, {
  barriles: StockProductoRow[]; envases: StockProductoRow[]; fechaInforme: string | null
}>(function StockShareImage({ barriles, envases, fechaInforme }, ref) {
  const porCategoria = (lista: StockProductoRow[], cat: string) =>
    lista.filter(f => (f.categoria ?? 'Otros') === cat).sort((a, b) => a.producto.localeCompare(b.producto))

  const grupos: { g: Grupo; esLata: boolean }[] = [
    { g: { titulo: '🍺 Barriles · Cerveza', tint: IC.cerveza, tintSoft: IC.cervezaSoft, items: porCategoria(barriles, 'Cerveza') }, esLata: false },
    { g: { titulo: '🫧 Barriles · Kombucha', tint: IC.kombucha, tintSoft: IC.kombuchaSoft, items: porCategoria(barriles, 'Kombucha') }, esLata: false },
    { g: { titulo: '🍺 Latas · Cerveza', tint: IC.cerveza, tintSoft: IC.cervezaSoft, items: porCategoria(envases, 'Cerveza') }, esLata: true },
    { g: { titulo: '🫧 Latas · Kombucha', tint: IC.kombucha, tintSoft: IC.kombuchaSoft, items: porCategoria(envases, 'Kombucha') }, esLata: true },
  ]

  return (
    // Wrapper EXTERNO oculto — nunca el nodo capturado. html-to-image clona el
    // nodo apuntado por `ref` con sus estilos inline tal cual; si el opacity:0
    // o el left:-9999px van en ESE nodo, el clon sale igual de invisible/vacío
    // en el PNG (confirmado: 3 intentos con eso en el nodo capturado dieron
    // un PNG 100% blanco, sin ni el logo). Ocultando sólo el contenedor
    // (height/width 0 + overflow hidden) el nodo interno queda con estilos
    // "normales" para el clon, y el layout de la página no se mueve ni un px.
    <div style={{ position: 'fixed', top: 0, left: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div
        ref={ref}
        style={{
          width: 680,
          background: IC.bg, fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
          padding: '32px 28px',
        }}
      >
        {/* Encabezado de marca */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{
            width: 46, height: 46, borderRadius: 12, background: IC.hero,
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0,
          }}>🍺</div>
          <div>
            <p style={{ fontSize: 20, fontWeight: 900, color: IC.text, letterSpacing: '-0.3px' }}>El Regreso Beer</p>
            <p style={{ fontSize: 12.5, color: IC.muted }}>Cervecería Artesanal · Valdivia</p>
          </div>
        </div>

        <div style={{ height: 1, background: IC.line, margin: '18px 0 20px' }} />

        <p style={{ fontSize: 17, fontWeight: 800, color: IC.text, marginBottom: 2 }}>Stock disponible para pedidos</p>
        <p style={{ fontSize: 12.5, color: IC.muted, marginBottom: 22 }}>
          {fechaInforme ? `Actualizado ${fFecha(fechaInforme)}` : 'Actualizado hoy'}
        </p>

        {grupos.map(({ g, esLata }, i) => <Seccion key={i} g={g} esLata={esLata} />)}

        <div style={{ height: 1, background: IC.line, margin: '4px 0 16px' }} />
        <p style={{ fontSize: 11.5, color: IC.muted, textAlign: 'center' }}>
          ¿Qué te gustaría pedir? Escríbenos y coordinamos tu pedido.
        </p>
      </div>
    </div>
  )
})

export default StockShareImage
