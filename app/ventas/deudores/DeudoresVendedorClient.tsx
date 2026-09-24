'use client'

import { Fragment, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Wallet, ChevronLeft, Search, X, Users, Coins,
  MessageCircle, Phone, FileDown, Loader2, ArrowUp, ArrowDown, ArrowUpDown,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { useUser } from '@/lib/userContext'
import { VENDEDORES_CARTERA_COBRANZA, vendedorCanonico, grupoCarteraDe, nombreCorto } from '@/lib/types'
import NotificationsBell from '@/components/ui/NotificationsBell'
import SettingsPanel from '@/components/ui/SettingsPanel'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import PanelCobranza, {
  documentosParaWA, FilaDocumento, CLARO as PALETA_DOC_CLARO, OSCURO as PALETA_DOC_OSCURO, type DatosCobranza,
} from '@/components/deudores/PanelCobranza'
import { diasMoraDeudor, type DocumentoVencido } from '@/lib/cobranza'

interface Deudor {
  id: string
  nombre_fantasia: string
  razon_social?: string
  email?: string | null
  telefono?: string | null
  localidad?: string | null
  saldo_total: number
  deuda_vencida: number
  barriles_adeudados: number
  ultimo_pago?: string | null
  categoria_cliente?: string | null
  vendedor?: string | null
  tipo_cliente?: string | null
  fecha_ultima_compra?: string | null
  fecha_alta?: string | null
  limite_cta_cte?: number
  deuda_menor_14_dias: number
  deuda_entre_15_29_dias: number
  deuda_entre_30_44_dias: number
  deuda_entre_45_59_dias: number
  deuda_entre_60_89_dias: number
  deuda_mas_90_dias: number
  dias_pago?: number
  /** Emisión del remito más antiguo con saldo — base de los días exactos de mora. */
  external_fecha?: string | null
  external_remito_mas_antiguo?: number | null
  updated_at: string
  /** Parte de `deuda_vencida` que es co-packing (calculada en page.tsx). */
  maquila_vencida: number
  /** `deuda_vencida` menos la maquila: lo que persigue el área comercial. */
  deuda_comercial: number
  /** `saldo_total` menos la maquila — para que "vencida + no vencida" sume
      exactamente este número. Sin esto, saldo_total (crudo del ERP) incluye
      la maquila pero deuda_comercial ya no, y las tres cifras no calzan. */
  saldo_comercial: number
}

/** Fila cruda de Supabase, antes de descontarle la maquila. */
type DeudorRaw = Omit<Deudor, 'maquila_vencida' | 'deuda_comercial' | 'saldo_comercial'>

interface Props {
  initialDeudores: DeudorRaw[]
  isAdmin: boolean
  clientesPorVendedor: Record<string, number>
  totalClientesPropios: number
  maquilaPorCliente: Record<string, number>
}

/**
 * La maquila (litros producidos o latas cerradas para otra cervecería) se
 * factura al mismo cliente y el ERP la mete en `deuda_vencida`, pero no es
 * deuda del área comercial y nadie del equipo de ventas la cobra. Se descuenta
 * acá, una vez, para que TODA la pantalla —KPIs, carteras, orden, tarjetas—
 * hable de la misma plata (pedido de Claudio, 2026-09-01, a raíz de los
 * $2.639.613 de El Growler que son litros de maquila).
 */
function conDeudaComercial(filas: DeudorRaw[], maquilaPorCliente: Record<string, number>): Deudor[] {
  return filas.map(d => {
    const maquila = maquilaPorCliente[d.nombre_fantasia] ?? 0
    return {
      ...d,
      maquila_vencida: Math.round(maquila),
      deuda_comercial: Math.round(Math.max(0, (d.deuda_vencida || 0) - maquila)),
      saldo_comercial: Math.round(Math.max(0, (d.saldo_total || 0) - maquila)),
    }
  })
}

// ── Paleta clara — mismo patrón que Clientes/Stock (const MC/C locales) ───────
const MC = {
  bg: '#F1F5F9', card: '#FFFFFF', text: '#0F172A', muted: '#64748B', faint: '#94A3B8',
  border: '#E2E8F0', blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#059669', greenSoft: '#ECFDF5', amber: '#D97706', amberSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2', whatsapp: '#25D366',
}

type Bucket = 'al-dia' | '1-30' | '31-60' | '+60'

const BUCKET_COLOR: Record<Bucket, { fg: string; bg: string }> = {
  'al-dia': { fg: MC.green, bg: MC.greenSoft },
  '1-30':   { fg: MC.amber, bg: MC.amberSoft },
  '31-60':  { fg: MC.amber, bg: MC.amberSoft },
  '+60':    { fg: MC.red,   bg: MC.redSoft },
}

// Los 6 buckets granulares que trae el ERP se consolidan en 3 (el criterio
// que se usa en toda la pantalla): el bucket más viejo con saldo > 0 manda.
function bucketDe(d: Deudor): Bucket {
  if ((d.deuda_entre_60_89_dias || 0) + (d.deuda_mas_90_dias || 0) > 0) return '+60'
  if ((d.deuda_entre_30_44_dias || 0) + (d.deuda_entre_45_59_dias || 0) > 0) return '31-60'
  if ((d.deuda_menor_14_dias || 0) + (d.deuda_entre_15_29_dias || 0) > 0) return '1-30'
  return 'al-dia'
}

// ── Carteras ─────────────────────────────────────────────────────────────────
// Para el admin, el universo del módulo son las 4 carteras de venta (Nicol,
// Marion, Marcelo, Yadro) más la de Claudio, que lleva sus propias cuentas
// —supermercados y distribuidoras— y también las cobra. Todo lo que el ERP
// aparca bajo un pseudo-vendedor — Incobrable/2024/2025, CERVECERÍA, Inactivo,
// Vendedor Muestras, OnLine, clientes sin vendedor — queda fuera: no es deuda
// que alguien esté cobrando y distorsiona el total.
const CARTERAS = VENDEDORES_CARTERA_COBRANZA as readonly string[]

function esCarteraDeVenta(d: Deudor): boolean {
  return grupoCarteraDe(d.vendedor) === 'vendedor'
}

interface FilaCartera {
  vendedor: string
  deudores: number
  clientes: number
  vencida: number
  saldo: number
}

/** Una fila por vendedor (siempre las 4, aunque alguna venga en cero) + total. */
function resumenCarteras(deudores: Deudor[], clientesPorVendedor: Record<string, number>) {
  const acc = new Map<string, FilaCartera>(
    CARTERAS.map(v => [v, { vendedor: v, deudores: 0, clientes: clientesPorVendedor[v] ?? 0, vencida: 0, saldo: 0 }]),
  )
  for (const d of deudores) {
    const fila = acc.get(vendedorCanonico(d.vendedor))
    if (!fila) continue
    fila.deudores++
    fila.vencida += d.deuda_comercial || 0
    fila.saldo += d.saldo_comercial || 0
  }
  const filas = [...acc.values()].sort((a, b) => b.vencida - a.vencida)
  const total = filas.reduce(
    (t, f) => ({
      deudores: t.deudores + f.deudores, clientes: t.clientes + f.clientes,
      vencida: t.vencida + f.vencida, saldo: t.saldo + f.saldo,
    }),
    { deudores: 0, clientes: 0, vencida: 0, saldo: 0 },
  )
  return { filas, total }
}

// Color de avatar puramente decorativo (no repite la lectura de riesgo del
// bucket, que ya la da el badge) — mismo espíritu que los avatares por
// iniciales de Clientes.
const AVATAR_PALETTE = [
  { bg: '#FEE2E2', fg: '#DC2626' }, { bg: '#FEF3C7', fg: '#D97706' },
  { bg: '#DBEAFE', fg: '#2563EB' }, { bg: '#D1FAE5', fg: '#059669' },
  { bg: '#EDE9FE', fg: '#7C3AED' }, { bg: '#FCE7F3', fg: '#DB2777' },
]
function avatarColorDe(nombre: string) {
  let hash = 0
  for (let i = 0; i < nombre.length; i++) hash = (hash * 31 + nombre.charCodeAt(i)) >>> 0
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length]
}

