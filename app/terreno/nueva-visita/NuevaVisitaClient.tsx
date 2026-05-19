'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  MapPin, Camera, CheckCircle, XCircle, ChevronLeft,
  Search, Plus, AlertTriangle, ShoppingCart, Minus, Package,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { AppUser } from '@/lib/auth'

const T = '#10B981'
const T_DIM = 'rgba(16,185,129,0.12)'
const T_BORDER = 'rgba(16,185,129,0.25)'

// ─── Types ────────────────────────────────────────────────────

interface ClienteExistente {
  nombre_fantasia: string
  categoria_negocio: string | null
  localidad: string | null
}

interface Producto {
  producto: string
  categoria_producto: string | null
  envase: string | null
}

interface FotoSlot { label: string; key: 'exterior' | 'exhibicion' | 'competencia'; emoji: string }
const FOTO_SLOTS: FotoSlot[] = [
  { label: 'Exterior', key: 'exterior', emoji: '🏪' },
  { label: 'Exhibición', key: 'exhibicion', emoji: '🍺' },
  { label: 'Competencia', key: 'competencia', emoji: '🔍' },
]

const MOTIVOS_SIN_VENTA = [
  'Ya compró esta semana',
  'No había encargado',
  'Precio no convenció',
  'Sin stock del cliente',
  'Local cerrado',
  'Otro motivo',
]

interface ItemCarrito { producto: string; categoria: string; envase: string; cantidad: number; precio: number }

interface Props {
  vendedor: AppUser
  clientesExistentes: ClienteExistente[]
  catalogoProductos: Producto[]
}

// ─── Step indicator ───────────────────────────────────────────

function StepBar({ paso, total }: { paso: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '0 20px' }}>
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i < paso ? T : 'rgba(255,255,255,0.1)',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  )
}

// ─── Paso 1: Selección de cliente ────────────────────────────

