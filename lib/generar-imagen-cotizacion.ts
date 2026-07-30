/**
 * lib/generar-imagen-cotizacion.ts — Genera la imagen de marca de una
 * cotización (mismo enfoque que generarImagenVenta en NuevaVisitaClient.tsx:
 * dibujo a mano en <canvas>, sin librerías nuevas). Solo se usa desde
 * componentes cliente ('use client') — usa document/Image/canvas.
 */
import { fmtPrecioCLP } from './catalogo-productos'

export interface ItemCotizacionImagen {
  producto: string
  envase: 'lata' | 'barril'
  precioUnitario: number
  cantidad: number
  descuentoPct: number
}

export interface DatosCotizacionImagen {
  numero: number
  fecha: string // ya formateada, ej. "30 de julio de 2026"
  clienteNombre: string
  clienteEmpresa?: string | null
  vendedorNombre: string
  zona: 'valdivia' | 'santiago'
  items: ItemCotizacionImagen[]
  notas?: string | null
}

export function calcularTotalesCotizacion(items: ItemCotizacionImagen[]) {
  let subtotal = 0
  let descuentoTotal = 0
  for (const it of items) {
    const bruto = it.precioUnitario * it.cantidad
    subtotal += bruto
    descuentoTotal += bruto * (it.descuentoPct / 100)
  }
  return { subtotal, descuentoTotal, total: subtotal - descuentoTotal }
}

function loadImg(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const i = new Image()
    i.onload = () => res(i)
    i.onerror = rej
    i.src = src
  })
}

const GOLD = '#D4AF37'
const CREAM = '#F4EEDF'
const BG = '#0D0D0D'
const BG_HEADER = '#131313'
const MUTED_1 = 'rgba(255,255,255,0.4)'
const MUTED_2 = 'rgba(255,255,255,0.28)'