function fFecha(iso: string): string {
  const [y, m, d] = iso.split('T')[0].split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${parseInt(d)} ${meses[parseInt(m) - 1]} ${y}`
}

function csvEscape(v: string | number): string {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Días exactos de mora, mirando sólo la deuda comercial (la maquila no cuenta). */
function diasMoraDe(d: Deudor): number {
  return diasMoraDeudor({ ...d, deuda_vencida: d.deuda_comercial })
}

async function fetchDetalleDeudor(nombreFantasia: string): Promise<{ vencidos: DocumentoVencido[] } | null> {
  try {
    const res = await fetch(`/api/deudores/detalle?cliente=${encodeURIComponent(nombreFantasia)}`)
    if (!res.ok) return null
    const json = await res.json()
    return json.detalle ?? null
  } catch {
    return null
  }
}

/**
 * Informe de deuda por factura — una fila por documento vencido, no una por
 * cliente (pedido de Claudio, 2026-09-16: el informe anterior sólo daba el
 * total del cliente y no servía para trabajar la cobranza factura a factura).
 * Pide el detalle de cada cliente al mismo endpoint que usa PanelCobranza
 * (no viene precargado: son ~170 deudores y traer sus ventas de entrada
 * pesaría varios MB). Cuando el ERP tiene deuda vencida que ninguna factura
 * reconstruida explica, se agrega una fila "Sin factura identificada" con el
 * resto, para que la suma de filas de cada cliente siempre calce con la
 * "Deuda Vencida" que se ve en pantalla.
 */
async function exportarPorFactura(deudores: Deudor[], onProgress: (hecho: number, total: number) => void) {
  const headers = [
    'Cliente', 'Localidad', 'Vendedor', 'N° Factura', 'Pedido',
    'Fecha Emisión', 'Fecha Vencimiento', 'Días Vencida', 'Tramo', 'Monto',
    'Saldo Total Cliente', 'Barriles Adeudados', 'Último Pago',
  ]
  const filas: (string | number)[][] = []

  const CONCURRENCIA = 6
  let hecho = 0
  for (let i = 0; i < deudores.length; i += CONCURRENCIA) {
    const lote = deudores.slice(i, i + CONCURRENCIA)
    const resultados = await Promise.all(lote.map(async d => ({ d, detalle: await fetchDetalleDeudor(d.nombre_fantasia) })))
    for (const { d, detalle } of resultados) {
      const vendedor = vendedorCanonico(d.vendedor) || ''
      const ultimoPago = d.ultimo_pago ? fFecha(d.ultimo_pago) : ''
      // La maquila no es deuda del área comercial (ver conDeudaComercial) —
      // se descarta acá también para que el informe hable de la misma plata.
      const docs = (detalle?.vencidos ?? []).filter(doc => !doc.esMaquila)

      // Redondeado a pesos enteros — igual que formatCurrency() en toda la
      // pantalla. Sin esto, el resto de decimales de punto flotante que
      // arrastra el cálculo de litros*precio (ej. 1886397.4850000899) se
      // escribe tal cual en el CSV, y Excel en configuración regional
      // chilena (coma decimal) lee el "." como si no existiera, convirtiendo
      // "1886397.4850000899" en 18.863.974.850.000.899 — un número
      // astronómico que no tiene nada que ver con la factura real.
      for (const doc of docs) {
        filas.push([
          d.nombre_fantasia, d.localidad ?? '', vendedor,
          doc.numeroFactura ?? '', doc.pedido ?? '',
          fFecha(doc.fechaEmision), fFecha(doc.fechaVencimiento),
          doc.diasMora, doc.tramoLabel, Math.round(doc.monto),
          d.saldo_comercial, d.barriles_adeudados, ultimoPago,
        ])
      }

      const identificado = docs.reduce((s, doc) => s + Math.round(doc.monto), 0)
      const resto = Math.round(d.deuda_comercial - identificado)
      if (resto > 1) {
        filas.push([
          d.nombre_fantasia, d.localidad ?? '', vendedor,
          '', '', '', '', diasMoraDe(d), 'Sin factura identificada', resto,
          d.saldo_comercial, d.barriles_adeudados, ultimoPago,
        ])
      }
    }
    hecho += lote.length
    onProgress(hecho, deudores.length)
  }

  const csv = [headers, ...filas].map(fila => fila.map(csvEscape).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `deudores-facturas-${new Date().toISOString().split('T')[0]}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── Resumen por vendedor (admin) ─────────────────────────────────────────────
// Es a la vez el desglose y el filtro: tocar una fila filtra la lista de abajo.
// Un panel de filtro aparte sería un segundo control para lo mismo.
function FilaCarteraRow({ nombre, deudores, clientes, vencida, seleccionado, onClick, destacado }: {
  nombre: string; deudores: number; clientes: number; vencida: number
  seleccionado: boolean; onClick: () => void; destacado?: boolean
}) {
  const avatar = avatarColorDe(nombre)
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', minHeight: 46,
        padding: '9px 14px 9px 11px', textAlign: 'left', cursor: 'pointer', font: 'inherit',
        background: seleccionado ? MC.blueSoft : 'transparent',
        border: 'none', borderTop: `1px solid ${MC.border}`,
        borderLeft: `3px solid ${seleccionado ? MC.blue : 'transparent'}`,
      }}
    >
      {destacado ? (
        <div style={{
          width: 30, height: 30, borderRadius: 9, flexShrink: 0, background: MC.blueSoft,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Users size={15} color={MC.blue} />
        </div>
      ) : (
        <div style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: avatar.bg, color: avatar.fg, fontSize: 13, fontWeight: 800,
        }}>
          {nombre[0]?.toUpperCase()}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13.5, fontWeight: destacado ? 800 : 700,
          color: seleccionado ? MC.blue : MC.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {nombre}
        </p>
        <p style={{ fontSize: 11, color: MC.muted, marginTop: 1 }}>
          {deudores} deudor{deudores === 1 ? '' : 'es'}{clientes > 0 ? ` de ${clientes}` : ''}
        </p>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 800, color: vencida > 0 ? MC.red : MC.green }}>
          {formatCurrency(vencida)}
        </p>
        <p style={{ fontSize: 9.5, color: MC.faint, fontWeight: 700, letterSpacing: '0.04em' }}>VENCIDA</p>
      </div>
    </button>
  )
}

