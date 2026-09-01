'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ChevronDown, ChevronRight, Wallet, ChevronLeft, Search, X, Users, Coins,
  MessageCircle, Phone, FileDown,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { useIsDesktop } from '@/lib/useIsDesktop'
import { useUser } from '@/lib/userContext'
import { VENDEDORES_CARTERA_COBRANZA, vendedorCanonico, grupoCarteraDe, nombreCorto } from '@/lib/types'
import NotificationsBell from '@/components/ui/NotificationsBell'
import SettingsPanel from '@/components/ui/SettingsPanel'
import WAModal, { type WATarget } from '@/components/ui/WAModal'
import PanelCobranza, { documentosParaWA, type DatosCobranza } from '@/components/deudores/PanelCobranza'
import { diasMoraDeudor } from '@/lib/cobranza'

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
}

/** Fila cruda de Supabase, antes de descontarle la maquila. */
type DeudorRaw = Omit<Deudor, 'maquila_vencida' | 'deuda_comercial'>

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
    fila.saldo += d.saldo_total || 0
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

function exportarCSV(deudores: Deudor[]) {
  const headers = ['Cliente', 'Localidad', 'Vendedor', 'Deuda vencida', 'Días vencida', 'Doc. más antiguo', 'Remito', 'Maquila (no comercial)', 'Saldo total', 'Barriles', 'Último pago']
  const filas = deudores.map(d => [
    d.nombre_fantasia, d.localidad ?? '', vendedorCanonico(d.vendedor) || '',
    d.deuda_comercial, diasMoraDe(d),
    d.external_fecha ? fFecha(d.external_fecha) : '',
    d.external_remito_mas_antiguo ?? '',
    Math.round(d.maquila_vencida),
    d.saldo_total, d.barriles_adeudados,
    d.ultimo_pago ? fFecha(d.ultimo_pago) : '',
  ])
  const csv = [headers, ...filas].map(fila => fila.map(csvEscape).join(',')).join('\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `deudores-${new Date().toISOString().split('T')[0]}.csv`
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

  // Días exactos de mora del documento más antiguo. Se calculan de la propia
  // fila (external_fecha + dias_pago), así que se pueden mostrar en la lista
  // sin desplegar nada ni pedir datos al servidor.
  const diasMora = diasMoraDe(d)

  // El detalle por factura llega cuando se despliega la tarjeta; el mensaje de
  // WhatsApp lo usa si ya está, y si no igual sale con días y monto.
  const [cobranza, setCobranza] = useState<DatosCobranza | null>(null)

  const waTarget: WATarget = {
    nombre: d.nombre_fantasia, telefono: d.telefono,
    contexto: 'cobranza', alertTipo: 'cobranza',
    subtitulo: d.localidad ?? undefined,
    contacto: cobranza?.contacto?.contacto ?? null,
    diasVencida: cobranza?.detalle.diasMoraMaxima ?? diasMora,
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
            <p style={{ fontSize: 13, fontWeight: 700, color: MC.text }}>{formatCurrency(d.saldo_total)}</p>
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

export default function DeudoresVendedorClient({ initialDeudores, isAdmin, clientesPorVendedor, totalClientesPropios, maquilaPorCliente }: Props) {
  const router = useRouter()
  const isDesktop = useIsDesktop()
  const { user } = useUser()
  const [showSettings, setShowSettings] = useState(false)
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)

  // 'todos' = las 4 carteras sumadas; o el nombre canónico de un vendedor.
  const [cartera, setCartera] = useState<string>('todos')
  const [filterBucket, setFilterBucket] = useState<Bucket | 'todos'>('todos')
  const [searchText, setSearchText] = useState('')
  const [sortBy, setSortBy] = useState<'deuda' | 'nombre' | 'antigua'>('deuda')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

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

  const kpis = {
    total: base.length,
    saldo: base.reduce((s, d) => s + (d.saldo_total || 0), 0),
    vencida: base.reduce((s, d) => s + (d.deuda_comercial || 0), 0),
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

        {/* Título y acciones en filas separadas — mismo motivo que Stock: un
            botón ancho al lado del título en pantallas angostas lo aplasta. */}
        <div style={{ marginBottom: 4 }}>
          <h1 style={{ fontSize: 26, fontWeight: 800, color: MC.text, letterSpacing: '-0.5px' }}>Deudores</h1>
          <p style={{ fontSize: 12.5, color: MC.faint, marginTop: 2 }}>{subtitulo}</p>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
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

        {/* KPI cards — siguen el filtro por vendedor: si estás viendo una
            cartera, el número de arriba es el de esa cartera. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
          <div style={{ background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: MC.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={15} color={MC.blue} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: MC.muted }}>Total deudores</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: MC.text, letterSpacing: '-0.5px' }}>
              {kpis.total}
              {clientesBase > 0 && <span style={{ fontSize: 12, fontWeight: 500, color: MC.faint }}> de {clientesBase} clientes</span>}
            </p>
          </div>
          <div style={{ background: MC.card, borderRadius: 16, border: `1px solid ${MC.border}`, padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <div style={{ width: 30, height: 30, borderRadius: 9, background: MC.redSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Coins size={15} color={MC.red} />
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: MC.muted }}>Deuda vencida</span>
            </div>
            <p style={{ fontSize: 22, fontWeight: 800, color: MC.red, letterSpacing: '-0.5px' }}>{formatCurrency(kpis.vencida)}</p>
            <p style={{ fontSize: 11, color: MC.faint, marginTop: 2 }}>Saldo total {formatCurrency(kpis.saldo)}</p>
          </div>
        </div>

        {/* Desglose + filtro por vendedor (sólo admin) */}
        {isAdmin && <ResumenCarteras filas={filas} total={total} activo={cartera} onSelect={setCartera} />}

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
          <p style={{ fontSize: 13, fontWeight: 700, color: MC.text }}>{filtrados.length} cliente{filtrados.length === 1 ? '' : 's'}</p>
          {filtrados.length > 0 && (
            <button onClick={() => exportarCSV(filtrados)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: MC.blue, fontSize: 12.5, fontWeight: 700 }}>
              <FileDown size={14} /> Exportar
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
    </div>
  )
}

// ── Tabla de escritorio (tema oscuro existente) ──────────────────────────────
function DeudoresTablaDesktop({ deudores, isAdmin, clientesPorVendedor }: {
  deudores: Deudor[]; isAdmin: boolean; clientesPorVendedor: Record<string, number>
}) {
  const [cartera, setCartera] = useState<string>('todos')
  const [filterDeudaVencida, setFilterDeudaVencida] = useState<'todos' | 'vencida' | 'sin-vencida'>('todos')
  const [searchText, setSearchText] = useState('')
  const [expandedRow, setExpandedRow] = useState<string | null>(null)
  const [waTarget, setWaTarget] = useState<WATarget | null>(null)
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

  const filteredDeudores = universo.filter(d => {
    if (isAdmin && cartera !== 'todos' && vendedorCanonico(d.vendedor) !== cartera) return false
    if (filterDeudaVencida === 'vencida' && d.deuda_comercial <= 0) return false
    if (filterDeudaVencida === 'sin-vencida' && d.deuda_comercial > 0) return false
    if (searchText && !d.nombre_fantasia.toLowerCase().includes(searchText.toLowerCase())) return false
    return true
  })

  const totals = {
    deudores: filteredDeudores.length,
    saldo_total: filteredDeudores.reduce((sum, d) => sum + (d.saldo_total || 0), 0),
    deuda_vencida: filteredDeudores.reduce((sum, d) => sum + (d.deuda_comercial || 0), 0),
    barriles_adeudados: filteredDeudores.reduce((sum, d) => sum + (d.barriles_adeudados || 0), 0),
  }

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 8, color: 'var(--cream)', fontSize: 13,
    outline: 'none',
  }

  const selectStyle: React.CSSProperties = {
    ...inputStyle,
    appearance: 'none',
    backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23888\' stroke-width=\'2\'%3E%3Cpolyline points=\'6 9 12 15 18 9\'/%3E%3C/svg%3E")',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 10px center',
    paddingRight: 32,
  }

  return (
    <div style={{ padding: '24px 20px 60px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Wallet size={22} style={{ color: 'var(--gold)' }} />
        <h1 style={{ fontSize: 24, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-0.5px' }}>Deudores</h1>
      </div>
      <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
        {isAdmin
          ? 'Suma de las carteras de los 4 vendedores. No incluye incobrables, CERVECERÍA ni cuentas internas.'
          : 'Deuda de tus clientes asignados.'}
      </p>

      <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Deudores', value: totals.deudores, format: 'n', color: '#60a5fa' },
          { label: 'Deuda Vencida', value: totals.deuda_vencida, format: '$', color: '#f87171' },
          { label: 'Saldo Total', value: totals.saldo_total, format: '$', color: 'var(--gold)' },
          { label: 'Barriles', value: totals.barriles_adeudados, format: 'n', color: '#c084fc' },
        ].map(({ label, value, format, color }) => (
          <div key={label} style={{
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderTop: `3px solid ${color}`, borderRadius: 12, padding: '16px 20px',
          }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>
              {label}
            </p>
            <p style={{ fontSize: 22, fontWeight: 900, color }}>
              {format === '$' ? formatCurrency(value) : value.toLocaleString('es-CL')}
            </p>
          </div>
        ))}
      </div>

      {/* Desglose por vendedor — también es el filtro (tarjetas seleccionables) */}
      {isAdmin && (
        <div className="kpi-grid-4" style={{ display: 'grid', gridTemplateColumns: `repeat(${filas.length + 1},1fr)`, gap: 12, marginBottom: 20 }}>
          {[{ vendedor: 'todos', nombre: 'Todos', deudores: total.deudores, clientes: total.clientes, vencida: total.vencida },
            ...filas.map(f => ({ vendedor: f.vendedor, nombre: nombreCorto(f.vendedor), deudores: f.deudores, clientes: f.clientes, vencida: f.vencida }))
          ].map(f => {
            const activo = cartera === f.vendedor
            return (
              <button key={f.vendedor} onClick={() => setCartera(f.vendedor)}
                style={{
                  textAlign: 'left', cursor: 'pointer', font: 'inherit',
                  background: activo ? 'rgba(212,175,55,0.08)' : 'var(--surface)',
                  border: `1px solid ${activo ? 'var(--gold)' : 'var(--border)'}`,
                  borderRadius: 12, padding: '13px 16px',
                }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: activo ? 'var(--gold)' : 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 6 }}>
                  {f.nombre}
                </p>
                <p style={{ fontSize: 18, fontWeight: 900, color: '#f87171' }}>{formatCurrency(f.vencida)}</p>
                <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 3 }}>
                  {f.deudores} deudor{f.deudores === 1 ? '' : 'es'}{f.clientes > 0 ? ` de ${f.clientes}` : ''}
                </p>
              </button>
            )
          })}
        </div>
      )}

      <div className="grid-stack-mobile" style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, padding: '16px 20px', marginBottom: 16,
        display: 'grid', gridTemplateColumns: isAdmin ? 'repeat(3,1fr)' : 'repeat(2,1fr)', gap: 12,
      }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
            BUSCAR
          </label>
          <input
            type="text" value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="Nombre cliente..."
            style={inputStyle}
          />
        </div>
        {isAdmin && (
          <div>
            <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
              VENDEDOR
            </label>
            <select value={cartera} onChange={e => setCartera(e.target.value)} style={selectStyle}>
              <option value="todos">Todos los vendedores</option>
              {filas.map(f => <option key={f.vendedor} value={f.vendedor}>{f.vendedor}</option>)}
            </select>
          </div>
        )}
        <div>
          <label style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, display: 'block', marginBottom: 6 }}>
            ESTADO
          </label>
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
      </div>

      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 12, overflow: 'hidden',
      }}>
        {filteredDeudores.length === 0 ? (
          <div style={{ padding: '48px 24px', textAlign: 'center' }}>
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>
              {universo.length === 0
                ? (isAdmin ? 'Todavía no hay deudores cargados.' : 'Ninguno de tus clientes tiene deuda registrada.')
                : 'No hay deudores que coincidan con los filtros'}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {[...(isAdmin ? ['Cliente', 'Vendedor'] : ['Cliente']), 'Deuda Vencida', 'Días Vencida', 'Saldo Total', 'Barriles', 'Último Pago', ''].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px', textAlign: h === 'Deuda Vencida' || h === 'Saldo Total' || h === 'Barriles' || h === 'Días Vencida' ? 'right' : 'left',
                      fontSize: 11, fontWeight: 700, color: 'var(--muted)',
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                      whiteSpace: 'nowrap',
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredDeudores.map((deudor) => (
                  <>
                    <tr
                      key={deudor.id}
                      onClick={() => { setExpandedRow(expandedRow === deudor.id ? null : deudor.id); setCobranza(null) }}
                      style={{
                        borderBottom: '1px solid var(--border)', cursor: 'pointer',
                        background: expandedRow === deudor.id ? 'rgba(212,175,55,0.04)' : 'transparent',
                        transition: 'background 0.1s',
                      }}
                      onMouseEnter={e => { if (expandedRow !== deudor.id) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)' }}
                      onMouseLeave={e => { if (expandedRow !== deudor.id) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <td style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--cream)', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {deudor.nombre_fantasia}
                      </td>
                      {isAdmin && <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>{vendedorCanonico(deudor.vendedor) || '—'}</td>}
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: deudor.deuda_comercial > 0 ? '#f87171' : '#4ade80' }}>
                        {formatCurrency(deudor.deuda_comercial)}
                        {deudor.maquila_vencida > 0 && (
                          <span style={{ display: 'block', fontSize: 10.5, fontWeight: 500, color: 'var(--muted)' }}>
                            + {formatCurrency(Math.round(deudor.maquila_vencida))} maquila
                          </span>
                        )}
                      </td>
                      {/* Días exactos de mora del documento más antiguo impago. */}
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, whiteSpace: 'nowrap',
                        color: diasMoraDe(deudor) >= 60 ? '#f87171' : diasMoraDe(deudor) > 0 ? '#fbbf24' : 'var(--muted)' }}>
                        {diasMoraDe(deudor) > 0 ? `${diasMoraDe(deudor)} días` : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: 'var(--cream)', fontWeight: 600 }}>
                        {formatCurrency(deudor.saldo_total)}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', color: deudor.barriles_adeudados > 0 ? '#c084fc' : 'var(--muted)', fontWeight: 600 }}>
                        {deudor.barriles_adeudados}
                      </td>
                      <td style={{ padding: '11px 14px', color: 'var(--muted)' }}>
                        {deudor.ultimo_pago ? new Date(deudor.ultimo_pago).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>
                        {expandedRow === deudor.id
                          ? <ChevronDown size={14} style={{ color: 'var(--gold)' }} />
                          : <ChevronRight size={14} style={{ color: 'var(--muted)' }} />}
                      </td>
                    </tr>

                    {expandedRow === deudor.id && (
                      <tr key={`${deudor.id}-detail`}>
                        <td colSpan={isAdmin ? 9 : 8} style={{
                          padding: '20px 24px',
                          background: 'rgba(212,175,55,0.03)',
                          borderBottom: '1px solid var(--border)',
                          borderLeft: '3px solid var(--gold)',
                        }}>
                          {/* Mora exacta, contacto de cobranza y facturas
                              vencidas con su detalle de productos y precios. */}
                          <PanelCobranza cliente={deudor.nombre_fantasia} tema="oscuro" onDatos={setCobranza} />

                          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
                            <button
                              onClick={e => {
                                e.stopPropagation()
                                setWaTarget({
                                  nombre: deudor.nombre_fantasia, telefono: deudor.telefono,
                                  contexto: 'cobranza', alertTipo: 'cobranza',
                                  subtitulo: deudor.localidad ?? undefined,
                                  contacto: cobranza?.contacto?.contacto ?? null,
                                  diasVencida: cobranza?.detalle.diasMoraMaxima ?? diasMoraDe(deudor),
                                  montoVencido: deudor.deuda_comercial,
                                  documentos: cobranza ? documentosParaWA(cobranza.detalle) : undefined,
                                })
                              }}
                              style={{ minHeight: 38, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7,
                                background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.3)',
                                borderRadius: 10, color: '#25D366', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                              <MessageCircle size={14} /> Cobrar por WhatsApp
                            </button>
                            {deudor.telefono && (
                              <a href={`tel:${deudor.telefono}`} onClick={e => e.stopPropagation()}
                                style={{ minHeight: 38, padding: '0 16px', display: 'flex', alignItems: 'center', gap: 7,
                                  background: 'rgba(96,165,250,0.10)', border: '1px solid rgba(96,165,250,0.28)',
                                  borderRadius: 10, color: '#60a5fa', fontSize: 12.5, fontWeight: 700, textDecoration: 'none' }}>
                                <Phone size={14} /> Llamar
                              </a>
                            )}
                          </div>

                          <div className="grid-stack-mobile" style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>

                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
                                Contacto
                              </p>
                              {[
                                { label: 'Email', value: deudor.email },
                                { label: 'Teléfono', value: deudor.telefono },
                                { label: 'Localidad', value: deudor.localidad },
                                { label: 'Razón Social', value: deudor.razon_social },
                              ].map(({ label, value }) => (
                                <div key={label} style={{ marginBottom: 6 }}>
                                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}: </span>
                                  <span style={{ fontSize: 12, color: 'var(--cream)' }}>{value || '—'}</span>
                                </div>
                              ))}
                            </div>

                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
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
                                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: (value || 0) > 0 ? '#f87171' : 'var(--muted)' }}>
                                    {formatCurrency(value || 0)}
                                  </span>
                                </div>
                              ))}
                            </div>

                            <div>
                              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--gold)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
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
                                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>{label}: </span>
                                  <span style={{ fontSize: 12, color: 'var(--cream)' }}>{value || '—'}</span>
                                </div>
                              ))}
                            </div>

                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, textAlign: 'right' }}>
        Mostrando {filteredDeudores.length} de {universo.length} deudores
      </p>

      {waTarget && <WAModal target={waTarget} onClose={() => setWaTarget(null)} />}
    </div>
  )
}
