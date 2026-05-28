'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, MessageCircle, Mail, MapPin, Phone, Tag, Truck,
  ShoppingBag, Droplets, DollarSign, Clock, User, FileText,
  CreditCard, Calendar,
} from 'lucide-react'

interface Cliente {
  id: number
  nombre_fantasia: string | null
  razon_social: string | null
  rut: string | null
  telefono: string | null
  email: string | null
  contacto: string | null
  direccion: string | null
  localidad: string | null
  provincia: string | null
  localidad_entrega: string | null
  direccion_entrega: string | null
  ruta_despacho: string | null
  categoria: string | null
  vendedor: string | null
  tipo: string | null
  giro: string | null
  condicion_venta: string | null
  lista_precios: string | null
  dias_pago: number | null
  limite_cta_cte: number | null
  saldo_cta_cte_inicial: number | null
  notas: string | null
  codigo_cliente: string | null
  dias_horas_entrega: string | null
}

interface Venta {
  fecha_pedido: string
  producto: string | null
  envase: string | null
  litros: number
  total_sin_impuesto: number
  pedido: string | null
  categoria_producto: string | null
  tipo_venta: string | null
}

interface Contacto {
  fecha_hora: string
  tipo: string
  vendedor: string
  notas: string | null
}

interface Deudor {
  deuda_vencida: number | null
  saldo_total: number | null
  barriles_adeudados: number | null
  ultimo_pago: string | null
  deuda_menor_14_dias: number | null
  deuda_entre_15_29_dias: number | null
  deuda_entre_30_44_dias: number | null
  deuda_entre_45_59_dias: number | null
  deuda_entre_60_89_dias: number | null
  deuda_mas_90_dias: number | null
}