function ResumenCarteras({ filas, total, activo, onSelect }: {
  filas: FilaCartera[]
  total: { deudores: number; clientes: number; vencida: number; saldo: number }
  activo: string
  onSelect: (v: string) => void
}) {
  return (
    <div style={{
      background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`,
      overflow: 'hidden', marginBottom: 12,
    }}>
      <p style={{
        fontSize: 10, fontWeight: 800, color: MC.faint, letterSpacing: '0.06em',
        padding: '11px 14px 8px',
      }}>
        POR VENDEDOR
      </p>
      <FilaCarteraRow
        nombre="Todos los vendedores" destacado
        deudores={total.deudores} clientes={total.clientes} vencida={total.vencida}
        seleccionado={activo === 'todos'} onClick={() => onSelect('todos')}
      />
      {filas.map(f => (
        <FilaCarteraRow
          key={f.vendedor}
          nombre={nombreCorto(f.vendedor)}
          deudores={f.deudores} clientes={f.clientes} vencida={f.vencida}
          seleccionado={activo === f.vendedor} onClick={() => onSelect(f.vendedor)}
        />
      ))}
    </div>
  )
}

// ── Tarjeta compacta (móvil) ───────────────────────────────────────────────────
function DeudorCard({ d, abierto, onToggle, onWA }: {
  d: Deudor; abierto: boolean; onToggle: () => void; onWA: (t: WATarget) => void
}) {
  const bucket = bucketDe(d)
  const avatar = avatarColorDe(d.nombre_fantasia)
  const bucketColor = BUCKET_COLOR[bucket]

  // Estimado rápido (external_fecha + dias_pago), calculado de la propia fila
  // para poder mostrarlo en la lista sin desplegar nada ni pedir datos al
  // servidor. Una vez desplegada la tarjeta y llegado el detalle real
  // (fecha_pedido + dias_pago, la fecha en que la venta entró a nuestro
  // sistema), ese manda — mismo criterio que ya usaba el mensaje de WhatsApp.
  const diasMoraEstimado = diasMoraDe(d)

  // El detalle por factura llega cuando se despliega la tarjeta; el mensaje de
  // WhatsApp lo usa si ya está, y si no igual sale con días y monto.
  const [cobranza, setCobranza] = useState<DatosCobranza | null>(null)
  const diasMora = cobranza?.detalle.diasMoraMaxima ?? diasMoraEstimado

  const waTarget: WATarget = {
    nombre: d.nombre_fantasia, telefono: d.telefono,
    contexto: 'cobranza', alertTipo: 'cobranza',
    subtitulo: d.localidad ?? undefined,
    contacto: cobranza?.contacto?.contacto ?? null,
    diasVencida: diasMora,
    // Se le cobra la deuda comercial, no la maquila.
    montoVencido: d.deuda_comercial,
    documentos: cobranza ? documentosParaWA(cobranza.detalle) : undefined,
  }

  return (
    <div style={{
      background: MC.card, borderRadius: 16, marginBottom: 10,
      border: `1px solid ${MC.border}`, boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      overflow: 'hidden',
    }}>
      <button onClick={onToggle} style={{
        display: 'block', width: '100%', textAlign: 'left', background: 'transparent',
        border: 'none', cursor: 'pointer', padding: '12px 14px', font: 'inherit',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: '50%', flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: avatar.bg, color: avatar.fg, fontSize: 15, fontWeight: 800,
          }}>
            {d.nombre_fantasia[0]?.toUpperCase() ?? '?'}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: MC.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.nombre_fantasia}
            </p>
            <p style={{ fontSize: 11.5, color: MC.muted, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.localidad ?? '—'}{d.vendedor ? ` · ${nombreCorto(vendedorCanonico(d.vendedor))}` : ''}
            </p>
          </div>
          {/* Días exactos, no el rango: "153 días" le sirve al vendedor para
              cobrar; "+60 días" no le dice nada por teléfono. */}
          {diasMora > 0 && (
            <span style={{ fontSize: 10.5, fontWeight: 800, padding: '4px 9px', borderRadius: 20, flexShrink: 0, color: bucketColor.fg, background: bucketColor.bg, whiteSpace: 'nowrap' }}>
              {diasMora} {diasMora === 1 ? 'día' : 'días'}
            </span>
          )}
          <ChevronRight size={16} color={MC.faint} style={{ flexShrink: 0, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 10 }}>
          <div>
            <p style={{ fontSize: 9, color: MC.muted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 }}>DEUDA VENCIDA</p>
            <p style={{ fontSize: 17, fontWeight: 800, color: d.deuda_comercial > 0 ? bucketColor.fg : MC.green }}>
              {formatCurrency(d.deuda_comercial)}
            </p>
            {/* La maquila se nombra, pero fuera del número: si no, el vendedor
                cree que tiene que cobrar plata que no le corresponde. */}
            {d.maquila_vencida > 0 && (
              <p style={{ fontSize: 10, color: MC.faint, marginTop: 2 }}>
                + {formatCurrency(Math.round(d.maquila_vencida))} de maquila
              </p>
            )}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 9, color: MC.muted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 }}>SALDO TOTAL</p>
            <p style={{ fontSize: 13, fontWeight: 700, color: MC.text }}>{formatCurrency(d.saldo_comercial)}</p>
          </div>
        </div>
      </button>

      {abierto && (
        <div style={{ borderTop: `1px solid ${MC.border}`, padding: '12px 14px' }}>
          {/* Mora exacta + contacto + facturas vencidas con su detalle */}
          <PanelCobranza cliente={d.nombre_fantasia} tema="claro" onDatos={setCobranza} />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
            <div>
              <p style={{ fontSize: 9, color: MC.muted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 }}>ÚLTIMO PAGO</p>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: MC.text }}>{d.ultimo_pago ? fFecha(d.ultimo_pago) : '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 9, color: MC.muted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 }}>BARRILES ADEUDADOS</p>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: d.barriles_adeudados > 0 ? MC.text : MC.faint }}>{d.barriles_adeudados || '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 9, color: MC.muted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 }}>TELÉFONO</p>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: MC.text }}>{d.telefono ?? '—'}</p>
            </div>
            <div>
              <p style={{ fontSize: 9, color: MC.muted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 2 }}>DÍAS DE PAGO</p>
              <p style={{ fontSize: 12.5, fontWeight: 600, color: MC.text }}>{d.dias_pago ? `${d.dias_pago} días` : '—'}</p>
            </div>
          </div>

          <p style={{ fontSize: 9, color: MC.muted, fontWeight: 700, letterSpacing: '0.04em', marginBottom: 6 }}>TRAMOS DE ANTIGÜEDAD (ERP)</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
            {[
              { label: '0–14 días', value: d.deuda_menor_14_dias },
              { label: '15–29 días', value: d.deuda_entre_15_29_dias },
              { label: '30–44 días', value: d.deuda_entre_30_44_dias },
              { label: '45–59 días', value: d.deuda_entre_45_59_dias },
              { label: '60–89 días', value: d.deuda_entre_60_89_dias },
              { label: '+90 días', value: d.deuda_mas_90_dias },
            ].filter(b => (b.value || 0) > 0).map(b => (
              <div key={b.label} style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: MC.muted }}>{b.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: MC.red }}>{formatCurrency(b.value || 0)}</span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 7 }}>
            <button onClick={e => { e.stopPropagation(); onWA(waTarget) }}
              style={{ flex: 1, minHeight: 38, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                background: MC.greenSoft, border: `1px solid rgba(5,150,105,0.25)`,
                borderRadius: 10, color: MC.whatsapp, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <MessageCircle size={14} /> Cobrar por WhatsApp
            </button>
            {d.telefono && (
              <a href={`tel:${d.telefono}`} onClick={e => e.stopPropagation()}
                style={{ minHeight: 38, width: 38, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: MC.blueSoft, border: `1px solid rgba(37,99,235,0.25)`,
                  borderRadius: 10, color: MC.blue, flexShrink: 0 }}>
                <Phone size={15} />
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Saldo no vencido ─────────────────────────────────────────────────────────
// El ERP separa saldo_total en deuda_vencida (lo que ya se pasó de plazo) y el
// resto: plata que el cliente debe pero cuyo plazo de pago todavía no se cumple
// (pedidos recientes dentro de sus días de pago). "Deuda vencida" no lo muestra
// en ningún lado — este panel es la vista al resto de la cuenta corriente, con
// el detalle de qué cliente la tiene. Se calcula sobre deuda_vencida cruda del
// ERP (no deuda_comercial): saldo_total tampoco distingue maquila, así que
// restarle la comercial dejaría la maquila vencida metida en el "no vencido".
function saldoNoVencidoDe(d: Pick<Deudor, 'saldo_total' | 'deuda_vencida'>): number {
  return Math.max(0, (d.saldo_total || 0) - (d.deuda_vencida || 0))
}

const PALETA_SNV = {
  claro: {
    overlay: 'rgba(15,23,42,0.55)', card: '#FFFFFF', sub: '#F8FAFC', text: '#0F172A',
    muted: '#64748B', faint: '#94A3B8', border: '#E2E8F0', accent: '#2563EB', accentSoft: '#EFF6FF',
  },
  oscuro: {
    overlay: 'rgba(0,0,0,0.6)', card: '#141414', sub: 'rgba(255,255,255,0.04)', text: 'var(--cream)',
    muted: 'var(--muted)', faint: '#6B7280', border: 'var(--border)', accent: 'var(--gold)', accentSoft: 'rgba(212,175,55,0.1)',
  },
} as const

/**
 * Una fila de "saldo no vencido", expandible. El monto agregado ya está
 * cargado (viene de `deudores`), pero el detalle por documento —qué produjo
 * ese saldo, con qué pedido y factura, y cuántos días faltan para que venza—
 * no: se pide bajo demanda con el mismo endpoint que usa PanelCobranza, para
 * no traer las líneas de venta de los ~170 deudores en la carga inicial.
 */
function FilaSaldoNoVencido({ d, monto, isAdmin, p, tema }: {
  d: Deudor; monto: number; isAdmin: boolean; p: (typeof PALETA_SNV)[keyof typeof PALETA_SNV]; tema: 'claro' | 'oscuro'
}) {
  const [abierto, setAbierto] = useState(false)
  const [detalle, setDetalle] = useState<DatosCobranza['detalle'] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pDoc = tema === 'oscuro' ? PALETA_DOC_OSCURO : PALETA_DOC_CLARO

  const toggle = () => {
    setAbierto(v => !v)
    if (!detalle && !cargando) {
      setCargando(true)
      setError(null)
      fetch(`/api/deudores/detalle?cliente=${encodeURIComponent(d.nombre_fantasia)}`)
        .then(r => r.json().then(j => ({ ok: r.ok, j })))
        .then(({ ok, j }) => {
          if (!ok) throw new Error(j.error ?? 'No se pudo cargar el detalle')
          setDetalle(j.detalle)
        })
        .catch(e => setError(e instanceof Error ? e.message : 'No se pudo cargar el detalle'))
        .finally(() => setCargando(false))
    }
  }

  return (
    // flexShrink:0 es necesario a propósito: el contenedor de la lista es un
    // flex column con overflowY:auto, y esta tarjeta tiene overflow:hidden
    // (para recortar bien las esquinas redondeadas del detalle desplegable).
    // Un elemento con overflow != visible tiene alto mínimo automático 0 en
    // flexbox — sin flexShrink:0, el navegador aplasta las 60 filas para que
    // "quepan" en el alto visible del modal en vez de dejar que haga scroll
    // (cada fila terminaba en ~1.6px de alto, con el texto recortado a nada).
    <div style={{ background: p.sub, border: `1px solid ${p.border}`, borderRadius: 12, overflow: 'hidden', flexShrink: 0 }}>
      <button onClick={toggle} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '10px 12px', background: 'transparent', border: 'none', cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13.5, fontWeight: 700, color: p.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {d.nombre_fantasia}
          </p>
          <p style={{ fontSize: 11, color: p.muted, marginTop: 1 }}>
            {[d.localidad, isAdmin && d.vendedor ? nombreCorto(vendedorCanonico(d.vendedor)) : null].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <p style={{ fontSize: 14, fontWeight: 800, color: p.accent }}>{formatCurrency(monto)}</p>
          <p style={{ fontSize: 10, color: p.faint, marginTop: 1 }}>de {formatCurrency(d.saldo_comercial)} saldo total</p>
        </div>
        <ChevronRight size={15} color={p.faint}
          style={{ flexShrink: 0, transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {abierto && (
        <div style={{ borderTop: `1px solid ${p.border}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {cargando && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', color: p.muted, fontSize: 12 }}>
              <Loader2 size={14} className="animate-spin" /> Cargando detalle…
            </div>
          )}
          {error && <p style={{ fontSize: 12, color: '#DC2626' }}>{error}</p>}
          {detalle && detalle.porVencer.length === 0 && !cargando && (
            <p style={{ fontSize: 12, color: p.muted }}>Sin documentos identificados para este saldo.</p>
          )}
          {detalle && detalle.porVencer.map(doc => (
            <FilaDocumento key={doc.pedido} d={doc} p={pDoc} porVencer />
          ))}
        </div>
      )}
    </div>
  )
}