function Paso1Cliente({
  clientes, onConfirmar,
}: {
  clientes: ClienteExistente[]
  onConfirmar: (nombre: string, esNuevo: boolean, canal: string) => void
}) {
  const [tab, setTab] = useState<'existente' | 'nuevo'>('existente')
  const [query, setQuery] = useState('')
  const [seleccionado, setSeleccionado] = useState<ClienteExistente | null>(null)

  // Nuevo cliente form
  const [nombre, setNombre] = useState('')
  const [canal, setCanal] = useState('')
  const [direccion, setDireccion] = useState('')
  const [contacto, setContacto] = useState('')
  const [rut, setRut] = useState('')

  const filtrados = query.length > 1
    ? clientes.filter(c => c.nombre_fantasia.toLowerCase().includes(query.toLowerCase())).slice(0, 12)
    : clientes.slice(0, 8)

  const canalesNegocio = ['Bar', 'Minimarket', 'Cafetería', 'Botillería', 'Almacén', 'Restaurante', 'Supermercado', 'Distribuidor', 'Actividades Turísticas', 'Cliente Directo', 'Otros']

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', margin: '16px 16px 0', borderRadius: 12, background: '#1C1C1C', padding: 4, gap: 4 }}>
        {(['existente', 'nuevo'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSeleccionado(null) }} style={{
            flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
            background: tab === t ? T : 'transparent',
            color: tab === t ? '#080808' : 'var(--muted)',
            transition: 'all 0.15s',
          }}>
            {t === 'existente' ? '🔍 Cliente Existente' : '➕ Cliente Nuevo'}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 0' }}>

        {tab === 'existente' ? (
          <>
            {/* Buscador */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={16} color="var(--muted)" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={query}
                onChange={e => { setQuery(e.target.value); setSeleccionado(null) }}
                placeholder="Buscar cliente..."
                style={{
                  width: '100%', padding: '13px 14px 13px 40px', borderRadius: 12,
                  background: '#1C1C1C', border: `1px solid ${seleccionado ? T_BORDER : 'rgba(255,255,255,0.08)'}`,
                  color: '#F4EEDF', fontSize: 15, outline: 'none',
                }}
              />
            </div>
            {/* Lista */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {filtrados.map(c => (
                <div key={c.nombre_fantasia} onClick={() => setSeleccionado(c)} style={{
                  padding: '13px 14px', borderRadius: 12, cursor: 'pointer',
                  background: seleccionado?.nombre_fantasia === c.nombre_fantasia ? T_DIM : '#1C1C1C',
                  border: `1px solid ${seleccionado?.nombre_fantasia === c.nombre_fantasia ? T_BORDER : 'rgba(255,255,255,0.06)'}`,
                  display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.1s',
                }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: 9, background: T_DIM,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <span style={{ fontSize: 16 }}>🏪</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.nombre_fantasia}
                    </p>
                    <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {[c.categoria_negocio, c.localidad].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {seleccionado?.nombre_fantasia === c.nombre_fantasia && (
                    <CheckCircle size={18} color={T} />
                  )}
                </div>
              ))}
            </div>
          </>
        ) : (
          /* Formulario cliente nuevo */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              { label: 'Nombre de fantasía *', value: nombre, onChange: setNombre, placeholder: 'Ej: Bar El Cóndor' },
              { label: 'Dirección *', value: direccion, onChange: setDireccion, placeholder: 'Calle, número' },
              { label: 'Contacto / Teléfono', value: contacto, onChange: setContacto, placeholder: '+56 9 ...' },
              { label: 'RUT (opcional)', value: rut, onChange: setRut, placeholder: '12.345.678-9' },
            ].map(f => (
              <div key={f.label}>
                <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                  {f.label}
                </label>
                <input value={f.value} onChange={e => f.onChange(e.target.value)} placeholder={f.placeholder}
                  style={{ width: '100%', padding: '13px 14px', borderRadius: 12, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: '#F4EEDF', fontSize: 15, outline: 'none' }}
                />
              </div>
            ))}
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>
                Canal de venta *
              </label>
              <select value={canal} onChange={e => setCanal(e.target.value)}
                style={{ width: '100%', padding: '13px 14px', borderRadius: 12, background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)', color: canal ? '#F4EEDF' : 'var(--muted)', fontSize: 15, outline: 'none' }}>
                <option value="">Seleccionar canal...</option>
                {canalesNegocio.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Botón confirmar */}
      <div style={{ padding: '16px 16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <button
          onClick={() => {
            if (tab === 'existente' && seleccionado) {
              onConfirmar(seleccionado.nombre_fantasia, false, seleccionado.categoria_negocio ?? '')
            } else if (tab === 'nuevo' && nombre && canal) {
              onConfirmar(nombre, true, canal)
            }
          }}
          disabled={tab === 'existente' ? !seleccionado : !nombre || !canal}
          style={{
            width: '100%', padding: '17px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
            background: (tab === 'existente' ? !!seleccionado : !!nombre && !!canal) ? T : 'rgba(255,255,255,0.06)',
            color: (tab === 'existente' ? !!seleccionado : !!nombre && !!canal) ? '#080808' : 'var(--muted)',
            fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px', transition: 'all 0.2s',
          }}
        >
          Confirmar cliente →
        </button>
      </div>
    </div>
  )
}

// ─── Paso 2: Check-in GPS + Fotos ────────────────────────────

function Paso2Checkin({
  onConfirmar,
}: {
  onConfirmar: (coords: { lat: number; lng: number; addr: string }, fotos: Record<string, string>) => void
}) {
  const [gps, setGps] = useState<{ lat: number; lng: number; addr: string } | null>(null)
  const [gpsError, setGpsError] = useState(false)
  const [fotos, setFotos] = useState<Record<string, string>>({})
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      pos => setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, addr: `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}` }),
      () => setGpsError(true),
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }, [])

  function handleFoto(key: string, e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const url = URL.createObjectURL(file)
    setFotos(prev => ({ ...prev, [key]: url }))
  }

  const fotosListas = FOTO_SLOTS.filter(s => fotos[s.key]).length
  const listo = !!gps && fotosListas === 3

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* GPS */}
        <div style={{
          background: '#1C1C1C', borderRadius: 14, padding: '14px 16px', marginBottom: 20,
          border: `1px solid ${gps ? T_BORDER : gpsError ? 'rgba(255,77,77,0.3)' : 'rgba(255,255,255,0.06)'}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10, flexShrink: 0,
              background: gps ? T_DIM : gpsError ? 'rgba(255,77,77,0.1)' : 'rgba(255,255,255,0.04)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <MapPin size={18} color={gps ? T : gpsError ? '#FF4D4D' : 'var(--muted)'} />
            </div>
            <div>
              <p style={{ fontSize: 12, fontWeight: 700, color: gps ? T : gpsError ? '#FF4D4D' : 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {gps ? 'Ubicación capturada' : gpsError ? 'GPS no disponible' : 'Capturando ubicación…'}
              </p>
              {gps && <p style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{gps.addr}</p>}
              {!gps && !gpsError && (
                <div style={{ display: 'flex', gap: 3, marginTop: 4 }}>
                  {[0, 1, 2].map(i => (
                    <div key={i} style={{
                      width: 6, height: 6, borderRadius: '50%', background: T,
                      animation: `pulse-opacity 1.2s ${i * 0.2}s ease-in-out infinite`,
                    }} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Fotos */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 12 }}>
          Fotos requeridas ({fotosListas} / 3)
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginBottom: 8 }}>
          {FOTO_SLOTS.map(slot => (
            <div key={slot.key}>
              <input
                ref={el => { fileRefs.current[slot.key] = el }}
                type="file" accept="image/*" capture="environment"
                style={{ display: 'none' }}
                onChange={e => handleFoto(slot.key, e)}
              />
              <div
                onClick={() => fileRefs.current[slot.key]?.click()}
                style={{
                  aspectRatio: '1', borderRadius: 14, overflow: 'hidden', cursor: 'pointer',
                  background: fotos[slot.key] ? 'transparent' : '#1C1C1C',
                  border: `2px solid ${fotos[slot.key] ? T : 'rgba(255,255,255,0.08)'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                  position: 'relative',
                }}
              >
                {fotos[slot.key] ? (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotos[slot.key]} alt={slot.label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <div style={{
                      position: 'absolute', bottom: 4, right: 4, width: 20, height: 20,
                      background: T, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <CheckCircle size={13} color="#080808" />
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: 22, marginBottom: 4 }}>{slot.emoji}</span>
                    <Camera size={14} color="var(--muted)" />
                  </>
                )}
              </div>
              <p style={{ fontSize: 10, textAlign: 'center', color: fotos[slot.key] ? T : 'var(--muted)', marginTop: 5, fontWeight: 600 }}>
                {slot.label}
              </p>
            </div>
          ))}
        </div>

        {!listo && (
          <p style={{ fontSize: 12, color: 'var(--muted)', textAlign: 'center', marginTop: 8 }}>
            {!gps ? 'Esperando GPS…' : `Falta${fotosListas < 3 ? ` ${3 - fotosListas} foto${3 - fotosListas > 1 ? 's' : ''}` : ''}`}
          </p>
        )}
      </div>

      <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <button
          onClick={() => gps && onConfirmar(gps, fotos)}
          disabled={!listo}
          style={{
            width: '100%', padding: '17px 0', borderRadius: 14, border: 'none', cursor: listo ? 'pointer' : 'not-allowed',
            background: listo ? T : 'rgba(255,255,255,0.06)',
            color: listo ? '#080808' : 'var(--muted)',
            fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px', transition: 'all 0.2s',
          }}
        >
          {listo ? 'Iniciar visita →' : `GPS + ${3 - fotosListas} foto${3 - fotosListas !== 1 ? 's' : ''} pendiente${3 - fotosListas !== 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  )
}

// ─── Paso 3: Vista 360° del cliente ──────────────────────────

function Paso3Vista360({
  clienteNombre, esNuevo, onContinuar,
}: {
  clienteNombre: string; esNuevo: boolean; onContinuar: () => void
}) {
  // Mock financiero — en producción viene de una tabla de deudas/facturas
  const deuda = { total: 124000, facturas: 3, diasAtraso: 15, ultimoPago: '30 Abr' }
  const tienDeuda = deuda.total > 0

  // Mock sugeridos — en producción: top 3 productos más comprados por este cliente
  const sugeridos = [
    { nombre: 'Lager 20L', categoria: 'Cerveza', veces: 8 },
    { nombre: 'Hazy IPA 5L', categoria: 'Cerveza', veces: 5 },
    { nombre: 'Kombucha Maqui 5L', categoria: 'Kombucha', veces: 3 },
  ]

  if (esNuevo) {
    onContinuar()
    return null
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>

        {/* Salud financiera */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>
          Salud financiera
        </p>
        <div style={{
          borderRadius: 14, padding: '16px',
          background: tienDeuda ? 'rgba(255,77,77,0.06)' : 'rgba(16,185,129,0.06)',
          border: `1px solid ${tienDeuda ? 'rgba(255,77,77,0.3)' : T_BORDER}`,
          marginBottom: 20,
        }}>
          {tienDeuda ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <AlertTriangle size={16} color="#FF4D4D" />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#FF4D4D', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Deuda activa
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {[
                  { label: 'Total deuda', value: `$${deuda.total.toLocaleString('es-CL')}`, red: true },
                  { label: 'Facturas', value: `${deuda.facturas} vencidas`, red: false },
                  { label: 'Días atraso', value: `${deuda.diasAtraso} días`, red: true },
                  { label: 'Último pago', value: deuda.ultimoPago, red: false },
                ].map(d => (
                  <div key={d.label} style={{ background: 'rgba(0,0,0,0.2)', borderRadius: 10, padding: '10px 12px' }}>
                    <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 3 }}>{d.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 800, color: d.red ? '#FF4D4D' : '#F4EEDF' }}>{d.value}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <CheckCircle size={18} color={T} />
              <span style={{ fontSize: 14, fontWeight: 700, color: T }}>Al día — sin deuda pendiente</span>
            </div>
          )}
        </div>

        {/* Pedido sugerido */}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1px', textTransform: 'uppercase', marginBottom: 10 }}>
          Pedido sugerido
        </p>
        <div style={{
          background: '#1C1C1C', border: '1px solid rgba(212,175,55,0.2)',
          borderRadius: 14, overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 14px 6px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
            <p style={{ fontSize: 12, color: '#D4AF37', fontWeight: 600 }}>
              Basado en historial de compras de {clienteNombre}
            </p>
          </div>
          {sugeridos.map((p, i) => (
            <div key={p.nombre} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '12px 14px',
              borderBottom: i < sugeridos.length - 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{p.categoria === 'Cerveza' ? '🍺' : '🫧'}</span>
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: '#F4EEDF' }}>{p.nombre}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>Comprado {p.veces}x</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
        <button onClick={onContinuar} style={{
          width: '100%', padding: '17px 0', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: T, color: '#080808', fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px',
        }}>
          Ir al catálogo →
        </button>
      </div>
    </div>
  )
}

// ─── Paso 4: Catálogo + Carrito ───────────────────────────────

function Paso4Catalogo({
  productos, onCerrar,
}: {
  productos: Producto[]
  onCerrar: (carrito: ItemCarrito[], tienVenta: boolean, motivo: string, obs: string) => void
}) {
  const [tabCat, setTabCat] = useState<'Cerveza' | 'Kombucha'>('Cerveza')
  const [carrito, setCarrito] = useState<Map<string, ItemCarrito>>(new Map())
  const [showCierre, setShowCierre] = useState(false)
  const [sinVenta, setSinVenta] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [obs, setObs] = useState('')

  const prodsFiltrados = productos
    .filter(p => (p.categoria_producto ?? '').toLowerCase().includes(tabCat.toLowerCase()))
    .sort((a, b) => (a.producto ?? '').localeCompare(b.producto ?? ''))

  function ajustar(prod: Producto, delta: number) {
    setCarrito(prev => {
      const next = new Map(prev)
      const key = prod.producto
      const actual = next.get(key)?.cantidad ?? 0
      const nueva = actual + delta
      if (nueva <= 0) { next.delete(key); return next }
      next.set(key, {
        producto: prod.producto,
        categoria: prod.categoria_producto ?? '',
        envase: prod.envase ?? '',
        cantidad: nueva,
        precio: 0,
      })
      return next
    })
  }

  const items = Array.from(carrito.values())
  const totalItems = items.reduce((s, i) => s + i.cantidad, 0)

  if (showCierre) {
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          <p style={{ fontSize: 18, fontWeight: 900, color: '#F4EEDF', marginBottom: 4 }}>Cerrar visita</p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 20 }}>
            {items.length > 0 ? `${totalItems} productos en carrito` : 'Carrito vacío'}
          </p>

          {/* Opción venta */}
          {items.length > 0 && (
            <div
              onClick={() => setSinVenta(false)}
              style={{
                borderRadius: 14, padding: '16px', marginBottom: 10, cursor: 'pointer',
                background: !sinVenta ? T_DIM : '#1C1C1C',
                border: `2px solid ${!sinVenta ? T : 'rgba(255,255,255,0.06)'}`,
                display: 'flex', alignItems: 'center', gap: 12,
              }}
            >
              <CheckCircle size={22} color={!sinVenta ? T : 'var(--muted)'} />
              <div>
                <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Venta efectiva</p>
                <p style={{ fontSize: 12, color: 'var(--muted)' }}>Confirmar los {totalItems} productos del carrito</p>
              </div>
            </div>
          )}

          {/* Opción sin venta */}
          <div
            onClick={() => setSinVenta(true)}
            style={{
              borderRadius: 14, padding: '16px', marginBottom: 16, cursor: 'pointer',
              background: sinVenta ? 'rgba(255,77,77,0.06)' : '#1C1C1C',
              border: `2px solid ${sinVenta ? 'rgba(255,77,77,0.4)' : 'rgba(255,255,255,0.06)'}`,
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            <XCircle size={22} color={sinVenta ? '#FF4D4D' : 'var(--muted)'} />
            <div>
              <p style={{ fontSize: 15, fontWeight: 800, color: '#F4EEDF' }}>Visita sin venta</p>
              <p style={{ fontSize: 12, color: 'var(--muted)' }}>Registrar motivo de no cierre</p>
            </div>
          </div>

          {/* Motivos */}
          {sinVenta && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>Motivo</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {MOTIVOS_SIN_VENTA.map(m => (
                  <div key={m} onClick={() => setMotivo(m)} style={{
                    padding: '12px 14px', borderRadius: 10, cursor: 'pointer',
                    background: motivo === m ? 'rgba(255,77,77,0.08)' : '#1C1C1C',
                    border: `1px solid ${motivo === m ? 'rgba(255,77,77,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    fontSize: 14, color: motivo === m ? '#FF4D4D' : '#F4EEDF', fontWeight: motivo === m ? 700 : 400,
                  }}>
                    {m}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.5px', textTransform: 'uppercase', marginBottom: 8 }}>Observaciones (opcional)</p>
            <textarea
              value={obs} onChange={e => setObs(e.target.value)}
              placeholder="Notas adicionales..."
              rows={3}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 12,
                background: '#1C1C1C', border: '1px solid rgba(255,255,255,0.08)',
                color: '#F4EEDF', fontSize: 14, resize: 'none', outline: 'none',
              }}
            />
          </div>
        </div>

        <div style={{ padding: '16px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
          <button
            onClick={() => {
              if (sinVenta && !motivo) return
              onCerrar(items, !sinVenta, motivo, obs)
            }}
            disabled={sinVenta && !motivo}
            style={{
              width: '100%', padding: '17px 0', borderRadius: 14, border: 'none',
              cursor: sinVenta && !motivo ? 'not-allowed' : 'pointer',
              background: sinVenta && !motivo ? 'rgba(255,255,255,0.06)' : T,
              color: sinVenta && !motivo ? 'var(--muted)' : '#080808',
              fontSize: 16, fontWeight: 900, letterSpacing: '-0.3px',
            }}
          >
            Confirmar y finalizar ✓
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Tabs categoría */}
      <div style={{ display: 'flex', margin: '12px 16px 0', borderRadius: 12, background: '#1C1C1C', padding: 4, gap: 4 }}>
        {(['Cerveza', 'Kombucha'] as const).map(cat => (
          <button key={cat} onClick={() => setTabCat(cat)} style={{
            flex: 1, padding: '10px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: tabCat === cat ? T : 'transparent',
            color: tabCat === cat ? '#080808' : 'var(--muted)',
            fontSize: 14, fontWeight: 700, transition: 'all 0.15s',
          }}>
            {cat === 'Cerveza' ? '🍺' : '🫧'} {cat}
          </button>
        ))}
      </div>

      {/* Lista productos */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px' }}>
        {prodsFiltrados.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <Package size={32} color="var(--muted)" style={{ margin: '0 auto 10px' }} />
            <p style={{ color: 'var(--muted)', fontSize: 14 }}>Sin productos en esta categoría</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {prodsFiltrados.map(p => {
              const cant = carrito.get(p.producto)?.cantidad ?? 0
              return (
                <div key={p.producto} style={{
                  background: cant > 0 ? T_DIM : '#1C1C1C',
                  border: `1px solid ${cant > 0 ? T_BORDER : 'rgba(255,255,255,0.06)'}`,
                  borderRadius: 12, padding: '14px 14px',
                  display: 'flex', alignItems: 'center', gap: 10,
                  transition: 'all 0.15s',
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.producto}
                    </p>
                    {p.envase && <p style={{ fontSize: 11, color: 'var(--muted)' }}>{p.envase}</p>}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
                    <button onClick={() => ajustar(p, -1)} style={{
                      width: 36, height: 36, borderRadius: 10, border: 'none', cursor: 'pointer',
                      background: cant > 0 ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.04)',
                      color: '#F4EEDF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Minus size={16} />
                    </button>
                    <span style={{ width: 32, textAlign: 'center', fontSize: 15, fontWeight: 800, color: cant > 0 ? T : 'var(--muted)' }}>
                      {cant}
                    </span>
                    <button onClick={() => ajustar(p, 1)} style={{
                      width: 36, height: 36, borderRadius: 10, cursor: 'pointer',
                      background: T_DIM, border: `1px solid ${T_BORDER}`,
                      color: T, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Carrito flotante */}
      <div style={{ padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button onClick={() => setShowCierre(true)} style={{
          width: '100%', padding: '17px 20px', borderRadius: 14, border: 'none', cursor: 'pointer',
          background: totalItems > 0 ? T : 'rgba(255,255,255,0.06)',
          color: totalItems > 0 ? '#080808' : 'var(--muted)',
          fontSize: 15, fontWeight: 900, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          transition: 'all 0.2s',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ShoppingCart size={18} />
            <span>{totalItems > 0 ? `${totalItems} producto${totalItems > 1 ? 's' : ''}` : 'Carrito vacío'}</span>
          </div>
          <span>{totalItems > 0 ? 'Cerrar visita →' : 'Sin venta →'}</span>
        </button>
      </div>
    </div>
  )
}

// ─── Wizard principal ─────────────────────────────────────────

export default function NuevaVisitaClient({ vendedor, clientesExistentes, catalogoProductos }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [paso, setPaso] = useState(1)
  const [guardando, setGuardando] = useState(false)

  // Estado acumulado
  const [cliente, setCliente] = useState<{ nombre: string; esNuevo: boolean; canal: string } | null>(null)
  const [visitaId, setVisitaId] = useState<string | null>(null)
  const [gps, setGps] = useState<{ lat: number; lng: number; addr: string } | null>(null)

  const totalPasos = cliente?.esNuevo ? 3 : 4

  // Paso 1 → 2: confirmar cliente
  async function onClienteConfirmado(nombre: string, esNuevo: boolean, canal: string) {
    setCliente({ nombre, esNuevo, canal })
    // Crear visita en DB en estado en_progreso
    const { data } = await supabase.from('visitas_terreno').insert({
      vendedor_id: vendedor.id,
      cliente_nombre: nombre,
      es_cliente_nuevo: esNuevo,
      estado: 'en_progreso',
    }).select('id').single()
    if (data) setVisitaId(data.id)
    setPaso(2)
  }

  // Paso 2 → 3: check-in completado
  async function onCheckinConfirmado(coords: { lat: number; lng: number; addr: string }, _fotos: Record<string, string>) {
    setGps(coords)
    if (visitaId) {
      await supabase.from('visitas_terreno').update({
        lat: coords.lat, lng: coords.lng, direccion_gps: coords.addr,
      }).eq('id', visitaId)
    }
    setPaso(3)
  }

  // Paso 3 → 4
  function onVista360Continuar() { setPaso(4) }

  // Paso 4: cerrar visita
  async function onCerrar(items: ItemCarrito[], tienVenta: boolean, motivo: string, obs: string) {
    if (!visitaId) return
    setGuardando(true)
    try {
      const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0)
      await supabase.from('visitas_terreno').update({
        tiene_venta: tienVenta,
        motivo_sin_venta: tienVenta ? null : motivo,
        observaciones: obs || null,
        total_pedido: total,
        estado: 'completada',
        completada_at: new Date().toISOString(),
      }).eq('id', visitaId)

      if (items.length > 0) {
        await supabase.from('visitas_terreno_items').insert(
          items.map(i => ({
            visita_id: visitaId,
            producto: i.producto,
            categoria: i.categoria,
            envase: i.envase,
            cantidad: i.cantidad,
            precio_unit: i.precio,
            subtotal: i.cantidad * i.precio,
          }))
        )
      }
      router.push('/terreno')
    } finally {
      setGuardando(false)
    }
  }

  const pasoLabel = ['', 'Cliente', 'Check-In', cliente?.esNuevo ? 'Catálogo' : 'Vista 360°', 'Catálogo'][paso]

  return (
    <div style={{ minHeight: '100vh', background: '#080808', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{
        background: '#0F0F0F', borderBottom: '1px solid rgba(16,185,129,0.15)',
        padding: '14px 16px 10px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button
            onClick={() => paso > 1 ? setPaso(paso - 1) : router.push('/terreno')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: T, display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 600, padding: 0 }}
          >
            <ChevronLeft size={18} /> {paso === 1 ? 'Cancelar' : 'Atrás'}
          </button>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14, fontWeight: 800, color: '#F4EEDF' }}>
              {cliente ? cliente.nombre : 'Nueva Visita'}
            </p>
            <p style={{ fontSize: 11, color: 'var(--muted)' }}>Paso {paso}/{totalPasos} · {pasoLabel}</p>
          </div>
          <div style={{ width: 60 }} />
        </div>
        <StepBar paso={paso} total={totalPasos} />
      </div>

      {/* Contenido por paso */}
      {paso === 1 && (
        <Paso1Cliente clientes={clientesExistentes} onConfirmar={onClienteConfirmado} />
      )}
      {paso === 2 && (
        <Paso2Checkin onConfirmar={onCheckinConfirmado} />
      )}
      {paso === 3 && !cliente?.esNuevo && (
        <Paso3Vista360 clienteNombre={cliente?.nombre ?? ''} esNuevo={false} onContinuar={onVista360Continuar} />
      )}
      {(paso === 4 || (paso === 3 && cliente?.esNuevo)) && (
        <Paso4Catalogo productos={catalogoProductos} onCerrar={onCerrar} />
      )}

      {guardando && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
        }}>
          <div style={{ background: '#1C1C1C', borderRadius: 16, padding: '24px 32px', textAlign: 'center' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#F4EEDF' }}>Guardando visita…</p>
          </div>
        </div>
      )}
    </div>
  )
}