interface Props {
  cliente: Cliente
  ventas: Venta[]
  contactos: Contacto[]
  deudor: Deudor | null
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function formatFecha(s: string) {
  const d = new Date(s)
  return `${d.getDate()} ${MESES[d.getMonth()]} ${d.getFullYear()}`
}

function formatPeso(n: number) {
  return '$' + Math.round(n).toLocaleString('es-CL')
}

function InfoRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | null | number }) {
  if (!value && value !== 0) return null
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
      <span style={{ color: '#666', flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div>
        <p style={{ fontSize: 10, color: '#555', fontWeight: 600, marginBottom: 2 }}>{label}</p>
        <p style={{ fontSize: 13, color: '#eee' }}>{String(value)}</p>
      </div>
    </div>
  )
}

export default function ClienteDetalleClient({ cliente, ventas, contactos, deudor }: Props) {
  const router = useRouter()
  const [tab, setTab] = useState<'info' | 'ventas' | 'contactos'>('info')

  // Agrupar ventas por fecha → pedidos
  const pedidosAgrupados = useMemo(() => {
    const map = new Map<string, { fecha: string; pedido: string | null; litros: number; venta: number; productos: Venta[] }>()
    for (const v of ventas) {
      const key = `${v.fecha_pedido}__${v.pedido ?? 'sin-pedido'}`
      if (!map.has(key)) {
        map.set(key, { fecha: v.fecha_pedido, pedido: v.pedido, litros: 0, venta: 0, productos: [] })
      }
      const g = map.get(key)!
      g.litros += v.litros ?? 0
      g.venta += v.total_sin_impuesto ?? 0
      g.productos.push(v)
    }
    return [...map.values()].sort((a, b) => b.fecha.localeCompare(a.fecha))
  }, [ventas])

  const totalLitros = ventas.reduce((s, v) => s + (v.litros ?? 0), 0)
  const totalVenta = ventas.reduce((s, v) => s + (v.total_sin_impuesto ?? 0), 0)

  const vendedorColor = cliente.vendedor === 'Javier Badilla' ? '#F59E0B'
    : cliente.vendedor === 'Carlos Urrejola' ? '#60A5FA'
    : '#A78BFA'

  return (
    <div style={{ padding: '0 0 60px', maxWidth: 720, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 0', marginBottom: 16 }}>
        <button
          onClick={() => router.back()}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#777', fontSize: 13, fontWeight: 600, marginBottom: 16, padding: 0,
          }}
        >
          <ArrowLeft size={16} /> Volver
        </button>

        {/* Client card header */}
        <div style={{
          background: '#141414', border: '1px solid #222', borderRadius: 20,
          padding: '20px', marginBottom: 0,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 style={{ fontSize: 22, fontWeight: 900, color: '#fff', letterSpacing: '-0.5px', lineHeight: 1.2, marginBottom: 4 }}>
                {cliente.nombre_fantasia}
              </h1>
              {cliente.razon_social && cliente.razon_social !== cliente.nombre_fantasia && (
                <p style={{ fontSize: 12, color: '#666' }}>{cliente.razon_social}</p>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                {cliente.categoria && (
                  <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: '#1E1E1E', color: '#888', fontWeight: 600 }}>
                    {cliente.categoria}
                  </span>
                )}
                {cliente.vendedor && (
                  <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: `${vendedorColor}18`, color: vendedorColor, fontWeight: 700 }}>
                    {cliente.vendedor.split(' ')[0]}
                  </span>
                )}
                {cliente.ruta_despacho && (
                  <span style={{ fontSize: 11, padding: '2px 9px', borderRadius: 20, background: 'rgba(212,175,55,0.1)', color: '#D4AF37', fontWeight: 600 }}>
                    Ruta {cliente.ruta_despacho}
                  </span>
                )}
              </div>
            </div>

            {/* WhatsApp */}
            {cliente.telefono && (
              <a
                href={`https://wa.me/${cliente.telefono.replace(/\D/g, '')}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '10px 16px', borderRadius: 12, textDecoration: 'none',
                  background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.25)',
                  color: '#25D366', fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}
              >
                <MessageCircle size={16} />
                WhatsApp
              </a>
            )}
          </div>

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            <div style={{ background: 'rgba(96,165,250,0.08)', border: '1px solid rgba(96,165,250,0.15)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: '#60A5FA', fontWeight: 600, marginBottom: 4 }}>LITROS TOTAL</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{totalLitros.toFixed(1)}</p>
            </div>
            <div style={{ background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: '#34D399', fontWeight: 600, marginBottom: 4 }}>PEDIDOS</p>
              <p style={{ fontSize: 20, fontWeight: 900, color: '#fff' }}>{pedidosAgrupados.length}</p>
            </div>
            <div style={{ background: 'rgba(167,139,250,0.08)', border: '1px solid rgba(167,139,250,0.15)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
              <p style={{ fontSize: 10, color: '#A78BFA', fontWeight: 600, marginBottom: 4 }}>VENTA TOTAL</p>
              <p style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>{formatPeso(totalVenta)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ padding: '0 16px', marginBottom: 16 }}>
        <div style={{ display: 'flex', background: '#141414', borderRadius: 12, padding: 4, border: '1px solid #222', gap: 4 }}>
          {([
            { key: 'info', label: 'Información' },
            { key: 'ventas', label: `Ventas (${pedidosAgrupados.length})` },
            { key: 'contactos', label: `Contactos (${contactos.length})` },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              style={{
                flex: 1, padding: '8px 0', borderRadius: 9, fontSize: 12, fontWeight: 700,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: tab === t.key ? '#D4AF37' : 'transparent',
                color: tab === t.key ? '#080808' : '#666',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ padding: '0 16px' }}>

        {/* INFO */}
        {tab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Deuda */}
            {deudor && (
              <div style={{
                background: '#141414',
                border: `1px solid ${(deudor.deuda_vencida ?? 0) > 0 ? 'rgba(239,68,68,0.4)' : '#222'}`,
                borderTop: `3px solid ${(deudor.deuda_vencida ?? 0) > 0 ? '#EF4444' : '#555'}`,
                borderRadius: 16,
                padding: '16px',
              }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.08em', marginBottom: 12 }}>CUENTA CORRIENTE</p>

                {/* KPI row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 14 }}>
                  <div style={{
                    background: (deudor.deuda_vencida ?? 0) > 0 ? 'rgba(239,68,68,0.08)' : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${(deudor.deuda_vencida ?? 0) > 0 ? 'rgba(239,68,68,0.2)' : 'rgba(255,255,255,0.06)'}`,
                    borderRadius: 10, padding: '10px 12px',
                  }}>
                    <p style={{ fontSize: 10, color: (deudor.deuda_vencida ?? 0) > 0 ? '#F87171' : '#666', fontWeight: 600, marginBottom: 4 }}>DEUDA VENCIDA</p>
                    <p style={{ fontSize: 16, fontWeight: 900, color: (deudor.deuda_vencida ?? 0) > 0 ? '#EF4444' : '#aaa' }}>
                      {formatPeso(deudor.deuda_vencida ?? 0)}
                    </p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                    <p style={{ fontSize: 10, color: '#666', fontWeight: 600, marginBottom: 4 }}>SALDO TOTAL</p>
                    <p style={{ fontSize: 16, fontWeight: 900, color: '#eee' }}>
                      {formatPeso(deudor.saldo_total ?? 0)}
                    </p>
                  </div>
                  <div style={{ background: 'rgba(212,175,55,0.06)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: 10, padding: '10px 12px' }}>
                    <p style={{ fontSize: 10, color: '#D4AF37', fontWeight: 600, marginBottom: 4 }}>BARRILES ADEUDADOS</p>
                    <p style={{ fontSize: 16, fontWeight: 900, color: '#eee' }}>
                      {(deudor.barriles_adeudados ?? 0).toFixed(1)}
                    </p>
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '10px 12px' }}>
                    <p style={{ fontSize: 10, color: '#666', fontWeight: 600, marginBottom: 4 }}>ÚLTIMO PAGO</p>
                    <p style={{ fontSize: 13, fontWeight: 700, color: '#aaa' }}>
                      {deudor.ultimo_pago ? (() => {
                        const [y, m, d] = deudor.ultimo_pago!.substring(0, 10).split('-').map(Number)
                        return `${d} ${MESES[m - 1]} ${y}`
                      })() : '—'}
                    </p>
                  </div>
                </div>

                {/* Aging breakdown */}
                {[
                  { label: '0–14 días', value: deudor.deuda_menor_14_dias },
                  { label: '15–29 días', value: deudor.deuda_entre_15_29_dias },
                  { label: '30–44 días', value: deudor.deuda_entre_30_44_dias },
                  { label: '45–59 días', value: deudor.deuda_entre_45_59_dias },
                  { label: '60–89 días', value: deudor.deuda_entre_60_89_dias },
                  { label: '+90 días', value: deudor.deuda_mas_90_dias },
                ].some(r => (r.value ?? 0) > 0) && (
                  <div>
                    <p style={{ fontSize: 10, color: '#444', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 6 }}>ANTIGÜEDAD DE DEUDA</p>
                    {[
                      { label: '0–14 días', value: deudor.deuda_menor_14_dias },
                      { label: '15–29 días', value: deudor.deuda_entre_15_29_dias },
                      { label: '30–44 días', value: deudor.deuda_entre_30_44_dias },
                      { label: '45–59 días', value: deudor.deuda_entre_45_59_dias },
                      { label: '60–89 días', value: deudor.deuda_entre_60_89_dias },
                      { label: '+90 días', value: deudor.deuda_mas_90_dias },
                    ].map((row, i) => (
                      (row.value ?? 0) > 0 && (
                        <div key={i} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          padding: '5px 0',
                          borderBottom: '1px solid rgba(255,255,255,0.04)',
                        }}>
                          <span style={{ fontSize: 12, color: '#666' }}>{row.label}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#EF4444' }}>{formatPeso(row.value ?? 0)}</span>
                        </div>
                      )
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Contacto */}
            <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 16, padding: '16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.08em', marginBottom: 10 }}>CONTACTO</p>
              <InfoRow icon={<Phone size={13} />} label="Teléfono" value={cliente.telefono} />
              <InfoRow icon={<Mail size={13} />} label="Email" value={cliente.email} />
              <InfoRow icon={<User size={13} />} label="Contacto" value={cliente.contacto} />
              {cliente.email && (
                <div style={{ marginTop: 10 }}>
                  <a
                    href={`mailto:${cliente.email}`}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '7px 14px', borderRadius: 10, textDecoration: 'none',
                      background: 'rgba(129,140,248,0.12)', border: '1px solid rgba(129,140,248,0.2)',
                      color: '#818cf8', fontSize: 12, fontWeight: 700,
                    }}
                  >
                    <Mail size={13} /> Enviar email
                  </a>
                </div>
              )}
            </div>

            {/* Dirección */}
            <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 16, padding: '16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.08em', marginBottom: 10 }}>DIRECCIÓN</p>
              <InfoRow icon={<MapPin size={13} />} label="Dirección" value={cliente.direccion} />
              <InfoRow icon={<MapPin size={13} />} label="Localidad" value={cliente.localidad} />
              <InfoRow icon={<MapPin size={13} />} label="Provincia" value={cliente.provincia} />
              <InfoRow icon={<Truck size={13} />} label="Dirección de entrega" value={cliente.direccion_entrega} />
              <InfoRow icon={<MapPin size={13} />} label="Localidad de entrega" value={cliente.localidad_entrega} />
              <InfoRow icon={<Clock size={13} />} label="Días/Horario de entrega" value={cliente.dias_horas_entrega} />
            </div>

            {/* Comercial */}
            <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 16, padding: '16px' }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.08em', marginBottom: 10 }}>DATOS COMERCIALES</p>
              <InfoRow icon={<Tag size={13} />} label="RUT" value={cliente.rut} />
              <InfoRow icon={<Tag size={13} />} label="Código de cliente" value={cliente.codigo_cliente} />
              <InfoRow icon={<Tag size={13} />} label="Tipo" value={cliente.tipo} />
              <InfoRow icon={<Tag size={13} />} label="Giro" value={cliente.giro} />
              <InfoRow icon={<FileText size={13} />} label="Condición de venta" value={cliente.condicion_venta} />
              <InfoRow icon={<FileText size={13} />} label="Lista de precios" value={cliente.lista_precios} />
              <InfoRow icon={<CreditCard size={13} />} label="Días de pago" value={cliente.dias_pago ? `${cliente.dias_pago} días` : null} />
              <InfoRow icon={<DollarSign size={13} />} label="Límite cta. corriente" value={cliente.limite_cta_cte ? formatPeso(cliente.limite_cta_cte) : null} />
            </div>

            {/* Notas */}
            {cliente.notas && (
              <div style={{ background: '#141414', border: '1px solid #222', borderRadius: 16, padding: '16px' }}>
                <p style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: '0.08em', marginBottom: 8 }}>NOTAS</p>
                <p style={{ fontSize: 13, color: '#ccc', lineHeight: 1.5 }}>{cliente.notas}</p>
              </div>
            )}
          </div>
        )}

        {/* VENTAS */}
        {tab === 'ventas' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {pedidosAgrupados.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#555' }}>
                <ShoppingBag size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: 14 }}>Sin ventas registradas</p>
              </div>
            ) : pedidosAgrupados.map((pedido, i) => (
              <div key={i} style={{ background: '#141414', border: '1px solid #222', borderRadius: 14, overflow: 'hidden' }}>
                {/* Pedido header */}
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #1A1A1A', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <Calendar size={12} style={{ color: '#D4AF37' }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{formatFecha(pedido.fecha)}</span>
                    </div>
                    {pedido.pedido && (
                      <span style={{ fontSize: 10, color: '#555' }}>Pedido #{pedido.pedido}</span>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#60A5FA' }}>{pedido.litros.toFixed(1)} L</p>
                    <p style={{ fontSize: 11, color: '#888' }}>{formatPeso(pedido.venta)}</p>
                  </div>
                </div>
                {/* Productos */}
                <div style={{ padding: '8px 16px 12px' }}>
                  {pedido.productos.map((p, j) => (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: j < pedido.productos.length - 1 ? '1px solid #1A1A1A' : 'none' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, color: '#ddd', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.producto}</p>
                        {p.envase && <p style={{ fontSize: 10, color: '#555' }}>{p.envase}</p>}
                      </div>
                      <div style={{ display: 'flex', gap: 10, flexShrink: 0, marginLeft: 10 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: '#60A5FA' }}>{p.litros.toFixed(2)} L</span>
                        <span style={{ fontSize: 11, color: '#888' }}>{formatPeso(p.total_sin_impuesto)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CONTACTOS */}
        {tab === 'contactos' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {contactos.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 0', color: '#555' }}>
                <MessageCircle size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <p style={{ fontSize: 14 }}>Sin contactos registrados</p>
              </div>
            ) : contactos.map((c, i) => (
              <div key={i} style={{ background: '#141414', border: '1px solid #222', borderRadius: 12, padding: '12px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: c.notas ? 6 : 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <MessageCircle size={12} style={{ color: '#25D366' }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff' }}>{c.tipo}</span>
                    <span style={{ fontSize: 11, color: '#555' }}>· {c.vendedor.split(' ')[0]}</span>
                  </div>
                  <span style={{ fontSize: 11, color: '#555' }}>{formatFecha(c.fecha_hora)}</span>
                </div>
                {c.notas && <p style={{ fontSize: 12, color: '#888', marginTop: 4 }}>{c.notas}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