function SaldoNoVencidoModal({ deudores, isAdmin, tema, onClose }: {
  deudores: Deudor[]; isAdmin: boolean; tema: 'claro' | 'oscuro'; onClose: () => void
}) {
  const p = PALETA_SNV[tema]

  const filas = useMemo(() => {
    return deudores
      .map(d => ({ d, monto: saldoNoVencidoDe(d) }))
      .filter(f => f.monto > 0)
      .sort((a, b) => b.monto - a.monto)
  }, [deudores])

  const total = filas.reduce((s, f) => s + f.monto, 0)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: p.overlay, zIndex: 9999,
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: p.card, borderRadius: '20px 20px 0 0', width: '100%', maxWidth: 520,
        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div style={{ padding: '18px 20px 14px', borderBottom: `1px solid ${p.border}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 9.5, color: p.muted, fontWeight: 700, letterSpacing: '0.06em' }}>SALDO NO VENCIDO</p>
              <p style={{ fontSize: 24, fontWeight: 900, color: p.text, letterSpacing: '-0.5px', marginTop: 2 }}>
                {formatCurrency(total)}
              </p>
              <p style={{ fontSize: 12, color: p.muted, marginTop: 3 }}>
                {filas.length} cliente{filas.length === 1 ? '' : 's'} con saldo dentro de su plazo de pago
              </p>
            </div>
            <button onClick={onClose} aria-label="Cerrar"
              style={{ background: p.sub, border: `1px solid ${p.border}`, borderRadius: '50%',
                width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', color: p.muted, flexShrink: 0 }}>
              <X size={16} />
            </button>
          </div>
          <p style={{ fontSize: 11, color: p.faint, marginTop: 10, lineHeight: 1.45 }}>
            Es plata que estos clientes deben pero cuyo plazo de pago todavía no se cumple — no hay que cobrarla
            todavía, sólo tenerla presente. Toca un cliente para ver qué pedido la generó, cuántos días faltan
            para que venza y su N° de factura.
          </p>
        </div>

        <div style={{ overflowY: 'auto', padding: '10px 20px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filas.length === 0 ? (
            <p style={{ fontSize: 13, color: p.muted, textAlign: 'center', padding: '24px 0' }}>
              Ningún cliente tiene saldo no vencido en este filtro.
            </p>
          ) : (
            filas.map(({ d, monto }) => (
              <FilaSaldoNoVencido key={d.id} d={d} monto={monto} isAdmin={isAdmin} p={p} tema={tema} />
            ))
          )}
        </div>
      </div>
    </div>
  )
}

export default function DeudoresVendedorClient({ initialDeudores, isAdmin, clientesPorVendedor, totalClientesPropios, maquilaPorCliente }: Props) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { user } = useUser()
  const [showSettings, setShowSettings] = useState(false)
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
  const [showSaldoNoVencido, setShowSaldoNoVencido] = useState(false)

  // 'todos' = las 4 carteras sumadas; o el nombre canónico de un vendedor.
  const [cartera, setCartera] = useState<string>('todos')
  const [filterBucket, setFilterBucket] = useState<Bucket | 'todos'>('todos')
  const [searchText, setSearchText] = useState('')
  const [sortBy, setSortBy] = useState<'deuda' | 'nombre' | 'antigua'>('deuda')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [exportando, setExportando] = useState<{ hecho: number; total: number } | null>(null)

  const deudores = useMemo(
    () => conDeudaComercial(initialDeudores, maquilaPorCliente),
    [initialDeudores, maquilaPorCliente],
  )

  // Universo del módulo. Para el vendedor su cartera ya viene acotada por la
  // query del server; para el admin, las carteras de cobranza.
  const universo = useMemo(
    () => (isAdmin ? deudores.filter(esCarteraDeVenta) : deudores),
    [deudores, isAdmin],
  )

  const { filas, total } = useMemo(
    () => resumenCarteras(universo, clientesPorVendedor),
    [universo, clientesPorVendedor],
  )

  // Base de KPIs y contadores de chips: manda el filtro por vendedor, no el de
  // antigüedad (si no, cada chip se contaría a sí mismo y marcaría el total).
  const base = useMemo(
    () => (isAdmin && cartera !== 'todos' ? universo.filter(d => vendedorCanonico(d.vendedor) === cartera) : universo),
    [universo, isAdmin, cartera],
  )

  const clientesBase = isAdmin
    ? (cartera === 'todos' ? total.clientes : (clientesPorVendedor[cartera] ?? 0))
    : totalClientesPropios

  // "Total deudores" mezcla dos cosas distintas: clientes con plata YA vencida
  // (hay que cobrarla) y clientes que sólo tienen saldo dentro de su plazo de
  // pago (no vencido — no hay apuro). El desglose evita que el número solo
  // parezca "132 clientes que me deben" cuando en realidad una parte grande
  // todavía ni vence.
  const conVencida = base.filter(d => d.deuda_comercial > 0).length
  // saldo_comercial (no saldo_total crudo): saldo_total incluye la maquila y
  // deuda_comercial ya no, así que restar una de la otra directamente daba un
  // "no vencida" o un total que no calzaban con lo que se ve en pantalla.
  const kpisSaldo = base.reduce((s, d) => s + (d.saldo_comercial || 0), 0)
  const kpisVencida = base.reduce((s, d) => s + (d.deuda_comercial || 0), 0)
  const kpis = {
    total: base.length,
    conVencida,
    soloNoVencida: base.length - conVencida,
    saldo: kpisSaldo,
    vencida: kpisVencida,
    /** Misma cuenta que el modal de detalle (saldoNoVencidoDe, por cliente,
        sobre deuda_vencida cruda del ERP) — no saldo - deuda_comercial, que
        da un número distinto porque deuda_comercial ya descuenta la maquila.
        Calculado así, la tarjeta y el modal jamás pueden mostrar cifras
        distintas para lo mismo. */
    noVencida: base.reduce((s, d) => s + saldoNoVencidoDe(d), 0),
  }

  const bucketCounts = useMemo(() => {
    const counts: Record<Bucket, number> = { 'al-dia': 0, '1-30': 0, '31-60': 0, '+60': 0 }
    for (const d of base) counts[bucketDe(d)]++
    return counts
  }, [base])

  const filtrados = useMemo(() => {
    let res = base.filter(d => {
      if (filterBucket !== 'todos' && bucketDe(d) !== filterBucket) return false
      if (searchText && !d.nombre_fantasia.toLowerCase().includes(searchText.toLowerCase())) return false
      return true
    })
    const rangoBucket: Record<Bucket, number> = { '+60': 3, '31-60': 2, '1-30': 1, 'al-dia': 0 }
    res = [...res].sort((a, b) => {
      switch (sortBy) {
        case 'nombre':  return a.nombre_fantasia.localeCompare(b.nombre_fantasia)
        case 'antigua': return rangoBucket[bucketDe(b)] - rangoBucket[bucketDe(a)] || b.deuda_comercial - a.deuda_comercial
        default:        return b.deuda_comercial - a.deuda_comercial
      }
    })
    return res
  }, [base, filterBucket, searchText, sortBy])

  // "Quitar filtros": vuelve a la vista con que se entra a la pantalla.
  const hayFiltros = cartera !== 'todos' || filterBucket !== 'todos' || searchText !== '' || sortBy !== 'deuda'
  const limpiarFiltros = () => {
    setCartera('todos'); setFilterBucket('todos'); setSearchText(''); setSortBy('deuda')
  }

  const selectStyle: React.CSSProperties = {
    padding: '9px 30px 9px 12px', borderRadius: 10, border: `1px solid ${MC.border}`,
    background: MC.card, color: MC.text, fontSize: 12.5, fontWeight: 600, outline: 'none',
    appearance: 'none',
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748B\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center',
  }

  if (isDesktop) {
    return <DeudoresTablaDesktop deudores={deudores} isAdmin={isAdmin} clientesPorVendedor={clientesPorVendedor} />
  }

  const subtitulo = !isAdmin
    ? 'Deuda de tus clientes asignados.'
    : cartera === 'todos'
      ? 'Suma de las carteras de los 4 vendedores.'
      : `Cartera de ${nombreCorto(cartera)}.`

  return (
    <div style={{ minHeight: '100vh', background: MC.bg, paddingBottom: 'max(120px, calc(env(safe-area-inset-bottom, 0px) + 100px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/ventas')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: MC.card, border: `1px solid ${MC.border}`,
            borderRadius: 100, padding: '7px 14px 7px 10px', marginBottom: 14,
            color: MC.text, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 36,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={MC.blue} />
          Volver
        </button>

        {/* Campana + avatar en la misma fila del título, alineados arriba a la
            derecha — mismo patrón que AppHeader y Rentabilidad. No hay botón
            ancho acá (a diferencia de Stock) así que no hay riesgo de aplaste. */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: MC.text, letterSpacing: '-0.5px' }}>Deudores</h1>
            <p style={{ fontSize: 12.5, color: MC.faint, marginTop: 2 }}>{subtitulo}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
            <NotificationsBell inline variant="light" />
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Cuenta"
              style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${MC.border}`, background: MC.text, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 }}
            >
              {user?.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.avatarUrl} alt={user.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (user?.iniciales || '··')}
            </button>
          </div>
        </div>

        {/* KPI cards — siguen el filtro por vendedor: si estás viendo una
            cartera, el número de arriba es el de esa cartera. */}
        <div style={{ background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`, padding: 16, marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: MC.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Users size={15} color={MC.blue} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: MC.muted }}>Total deudores</span>
          </div>
          <p style={{ fontSize: 22, fontWeight: 800, color: MC.text, letterSpacing: '-0.5px' }}>
            {kpis.total}
            {clientesBase > 0 && (
              <span style={{ fontSize: 12, fontWeight: 500, color: MC.faint }}>
                {' '}de {clientesBase} clientes ({Math.round((kpis.total / clientesBase) * 100)}%)
              </span>
            )}
          </p>
          {/* "Deudor" acá no siempre significa "hay que cobrarle": la mitad
              suele ser plata que todavía no vence. */}
          <p style={{ fontSize: 11, color: MC.faint, marginTop: 3 }}>
            {kpis.conVencida} con deuda vencida
            {kpis.soloNoVencida > 0 && ` · ${kpis.soloNoVencida} solo dentro de plazo`}
          </p>
        </div>

        {/* Desglose de plata: vencida / no vencida / total con el mismo peso
            visual — antes solo la vencida era grande y roja, el resto vivía
            en un link chico y azul que subestimaba montos igual de relevantes
            para Claudio. Todo el bloque abre el detalle de saldo no vencido. */}
        <div style={{ background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`, padding: 16, marginBottom: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ width: 30, height: 30, borderRadius: 9, background: MC.redSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Coins size={15} color={MC.red} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: MC.muted }}>Deuda vencida</span>
          </div>
          {/* nowrap: globals.css pone overflow-wrap:anywhere a todo en
              mobile y sin esto un monto largo se parte a mitad del número. */}
          <p style={{ fontSize: 26, fontWeight: 800, color: MC.red, letterSpacing: '-0.5px', whiteSpace: 'nowrap', marginBottom: 14 }}>
            {formatCurrency(kpis.vencida)}
          </p>
          <button onClick={() => setShowSaldoNoVencido(true)}
            style={{ display: 'flex', width: '100%', gap: 16, padding: 0,
              background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
            <div style={{ flex: 1, borderTop: `1px solid ${MC.border}`, paddingTop: 10 }}>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: MC.faint, letterSpacing: '0.05em', marginBottom: 3 }}>NO VENCIDA</p>
              <p style={{ fontSize: 18, fontWeight: 800, color: MC.amber, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>{formatCurrency(kpis.noVencida)}</p>
            </div>
            <div style={{ flex: 1, borderTop: `1px solid ${MC.border}`, paddingTop: 10 }}>
              <p style={{ fontSize: 9.5, fontWeight: 700, color: MC.faint, letterSpacing: '0.05em', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 3 }}>
                SALDO TOTAL <ChevronRight size={11} />
              </p>
              <p style={{ fontSize: 18, fontWeight: 800, color: MC.text, letterSpacing: '-0.3px', whiteSpace: 'nowrap' }}>{formatCurrency(kpis.saldo)}</p>
            </div>
          </button>
        </div>

        {/* Desglose + filtro por vendedor (sólo admin) */}
        {isAdmin && <ResumenCarteras filas={filas} total={total} activo={cartera} onSelect={v => setCartera(c => (c === v ? 'todos' : v))} />}

        {/* Chips de rango de días */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4, marginBottom: 12 }}>
          {([
            { key: 'todos' as const, label: 'Todos', count: base.length, color: MC.blue },
            { key: '1-30' as const, label: '1–30 días', count: bucketCounts['1-30'], color: MC.amber },
            { key: '31-60' as const, label: '31–60 días', count: bucketCounts['31-60'], color: MC.amber },
            { key: '+60' as const, label: '+60 días', count: bucketCounts['+60'], color: MC.red },
          ]).map(f => {
            const active = filterBucket === f.key
            return (
              <button key={f.key} onClick={() => setFilterBucket(f.key)}
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 12,
                  cursor: 'pointer', border: `1px solid ${active ? f.color : MC.border}`,
                  background: active ? f.color : MC.card, color: active ? '#FFFFFF' : MC.text,
                  fontSize: 13, fontWeight: active ? 800 : 600 }}>
                {f.label}
                <span style={{ fontSize: 12, fontWeight: 800, padding: '0 6px', borderRadius: 8,
                  background: active ? 'rgba(255,255,255,0.25)' : 'rgba(15,23,42,0.06)',
                  color: active ? '#FFFFFF' : MC.muted }}>
                  {f.count}
                </span>
              </button>
            )
          })}
        </div>

        {/* Buscador */}
        <div style={{ position: 'relative', marginBottom: 10 }}>
          <Search size={15} color={MC.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Buscar cliente…"
            style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: 12, border: `1px solid ${MC.border}`, background: MC.card, fontSize: 13, color: MC.text, outline: 'none' }}
          />
          {searchText && <button onClick={() => setSearchText('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: MC.faint }}><X size={14} /></button>}
        </div>

        {/* Ordenar */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)} style={selectStyle}>
            <option value="deuda">Deuda (mayor a menor)</option>
            <option value="antigua">Más antigua primero</option>
            <option value="nombre">Nombre (A–Z)</option>
          </select>
        </div>

        {/* Contador + exportar */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: MC.text }}>{filtrados.length} cliente{filtrados.length === 1 ? '' : 's'}</p>
            {hayFiltros && (
              <button onClick={limpiarFiltros}
                style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 32, padding: '0 10px', borderRadius: 10,
                  border: `1px solid ${MC.border}`, background: MC.card, color: MC.blue, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <X size={13} /> Quitar filtros
              </button>
            )}
          </div>
          {filtrados.length > 0 && (
            <button
              disabled={!!exportando}
              onClick={async () => {
                setExportando({ hecho: 0, total: filtrados.length })
                try {
                  await exportarPorFactura(filtrados, (hecho, total) => setExportando({ hecho, total }))
                } finally {
                  setExportando(null)
                }
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none',
                cursor: exportando ? 'default' : 'pointer', color: MC.blue, fontSize: 12.5, fontWeight: 700 }}>
              {exportando
                ? <><Loader2 size={14} className="animate-spin" /> Generando {exportando.hecho}/{exportando.total}…</>
                : <><FileDown size={14} /> Exportar por factura</>}
            </button>
          )}
        </div>

        {/* Lista */}
        {filtrados.length === 0 ? (
          <div style={{ background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`, padding: '40px 20px', textAlign: 'center' }}>
            <Wallet size={32} color={MC.faint} style={{ margin: '0 auto 10px' }} />
            <p style={{ fontSize: 13, color: MC.muted }}>
              {universo.length === 0
                ? (isAdmin ? 'Todavía no hay deudores cargados.' : 'Ninguno de tus clientes tiene deuda registrada.')
                : 'Sin resultados para este filtro'}
            </p>
          </div>
        ) : (
          filtrados.map(d => (
            <DeudorCard key={d.id} d={d} abierto={expandedRow === d.id} onToggle={() => setExpandedRow(expandedRow === d.id ? null : d.id)} onWA={setWaTarget} />
          ))
        )}

        {isAdmin && (
          <p style={{ fontSize: 11, color: MC.faint, textAlign: 'center', marginTop: 14, lineHeight: 1.5 }}>
            Sólo carteras de venta. No incluye incobrables, CERVECERÍA ni cuentas internas.
          </p>
        )}
      </div>

      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} userName={user?.nombre ?? ''} userEmail={user?.email ?? ''} avatarUrl={user?.avatarUrl ?? undefined} />
      )}
      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
      {showSaldoNoVencido && (
        <SaldoNoVencidoModal deudores={base} isAdmin={isAdmin} tema="claro" onClose={() => setShowSaldoNoVencido(false)} />
      )}
    </div>
  )
}

// ── Tabla de escritorio (tema claro, columnas ordenables) ────────────────────
// ── Orden de la tabla desktop ────────────────────────────────────────────────
// Cada columna se ordena con un clic en su encabezado (el segundo clic invierte
// el sentido) o desde el selector "Ordenar por" del panel de filtros; los dos
// comparten el mismo estado. Las columnas de montos y días parten de mayor a
// menor, las de texto de la A a la Z.
type ColOrden = 'cliente' | 'vendedor' | 'deuda' | 'dias' | 'saldo' | 'barriles' | 'pago'
type DirOrden = 'asc' | 'desc'

const DIR_INICIAL: Record<ColOrden, DirOrden> = {
  cliente: 'asc', vendedor: 'asc', deuda: 'desc', dias: 'desc', saldo: 'desc', barriles: 'desc', pago: 'desc',
}

const OPCIONES_ORDEN: { col: ColOrden; dir: DirOrden; label: string; soloAdmin?: boolean }[] = [
  { col: 'deuda',    dir: 'desc', label: 'Deuda vencida: mayor a menor' },
  { col: 'deuda',    dir: 'asc',  label: 'Deuda vencida: menor a mayor' },
  { col: 'dias',     dir: 'desc', label: 'Días vencida: más a menos' },
  { col: 'dias',     dir: 'asc',  label: 'Días vencida: menos a más' },
  { col: 'saldo',    dir: 'desc', label: 'Saldo total: mayor a menor' },
  { col: 'saldo',    dir: 'asc',  label: 'Saldo total: menor a mayor' },
  { col: 'barriles', dir: 'desc', label: 'Barriles: más a menos' },
  { col: 'barriles', dir: 'asc',  label: 'Barriles: menos a más' },
  { col: 'pago',     dir: 'asc',  label: 'Último pago: más antiguo primero' },
  { col: 'pago',     dir: 'desc', label: 'Último pago: más reciente primero' },
  { col: 'cliente',  dir: 'asc',  label: 'Cliente: A → Z' },
  { col: 'cliente',  dir: 'desc', label: 'Cliente: Z → A' },
  { col: 'vendedor', dir: 'asc',  label: 'Vendedor: A → Z', soloAdmin: true },
  { col: 'vendedor', dir: 'desc', label: 'Vendedor: Z → A', soloAdmin: true },
]

function valorOrden(d: Deudor, col: ColOrden): number | string | null {
  switch (col) {
    case 'cliente':  return d.nombre_fantasia.toLowerCase()
    case 'vendedor': return (vendedorCanonico(d.vendedor) || '').toLowerCase()
    case 'deuda':    return d.deuda_comercial || 0
    case 'dias':     return diasMoraDe(d)
    case 'saldo':    return d.saldo_comercial || 0
    case 'barriles': return d.barriles_adeudados || 0
    case 'pago':     return d.ultimo_pago ? new Date(d.ultimo_pago).getTime() : null
  }
}

function ordenarDeudores(lista: Deudor[], col: ColOrden, dir: DirOrden): Deudor[] {
  const signo = dir === 'asc' ? 1 : -1
  return [...lista].sort((a, b) => {
    const va = valorOrden(a, col)
    const vb = valorOrden(b, col)
    // Sin fecha de pago: siempre al final, sin importar el sentido.
    if (va === null && vb === null) return 0
    if (va === null) return 1
    if (vb === null) return -1
    const cmp = typeof va === 'string' && typeof vb === 'string'
      ? va.localeCompare(vb, 'es')
      : (va as number) - (vb as number)
    // Empate: desempata por deuda vencida, de mayor a menor.
    return cmp !== 0 ? cmp * signo : (b.deuda_comercial || 0) - (a.deuda_comercial || 0)
  })
}

// Paleta clara de la tabla desktop — misma base que la vista móvil (MC).
const TD = {
  ...MC,
  inputBg: '#F8FAFC', accent: '#B45309', accentSoft: '#FFF7ED', accentLine: '#F59E0B',
  purple: '#9333EA', purpleSoft: '#FAF5FF', hover: '#F8FAFC', head: '#F8FAFC',
}

function DeudoresTablaDesktop({ deudores, isAdmin, clientesPorVendedor }: {
  deudores: Deudor[]; isAdmin: boolean; clientesPorVendedor: Record<string, number>
}) {
  const [cartera, setCartera] = useState<string>('todos')
  const [filterDeudaVencida, setFilterDeudaVencida] = useState<'todos' | 'vencida' | 'sin-vencida'>('todos')
  const [searchText, setSearchText] = useState('')
  const [orden, setOrden] = useState<{ col: ColOrden; dir: DirOrden }>({ col: 'deuda', dir: 'desc' })
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
  const [showSaldoNoVencido, setShowSaldoNoVencido] = useState(false)
  const [exportando, setExportando] = useState<{ hecho: number; total: number } | null>(null)
  // Detalle de cobranza del cliente desplegado — lo llena PanelCobranza y lo
  // consume el mensaje de WhatsApp de esa misma fila.
  const [cobranza, setCobranza] = useState<DatosCobranza | null>(null)

  // Mismo criterio que en móvil: para el admin, sólo las 4 carteras de venta.
  const universo = useMemo(
    () => (isAdmin ? deudores.filter(esCarteraDeVenta) : deudores),
    [deudores, isAdmin],
  )

  const { filas, total } = useMemo(
    () => resumenCarteras(universo, clientesPorVendedor),
    [universo, clientesPorVendedor],
  )

  const filteredDeudores = useMemo(() => {
    const q = searchText.toLowerCase()
    const res = universo.filter(d => {
      if (isAdmin && cartera !== 'todos' && vendedorCanonico(d.vendedor) !== cartera) return false
      if (filterDeudaVencida === 'vencida' && d.deuda_comercial <= 0) return false
      if (filterDeudaVencida === 'sin-vencida' && d.deuda_comercial > 0) return false
      if (q && !d.nombre_fantasia.toLowerCase().includes(q)) return false
      return true
    })
    return ordenarDeudores(res, orden.col, orden.dir)
  }, [universo, isAdmin, cartera, filterDeudaVencida, searchText, orden])

  // "Quitar filtros": vuelve a la vista con que se entra a la pantalla.
  const hayFiltros = cartera !== 'todos' || filterDeudaVencida !== 'todos' || searchText !== ''
    || orden.col !== 'deuda' || orden.dir !== 'desc'
  const limpiarFiltros = () => {
    setCartera('todos'); setFilterDeudaVencida('todos'); setSearchText(''); setOrden({ col: 'deuda', dir: 'desc' })
  }

  const clicEncabezado = (col: ColOrden) => {
    setOrden(o => o.col === col
      ? { col, dir: o.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: DIR_INICIAL[col] })
  }

  const totals = {
    deudores: filteredDeudores.length,
    saldo_total: filteredDeudores.reduce((sum, d) => sum + (d.saldo_comercial || 0), 0),
    deuda_vencida: filteredDeudores.reduce((sum, d) => sum + (d.deuda_comercial || 0), 0),
    barriles_adeudados: filteredDeudores.reduce((sum, d) => sum + (d.barriles_adeudados || 0), 0),
  }

  // Mismo desglose que la vista móvil: "deudor" mezcla clientes con plata YA
  // vencida y clientes que sólo tienen saldo dentro de plazo (no vencido).
  const conVencida = filteredDeudores.filter(d => d.deuda_comercial > 0).length
  const soloNoVencida = totals.deudores - conVencida
  // El denominador "de X clientes" sólo se puede armar para admin (es la
  // cartera que ya se sabe de clientesPorVendedor); para un vendedor viendo
  // su propia cartera en desktop no llega ese dato acá.
  const clientesTotal = isAdmin ? (cartera === 'todos' ? total.clientes : (clientesPorVendedor[cartera] ?? 0)) : null

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', minHeight: 42,
    background: TD.inputBg, border: `1px solid ${TD.border}`,
    borderRadius: 10, color: TD.text, fontSize: 14,
    outline: 'none',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none', cursor: 'pointer', fontWeight: 600,
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%2364748B\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: 34,
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 11.5, color: TD.muted, fontWeight: 700, letterSpacing: '0.04em', display: 'block', marginBottom: 6,
  }

  const columnas: { col: ColOrden | null; label: string; align: 'left' | 'right' | 'center' }[] = [
    { col: 'cliente', label: 'Cliente', align: 'left' },
    ...(isAdmin ? [{ col: 'vendedor' as const, label: 'Vendedor', align: 'left' as const }] : []),
    { col: 'deuda', label: 'Deuda vencida', align: 'right' },
    { col: 'dias', label: 'Días vencida', align: 'right' },
    { col: 'saldo', label: 'Saldo total', align: 'right' },
    { col: 'barriles', label: 'Barriles', align: 'right' },
    { col: 'pago', label: 'Último pago', align: 'left' },
    { col: null, label: '', align: 'center' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: TD.bg }}>
    <div style={{ padding: '24px 20px 60px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Wallet size={22} style={{ color: TD.accent }} />
          <h1 style={{ fontSize: 26, fontWeight: 900, color: TD.text, letterSpacing: '-0.5px' }}>Deudores</h1>
        </div>
        {filteredDeudores.length > 0 && (
          <button
            disabled={!!exportando}
            onClick={async () => {
              setExportando({ hecho: 0, total: filteredDeudores.length })
              try {
                await exportarPorFactura(filteredDeudores, (hecho, total) => setExportando({ hecho, total }))
              } finally {
                setExportando(null)
              }
            }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
              padding: '9px 16px', borderRadius: 10, minHeight: 40,
              background: exportando ? TD.card : TD.accentSoft,
              border: `1px solid ${exportando ? TD.border : '#FED7AA'}`,
              color: exportando ? TD.muted : TD.accent,
              fontSize: 13.5, fontWeight: 700, cursor: exportando ? 'default' : 'pointer',
            }}>
            {exportando
              ? <><Loader2 size={15} className="animate-spin" /> Generando {exportando.hecho}/{exportando.total}…</>
              : <><FileDown size={15} /> Exportar por factura</>}
          </button>
        )}
      </div>
      <p style={{ fontSize: 14, color: TD.muted, marginBottom: 20 }}>
        {isAdmin
          ? 'Suma de las carteras de los 4 vendedores. No incluye incobrables, CERVECERÍA ni cuentas internas.'
          : 'Deuda de tus clientes asignados.'}
      </p>

      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Deudores', value: totals.deudores, format: 'n', color: TD.blue },
          { label: 'Deuda Vencida', value: totals.deuda_vencida, format: '$', color: TD.red },
          { label: 'Saldo Total', value: totals.saldo_total, format: '$', color: TD.accent },
          { label: 'Barriles', value: totals.barriles_adeudados, format: 'n', color: TD.purple },
        ].map(({ label, value, format, color }) => {
          const esSaldo = label === 'Saldo Total'
          const esDeudores = label === 'Total Deudores'
          return (
            <div key={label} style={{
              background: TD.card, border: `1px solid ${TD.border}`,
              borderTop: `3px solid ${color}`, borderRadius: 12, padding: '16px 20px',
              boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
            }}>
              <p style={{ fontSize: 11.5, fontWeight: 700, color: TD.muted, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>
                {label}
              </p>
              <p style={{ fontSize: 24, fontWeight: 900, color }}>
                {format === '$' ? formatCurrency(value) : value.toLocaleString('es-CL')}
                {esDeudores && clientesTotal !== null && clientesTotal > 0 && (
                  <span style={{ fontSize: 13, fontWeight: 500, color: TD.muted }}>
                    {' '}de {clientesTotal} ({Math.round((totals.deudores / clientesTotal) * 100)}%)
                  </span>
                )}
              </p>
              {/* "Deudor" acá mezcla clientes con plata YA vencida y clientes
                  que sólo tienen saldo dentro de plazo (no vencido). */}
              {esDeudores && (
                <p style={{ fontSize: 12, color: TD.muted, marginTop: 6 }}>
                  {conVencida} con deuda vencida{soloNoVencida > 0 ? ` · ${soloNoVencida} solo dentro de plazo` : ''}
                </p>
              )}
              {/* El saldo total incluye lo vencido más lo que aún no vence —
                  este botón abre el detalle de esa segunda parte. */}
              {esSaldo && (
                <button onClick={() => setShowSaldoNoVencido(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, marginTop: 6, padding: 0,
                    background: 'none', border: 'none', cursor: 'pointer', color: TD.blue,
                    fontSize: 12, fontWeight: 600 }}>
                  Ver saldo no vencido
                  <ChevronRight size={12} />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Desglose por vendedor — también es el filtro (tarjetas seleccionables) */}
      {isAdmin && (
        <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: `repeat(${filas.length + 1},1fr)`, gap: 12, marginBottom: 20 }}>
          {[{ vendedor: 'todos', nombre: 'Todos', deudores: total.deudores, clientes: total.clientes, vencida: total.vencida },
            ...filas.map(f => ({ vendedor: f.vendedor, nombre: nombreCorto(f.vendedor), deudores: f.deudores, clientes: f.clientes, vencida: f.vencida }))
          ].map(f => {
            const activo = cartera === f.vendedor
            return (
              <button key={f.vendedor} onClick={() => setCartera(c => (c === f.vendedor ? 'todos' : f.vendedor))}
                style={{
                  textAlign: 'left', cursor: 'pointer', font: 'inherit',
                  background: activo ? TD.accentSoft : TD.card,
                  border: `1px solid ${activo ? TD.accentLine : TD.border}`,
                  boxShadow: activo ? `0 0 0 1px ${TD.accentLine}` : '0 1px 2px rgba(15,23,42,0.04)',
                  borderRadius: 12, padding: '13px 16px',
                }}>
                <p style={{ fontSize: 11.5, fontWeight: 700, color: activo ? TD.accent : TD.muted, letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>
                  {f.nombre}
                </p>
                <p style={{ fontSize: 19, fontWeight: 900, color: TD.red }}>{formatCurrency(f.vencida)}</p>
                <p style={{ fontSize: 12, color: TD.muted, marginTop: 3 }}>
                  {f.deudores} deudor{f.deudores === 1 ? '' : 'es'}{f.clientes > 0 ? ` de ${f.clientes}` : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <div className="grid-stack-mobile" style={{
        background: TD.card, border: `1px solid ${TD.border}`,
        borderRadius: 12, padding: '16px 20px', marginBottom: 16,
        display: 'grid', gridTemplateColumns: isAdmin ? 'repeat(4,1fr)' : 'repeat(3,1fr)', gap: 12,
      }}>
        <div>
          <label style={labelStyle}>BUSCAR</label>
          <input
            type="text" value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Nombre cliente..."
            style={inputStyle}
          />
        </div>
        {isAdmin && (
          <div>
            <label style={labelStyle}>VENDEDOR</label>
            <select value={cartera} onChange={e => setCartera(e.target.value)} style={selectStyle}>
              <option value="todos">Todos los vendedores</option>
              {filas.map(f => <option key={f.vendedor} value={f.vendedor}>{f.vendedor}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={labelStyle}>ESTADO</label>
          <select
            value={filterDeudaVencida}
            onChange={e => setFilterDeudaVencida(e.target.value as typeof filterDeudaVencida)}
            style={selectStyle}
          >
            <option value="todos">Todos</option>
            <option value="vencida">Con deuda vencida</option>
            <option value="sin-vencida">Sin deuda vencida</option>
          </select>
        </div>
        <div>
          <label style={labelStyle}>ORDENAR POR</label>
          <select
            value={`${orden.col}:${orden.dir}`}
            onChange={e => {
              const [col, dir] = e.target.value.split(':') as [ColOrden, DirOrden]
              setOrden({ col, dir })
            }}
            style={selectStyle}
          >
            {OPCIONES_ORDEN.filter(o => isAdmin || !o.soloAdmin).map(o => (
              <option key={`${o.col}:${o.dir}`} value={`${o.col}:${o.dir}`}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      {hayFiltros && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: -6, marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: TD.muted }}>
            {filteredDeudores.length} de {universo.length} deudores
          </span>
          <button onClick={limpiarFiltros}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minHeight: 36, padding: '0 14px', borderRadius: 10,
              border: `1px solid ${TD.border}`, background: TD.card, color: TD.blue, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            <X size={14} /> Quitar filtros
          </button>
        </div>
      )}

      <div style={{
        background: TD.card, border: `1px solid ${TD.border}`,
        borderRadius: 12, overflow: 'hidden', boxShadow: '0 1px 2px rgba(15,23,42,0.04)',
      }}>
        {filteredDeudores.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: TD.muted, fontSize: 14 }}>
              {universo.length === 0
                ? (isAdmin ? 'Todavía no hay deudores cargados.' : 'Ninguno de tus clientes tiene deuda registrada.')
                : 'No hay deudores que coincidan con los filtros'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${TD.border}`, background: TD.head }}>
                  {columnas.map(({ col, label, align }) => {
                    const activa = col !== null && orden.col === col
                    const Icono = !activa ? ArrowUpDown : orden.dir === 'desc' ? ArrowDown : ArrowUp
                    return (
                      <th key={label || 'acciones'} style={{ padding: 0, textAlign: align, whiteSpace: 'nowrap' }}
                        aria-sort={activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined}>
                        {col === null ? null : (
                          <button
                            onClick={() => clicEncabezado(col)}
                            title="Ordenar por esta columna"
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: 5,
                              flexDirection: align === 'right' ? 'row-reverse' : 'row',
                              width: '100%', justifyContent: align === 'right' ? 'flex-start' : 'flex-start',
                              padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer',
                              font: 'inherit', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.5px', textTransform: 'uppercase',
                              color: activa ? TD.text : TD.muted,
                            }}>
                            <Icono size={13} style={{ color: activa ? TD.accent : TD.faint, flexShrink: 0 }} />
                            {label}
                          </button>
                        )}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {filteredDeudores.map((deudor) => {
                  // Mientras la fila no esté desplegada usamos el estimado
                  // rápido (external_fecha); una vez llega el detalle real de
                  // ESTA fila (fecha_pedido + dias_pago), ese manda.
                  const diasFila = expandedRow === deudor.id && cobranza
                    ? cobranza.detalle.diasMoraMaxima
                    : diasMoraDe(deudor)
                  const abierta = expandedRow === deudor.id
                  return (
                  <Fragment key={deudor.id}>
                    <tr
                      onClick={() => { setExpandedRow(abierta ? null : deudor.id); setCobranza(null) }}
                      style={{
                        borderBottom: `1px solid ${TD.border}`, cursor: 'pointer',
                        background: abierta ? TD.accentSoft : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (!abierta) (e.currentTarget as HTMLElement).style.background = TD.hover }}
                      onMouseLeave={e => { if (!abierta) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={{ padding: '12px 14px', fontWeight: 700, color: TD.text, maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {deudor.nombre_fantasia}
                      </td>
                      {isAdmin && <td style={{ padding: '12px 14px', color: TD.muted }}>{vendedorCanonico(deudor.vendedor) || '—'}</td>}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, color: deudor.deuda_comercial > 0 ? TD.red : TD.green }}>
                        {formatCurrency(deudor.deuda_comercial)}
                        {deudor.maquila_vencida > 0 && (
                          <span style={{ display: 'block', fontSize: 11.5, fontWeight: 500, color: TD.muted }}>
                            + {formatCurrency(Math.round(deudor.maquila_vencida))} maquila
                          </span>
                        )}
                      </td>
                      {/* Días exactos de mora del documento más antiguo impago. */}
                      <td style={{ padding: '12px 14px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap',
                        color: diasFila >= 60 ? TD.red : diasFila > 0 ? TD.amber : TD.faint }}>
                        {diasFila > 0 ? `${diasFila} días` : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: TD.text, fontWeight: 600 }}>
                        {formatCurrency(deudor.saldo_comercial)}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right', color: deudor.barriles_adeudados > 0 ? TD.purple : TD.faint, fontWeight: 600 }}>
                        {deudor.barriles_adeudados}
                      </td>
                      <td style={{ padding: '12px 14px', color: TD.muted }}>
                        {deudor.ultimo_pago ? new Date(deudor.ultimo_pago).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        {abierta
                          ? <ChevronDown size={15} style={{ color: TD.accent }} />
                          : <ChevronRight size={15} style={{ color: TD.faint }} />}
                      </td>
                    </tr>

                    {abierta && (
                      <tr>
                        <td colSpan={columnas.length} style={{
                          padding: '20px 24px',
                          background: '#FFFBF5',
                          borderBottom: `1px solid ${TD.border}`,
                          borderLeft: `3px solid ${TD.accentLine}`,
                        }}>
                          {/* Mora exacta, contacto de cobranza y facturas
                              vencidas con su detalle de productos y precios. */}
                          <PanelCobranza cliente={deudor.nombre_fantasia} tema="claro" onDatos={setCobranza} />

                          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setWaTarget({
                                  nombre: deudor.nombre_fantasia, telefono: deudor.telefono,
                                  contexto: 'cobranza', alertTipo: 'cobranza',
                                  subtitulo: deudor.localidad ?? undefined,
                                  contacto: cobranza?.contacto?.contacto ?? null,
                                  diasVencida: diasFila,
                                  montoVencido: deudor.deuda_comercial,
                                  documentos: cobranza ? documentosParaWA(cobranza.detalle) : undefined,
                                })
                              }}
                              style={{ minHeight: 40, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7,
                                background: TD.greenSoft, border: '1px solid rgba(5,150,105,0.3)',
                                borderRadius: 10, color: TD.green, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                              <MessageCircle size={15} /> Cobrar por WhatsApp
                            </button>
                            {deudor.telefono && (
                              <a href={`tel:${deudor.telefono}`} onClick={e => e.stopPropagation()}
                                style={{ minHeight: 40, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7,
                                  background: TD.blueSoft, border: '1px solid rgba(37,99,235,0.28)',
                                  borderRadius: 10, color: TD.blue, fontSize: 13, fontWeight: 700, textDecoration: 'none' }}>
                                <Phone size={15} /> Llamar
                              </a>
                            )}
                          </div>

                          <div className="grid-stack-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>

                            <div>
                              <p style={{ fontSize: 11.5, fontWeight: 700, color: TD.accent, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                                Contacto
                              </p>
                              {[
                                { label: 'Email', value: deudor.email },
                                { label: 'Teléfono', value: deudor.telefono },
                                { label: 'Localidad', value: deudor.localidad },
                                { label: 'Razón Social', value: deudor.razon_social },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 12.5, color: TD.muted }}>{label}: </span>
                                  <span style={{ fontSize: 13, color: TD.text }}>{value || '—'}</span>
                                </div>
                              ))}
                            </div>

                            <div>
                              <p style={{ fontSize: 11.5, fontWeight: 700, color: TD.accent, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                                Deuda por Antigüedad
                              </p>
                              {[
                                { label: '0–14 días', value: deudor.deuda_menor_14_dias },
                                { label: '15–29 días', value: deudor.deuda_entre_15_29_dias },
                                { label: '30–44 días', value: deudor.deuda_entre_30_44_dias },
                                { label: '45–59 días', value: deudor.deuda_entre_45_59_dias },
                                { label: '60–89 días', value: deudor.deuda_entre_60_89_dias },
                                { label: '+90 días', value: deudor.deuda_mas_90_dias },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                                  <span style={{ fontSize: 13, color: TD.muted }}>{label}</span>
                                  <span style={{ fontSize: 13, fontWeight: 700, color: (value || 0) > 0 ? TD.red : TD.faint }}>
                                    {formatCurrency(value || 0)}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div>
                              <p style={{ fontSize: 11.5, fontWeight: 700, color: TD.accent, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                                Cuenta
                              </p>
                              {[
                                { label: 'Tipo Cliente', value: deudor.tipo_cliente },
                                { label: 'Límite Cta Cte', value: deudor.limite_cta_cte ? formatCurrency(deudor.limite_cta_cte) : null },
                                { label: 'Días Pago', value: deudor.dias_pago ? `${deudor.dias_pago} días` : null },
                                { label: 'Última Compra', value: deudor.fecha_ultima_compra ? new Date(deudor.fecha_ultima_compra).toLocaleDateString('es-CL') : null },
                                { label: 'Fecha Alta', value: deudor.fecha_alta ? new Date(deudor.fecha_alta).toLocaleDateString('es-CL') : null },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 12.5, color: TD.muted }}>{label}: </span>
                                  <span style={{ fontSize: 13, color: TD.text }}>{value || '—'}</span>
                                </div>
                              ))}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 12, color: TD.muted, marginTop: 8, textAlign: 'right' }}>
        Mostrando {filteredDeudores.length} de {universo.length} deudores
      </p>

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
      {showSaldoNoVencido && (
        <SaldoNoVencidoModal deudores={filteredDeudores} isAdmin={isAdmin} tema="claro" onClose={() => setShowSaldoNoVencido(false)} />
      )}
    </div>
    </div>
  )
}