export async function generarImagenCotizacion(datos: DatosCotizacionImagen): Promise<Blob> {
  const W = 680
  const PAD = 32
  const HEADER = 208
  const COL_HEAD = 30
  const ROW = 58
  const TOTALES_H = datos.items.length ? (98) : 0
  const NOTAS_H = datos.notas?.trim() ? 20 + Math.ceil(datos.notas.length / 78) * 16 + 14 : 0
  const FOOTER = 74
  const H = HEADER + COL_HEAD + datos.items.length * ROW + TOTALES_H + NOTAS_H + FOOTER
  const DPR = 2

  const canvas = document.createElement('canvas')
  canvas.width = W * DPR
  canvas.height = H * DPR
  const ctx = canvas.getContext('2d')!
  ctx.scale(DPR, DPR)

  const logo = await loadImg('/logo-icon-1024.png').catch(() => null)

  // ── fondo ──────────────────────────────────────────────────────────────
  ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = GOLD; ctx.fillRect(0, 0, W, 5)
  ctx.fillStyle = BG_HEADER; ctx.fillRect(0, 5, W, HEADER - 5)

  // ── header: logo + marca ─────────────────────────────────────────────
  const LOGO_SIZE = 62
  if (logo) ctx.drawImage(logo, PAD, 26, LOGO_SIZE, LOGO_SIZE)
  const txX = PAD + (logo ? LOGO_SIZE + 16 : 0)
  ctx.font = '900 22px system-ui, sans-serif'
  ctx.fillStyle = GOLD
  ctx.fillText('EL REGRESO BEER CO.', txX, 52)
  ctx.font = '400 11px system-ui, sans-serif'
  ctx.fillStyle = MUTED_2
  ctx.fillText('Valdivia, Chile  ·  www.elregresobeer.com', txX, 70)
  ctx.font = '800 13px system-ui, sans-serif'
  ctx.fillStyle = MUTED_1
  ctx.textAlign = 'right'
  ctx.fillText(`COTIZACIÓN N° ${String(datos.numero).padStart(4, '0')}`, W - PAD, 52)
  ctx.textAlign = 'left'

  // línea separadora
  ctx.fillStyle = 'rgba(212,175,55,0.18)'; ctx.fillRect(PAD, 108, W - PAD * 2, 1)

  // datos cliente / vendedor / zona / fecha (grid 2x2)
  const filas = [
    { label: 'CLIENTE',  value: datos.clienteEmpresa ? `${datos.clienteNombre} (${datos.clienteEmpresa})` : datos.clienteNombre },
    { label: 'FECHA',    value: datos.fecha },
    { label: 'VENDEDOR', value: datos.vendedorNombre },
    { label: 'ZONA',     value: datos.zona === 'santiago' ? 'Santiago' : 'Zona Sur' },
  ]
  filas.forEach((f, i) => {
    const col = i % 2
    const row = Math.floor(i / 2)
    const x = PAD + col * ((W - PAD * 2) / 2)
    const y = 134 + row * 40
    ctx.font = '700 9px system-ui, sans-serif'
    ctx.fillStyle = MUTED_1
    ctx.fillText(f.label, x, y)
    ctx.font = '700 14px system-ui, sans-serif'
    ctx.fillStyle = CREAM
    ctx.fillText(f.value.slice(0, 40), x, y + 19)
  })

  ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(0, HEADER - 1, W, 1)

  // ── encabezado de columnas ───────────────────────────────────────────
  const yCol = HEADER
  ctx.fillStyle = '#161616'; ctx.fillRect(0, yCol, W, COL_HEAD)
  const COLX = { producto: PAD, cant: W - PAD - 280, precio: W - PAD - 210, desc: W - PAD - 120, subtotal: W - PAD }
  ctx.font = '800 9.5px system-ui, sans-serif'
  ctx.fillStyle = MUTED_1
  ctx.fillText('PRODUCTO', COLX.producto, yCol + 19)
  ctx.textAlign = 'right'
  ctx.fillText('CANT.', COLX.cant + 60, yCol + 19)
  ctx.fillText('PRECIO', COLX.precio + 60, yCol + 19)
  ctx.fillText('DESC.', COLX.desc + 50, yCol + 19)
  ctx.fillText('SUBTOTAL', COLX.subtotal, yCol + 19)
  ctx.textAlign = 'left'

  // ── filas de productos ───────────────────────────────────────────────
  datos.items.forEach((it, idx) => {
    const y = HEADER + COL_HEAD + idx * ROW
    ctx.fillStyle = idx % 2 === 0 ? '#0F0F0F' : '#111111'
    ctx.fillRect(0, y, W, ROW)

    const bruto = it.precioUnitario * it.cantidad
    const descMonto = bruto * (it.descuentoPct / 100)
    const subtotalLinea = bruto - descMonto

    ctx.font = '700 14px system-ui, sans-serif'
    ctx.fillStyle = CREAM
    ctx.fillText(it.producto.slice(0, 30), PAD, y + 24)
    ctx.font = '400 11px system-ui, sans-serif'
    ctx.fillStyle = MUTED_2
    ctx.fillText(it.envase === 'barril' ? 'Barril 30L' : 'Lata', PAD, y + 42)

    ctx.font = '700 13px system-ui, sans-serif'
    ctx.fillStyle = CREAM
    ctx.textAlign = 'right'
    ctx.fillText(String(it.cantidad), COLX.cant + 60, y + ROW / 2 + 5)
    ctx.font = '400 12px system-ui, sans-serif'
    ctx.fillStyle = MUTED_1
    ctx.fillText(fmtPrecioCLP(it.precioUnitario), COLX.precio + 60, y + ROW / 2 + 5)
    ctx.fillStyle = it.descuentoPct > 0 ? '#7CA86A' : MUTED_2
    ctx.fillText(it.descuentoPct > 0 ? `-${it.descuentoPct}%` : '—', COLX.desc + 50, y + ROW / 2 + 5)
    ctx.font = '800 14px system-ui, sans-serif'
    ctx.fillStyle = GOLD
    ctx.fillText(fmtPrecioCLP(subtotalLinea), COLX.subtotal, y + ROW / 2 + 5)
    ctx.textAlign = 'left'

    ctx.fillStyle = 'rgba(255,255,255,0.04)'; ctx.fillRect(0, y + ROW - 1, W, 1)
  })

  // ── totales ──────────────────────────────────────────────────────────
  const { subtotal, descuentoTotal, total } = calcularTotalesCotizacion(datos.items)
  let yT = HEADER + COL_HEAD + datos.items.length * ROW
  ctx.fillStyle = '#161616'; ctx.fillRect(0, yT, W, TOTALES_H)
  ctx.fillStyle = 'rgba(212,175,55,0.2)'; ctx.fillRect(0, yT, W, 1)

  ctx.font = '700 11px system-ui, sans-serif'
  ctx.fillStyle = MUTED_1
  ctx.fillText('Subtotal', PAD, yT + 26)
  ctx.textAlign = 'right'
  ctx.fillText(fmtPrecioCLP(subtotal), W - PAD, yT + 26)
  ctx.textAlign = 'left'

  if (descuentoTotal > 0) {
    ctx.font = '700 11px system-ui, sans-serif'
    ctx.fillStyle = '#7CA86A'
    ctx.fillText('Descuento', PAD, yT + 46)
    ctx.textAlign = 'right'
    ctx.fillText(`-${fmtPrecioCLP(descuentoTotal)}`, W - PAD, yT + 46)
    ctx.textAlign = 'left'
  }

  ctx.font = '900 24px system-ui, sans-serif'
  ctx.fillStyle = CREAM
  ctx.fillText('TOTAL', PAD, yT + TOTALES_H - 18)
  ctx.textAlign = 'right'
  ctx.fillStyle = GOLD
  ctx.fillText(fmtPrecioCLP(total), W - PAD, yT + TOTALES_H - 18)
  ctx.textAlign = 'left'
  ctx.font = '400 10px system-ui, sans-serif'
  ctx.fillStyle = MUTED_2
  ctx.fillText('Precios con IVA incluido', PAD, yT + TOTALES_H - 2)

  // ── notas ────────────────────────────────────────────────────────────
  let yN = yT + TOTALES_H
  if (NOTAS_H > 0 && datos.notas) {
    ctx.fillStyle = BG; ctx.fillRect(0, yN, W, NOTAS_H)
    ctx.font = '700 9px system-ui, sans-serif'
    ctx.fillStyle = MUTED_1
    ctx.fillText('NOTAS', PAD, yN + 16)
    ctx.font = '400 11px system-ui, sans-serif'
    ctx.fillStyle = MUTED_2
    const palabras = datos.notas.split(' ')
    let linea = ''; let ly = yN + 32
    for (const palabra of palabras) {
      const prueba = linea ? `${linea} ${palabra}` : palabra
      if (prueba.length > 78) { ctx.fillText(linea, PAD, ly); linea = palabra; ly += 16 }
      else linea = prueba
    }
    if (linea) ctx.fillText(linea, PAD, ly)
  }

  // ── footer ───────────────────────────────────────────────────────────
  const yF = yN + NOTAS_H
  ctx.fillStyle = '#0A0A0A'; ctx.fillRect(0, yF, W, FOOTER)
  ctx.fillStyle = GOLD; ctx.fillRect(0, yF, W, 3)
  ctx.font = '700 11px system-ui, sans-serif'
  ctx.fillStyle = MUTED_1
  ctx.textAlign = 'center'
  ctx.fillText('Cotización válida por 15 días desde la fecha de emisión', W / 2, yF + 30)
  ctx.font = '400 10px system-ui, sans-serif'
  ctx.fillStyle = MUTED_2
  ctx.fillText('El Regreso Beer Co. · Valdivia, Chile · www.elregresobeer.com', W / 2, yF + 52)
  ctx.textAlign = 'left'

  return new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
}

export async function compartirImagenCotizacion(blob: Blob, numero: number) {
  const filename = `cotizacion-el-regreso-${String(numero).padStart(4, '0')}.png`
  const file = new File([blob], filename, { type: 'image/png' })
  if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `Cotización El Regreso #${numero}` })
  } else {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }
}
