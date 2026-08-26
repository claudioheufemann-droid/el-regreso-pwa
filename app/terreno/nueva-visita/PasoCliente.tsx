'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Search, Plus, ChevronRight, MapPin, X, Clock, Repeat, AlertTriangle, Navigation, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatLocalidad } from '@/lib/format'
import { C, TAP, btnPrimario, cardStyle } from '../theme'

export interface ClienteExistente {
  nombre_fantasia: string
  categoria_negocio: string | null
  localidad: string | null
  lat?: number | null
  lng?: number | null
}

/** Cliente con su lat/lng — lo que ya calcula el servidor para cada lista corta. */
export interface ClienteResumen {
  nombre: string
  categoria: string | null
  localidad: string | null
  lat: number | null
  lng: number | null
  /** Sólo en "pendientes": hace cuánto no compra. */
  diasSinComprar?: number | null
  ultimaCompra?: string | null
}

interface ClienteCercano extends ClienteResumen {
  distancia: number
}

export interface NuevoClienteDetalle {
  direccion: string
  lat: number | null
  lng: number | null
  contacto: string
  rut: string
}

function fFecha(iso: string | null): string | null {
  if (!iso) return null
  const [, m, d] = iso.split('-').map(Number)
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${meses[m - 1]}`
}

/** Fila compacta reutilizada por todas las secciones (recientes/frecuentes/
 *  pendientes/cerca/búsqueda) — mismo look, distinto badge a la derecha. */
function FilaCliente({ c, badge, onClick }: {
  c: ClienteResumen | ClienteCercano
  badge?: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...cardStyle, padding: '11px 13px', cursor: 'pointer', textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, width: '100%',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 14, fontWeight: 700, color: C.text, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {c.nombre}
        </p>
        {(c.localidad || c.categoria) && (
          <p style={{ fontSize: 11, color: C.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {c.localidad && <><MapPin size={10} style={{ flexShrink: 0 }} />{formatLocalidad(c.localidad)}</>}
            {c.localidad && c.categoria ? ' · ' : ''}
            {c.categoria}
          </p>
        )}
      </div>
      {badge}
      <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />
    </button>
  )
}

function Seccion({ icon: Icon, titulo, items, render }: {
  icon: React.ComponentType<{ size?: number; color?: string }>
  titulo: string
  items: (ClienteResumen | ClienteCercano)[]
  render: (c: ClienteResumen | ClienteCercano) => React.ReactNode
}) {
  if (items.length === 0) return null
  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{
        fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em',
        marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Icon size={13} color={C.muted} />
        {titulo}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(c => render(c))}
      </div>
    </div>
  )
}

/**
 * Paso 1 — ¿a quién le vendo?
 *
 * Antes recibía TODA la cartera (~600 clientes) y mostraba los primeros 40
 * en orden alfabético cuando no se escribía nada — no priorizaba nada, y la
 * base completa viajaba igual aunque nunca se viera de golpe. Ahora arriba
 * van 4 listas cortas ya priorizadas por el servidor (recientes, cerca,
 * frecuentes, pendientes de visita — máx. 5 cada una) y el buscador consulta
 * Supabase en vivo con debounce, máx. 20 resultados — nunca la cartera
 * entera.
 */
export default function PasoCliente({ recientes, frecuentes, pendientes, onConfirmar }: {
  recientes: ClienteResumen[]
  frecuentes: ClienteResumen[]
  pendientes: ClienteResumen[]
  onConfirmar: (nombre: string, esNuevo: boolean, canal: string, detalle?: NuevoClienteDetalle, coords?: { lat: number; lng: number }) => void
}) {
  const [busca, setBusca] = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [contacto, setContacto] = useState('')
  const [rut, setRut] = useState('')

  // ── Búsqueda en vivo (servidor, no arreglo en memoria) ──────────────────
  const [resultados, setResultados] = useState<ClienteExistente[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ejecutarBusqueda = useCallback(async (q: string) => {
    setBuscando(true)
    const supabase = createClient()
    const termino = q.replace(/[,()]/g, ' ').trim()
    const { data, error } = await supabase
      .from('clientes')
      .select('nombre_fantasia, categoria, localidad, lat, lng')
      .not('nombre_fantasia', 'is', null)
      .or(`nombre_fantasia.ilike.%${termino}%,localidad.ilike.%${termino}%,categoria.ilike.%${termino}%`)
      .order('nombre_fantasia')
      .limit(20)
    if (error) {
      setErrorBusqueda(error.message)
      setResultados([])
    } else {
      setErrorBusqueda(null)
      setResultados((data ?? []).map(c => ({
        nombre_fantasia: c.nombre_fantasia as string,
        categoria_negocio: c.categoria as string | null,
        localidad: c.localidad as string | null,
        lat: c.lat != null ? Number(c.lat) : null,
        lng: c.lng != null ? Number(c.lng) : null,
      })))
    }
    setBuscando(false)
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const q = busca.trim()
    if (q.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResultados(null)
      setErrorBusqueda(null)
      setBuscando(false)
      return
    }
    debounceRef.current = setTimeout(() => { ejecutarBusqueda(q) }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [busca, ejecutarBusqueda])

  // ── Cerca de mí ───────────────────────────────────────────────────────
  const [cercaEstado, setCercaEstado] = useState<'idle' | 'buscando' | 'ok' | 'error'>('idle')
  const [cercanos, setCercanos] = useState<ClienteCercano[]>([])

  function buscarCerca() {
    if (typeof navigator === 'undefined' || !navigator.geolocation) { setCercaEstado('error'); return }
    setCercaEstado('buscando')
    navigator.geolocation.getCurrentPosition(
      pos => {
        fetch(`/api/clientes/cercanos?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&limit=5`)
          .then(r => r.ok ? r.json() : Promise.reject())
          .then((data: ClienteCercano[]) => { setCercanos(data); setCercaEstado('ok') })
          .catch(() => setCercaEstado('error'))
      },
      () => setCercaEstado('error'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  const q = busca.trim()
  const buscandoActivo = q.length >= 2

  if (creando) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <button
            onClick={() => setCreando(false)}
            aria-label="Volver a la búsqueda"
            style={{
              width: TAP, height: TAP, borderRadius: 12, flexShrink: 0, cursor: 'pointer',
              border: `1px solid ${C.line}`, background: C.card,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <X size={17} color={C.muted} />
          </button>
          <div>
            <p style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Cliente nuevo</p>
            <p style={{ fontSize: 12, color: C.muted }}>Sólo el nombre es obligatorio</p>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Campo label="Nombre del local *" value={nuevoNombre} onChange={setNuevoNombre} placeholder="Ej: Bar Central" autoFocus />
          <Campo label="Dirección" value={direccion} onChange={setDireccion} placeholder="Calle y número" />
          <Campo label="Teléfono o contacto" value={contacto} onChange={setContacto} placeholder="+56 9 ..." tipo="tel" />
          <Campo label="RUT" value={rut} onChange={setRut} placeholder="76.123.456-7" />
        </div>

        <button
          onClick={() => {
            const n = nuevoNombre.trim()
            if (!n) return
            onConfirmar(n, true, '', { direccion: direccion.trim(), lat: null, lng: null, contacto: contacto.trim(), rut: rut.trim() })
          }}
          disabled={!nuevoNombre.trim()}
          style={{
            ...btnPrimario, marginTop: 14,
            background: nuevoNombre.trim() ? C.hero : C.line,
            color: nuevoNombre.trim() ? '#fff' : C.faint,
            cursor: nuevoNombre.trim() ? 'pointer' : 'not-allowed',
          }}
        >
          Empezar la venta
        </button>
      </div>
    )
  }

  return (
    <div>
      <div style={{ position: 'relative', marginBottom: 12 }}>
        <Search size={17} color={C.faint} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={busca}
          onChange={e => setBusca(e.target.value)}
          placeholder="Buscar cliente…"
          autoFocus
          style={{
            width: '100%', minHeight: 50, paddingLeft: 40, paddingRight: 14,
            borderRadius: 14, border: `1px solid ${C.line}`, background: C.card,
            fontSize: 16, color: C.text, outline: 'none',
          }}
        />
      </div>

      <button
        onClick={() => { setNuevoNombre(busca.trim()); setCreando(true) }}
        style={{
          width: '100%', minHeight: TAP, borderRadius: 12, marginBottom: 14, cursor: 'pointer',
          border: `1px dashed ${C.blue}`, background: C.blueSoft, color: C.blue,
          fontSize: 14, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
        }}
      >
        <Plus size={16} />
        {q ? `Crear "${q}"` : 'Cliente nuevo'}
      </button>

      {buscandoActivo ? (
        // ── Resultados de búsqueda: reemplazan las secciones mientras se escribe ──
        buscando ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[0, 1, 2].map(i => (
              <div key={i} style={{ ...cardStyle, height: 56, background: C.line, opacity: 0.5 }} />
            ))}
          </div>
        ) : errorBusqueda ? (
          <div style={{ ...cardStyle, padding: 20, textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: C.red, marginBottom: 10 }}>No pudimos buscar clientes.</p>
            <button
              onClick={() => ejecutarBusqueda(q)}
              style={{ minHeight: 40, padding: '0 16px', borderRadius: 100, border: 'none', cursor: 'pointer', background: C.blueSoft, color: C.blue, fontSize: 13, fontWeight: 700 }}
            >
              Reintentar
            </button>
          </div>
        ) : !resultados || resultados.length === 0 ? (
          <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, padding: '24px 0' }}>
            Sin coincidencias. Puedes crearlo con el botón de arriba.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: C.muted, marginBottom: 2 }}>
              {resultados.length} resultado{resultados.length !== 1 ? 's' : ''}{resultados.length === 20 ? ' (primeros 20)' : ''}
            </p>
            {resultados.map(c => (
              <FilaCliente
                key={c.nombre_fantasia}
                c={{ nombre: c.nombre_fantasia, categoria: c.categoria_negocio, localidad: c.localidad, lat: c.lat ?? null, lng: c.lng ?? null }}
                onClick={() => onConfirmar(c.nombre_fantasia, false, c.categoria_negocio ?? '', undefined, c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : undefined)}
              />
            ))}
          </div>
        )
      ) : (
        // ── Sin búsqueda: las 4 secciones priorizadas ──
        <>
          <Seccion icon={Clock} titulo="Recientes" items={recientes} render={c => (
            <FilaCliente key={c.nombre} c={c} onClick={() => onConfirmar(c.nombre, false, c.categoria ?? '', undefined, c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : undefined)} />
          )} />

          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 800, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Navigation size={13} color={C.muted} />
              Cerca de mí
            </p>
            {cercaEstado === 'idle' && (
              <button
                onClick={buscarCerca}
                style={{
                  ...cardStyle, width: '100%', cursor: 'pointer', padding: '12px 13px', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 10, minHeight: 56,
                }}
              >
                <span style={{ width: 32, height: 32, borderRadius: 10, background: C.blueSoft, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <MapPin size={16} color={C.blue} />
                </span>
                <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Ver quién tienes cerca ahora</span>
              </button>
            )}
            {cercaEstado === 'buscando' && (
              <div style={{ ...cardStyle, padding: '16px 13px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <Loader2 size={16} color={C.blue} style={{ animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: 13, color: C.muted }}>Ubicando…</span>
              </div>
            )}
            {cercaEstado === 'error' && (
              <div style={{ ...cardStyle, padding: '14px 13px' }}>
                <p style={{ fontSize: 12.5, color: C.muted, marginBottom: 8 }}>No pudimos obtener tu ubicación.</p>
                <button onClick={buscarCerca} style={{ minHeight: 36, padding: '0 14px', borderRadius: 100, border: 'none', cursor: 'pointer', background: C.blueSoft, color: C.blue, fontSize: 12.5, fontWeight: 700 }}>
                  Reintentar
                </button>
              </div>
            )}
            {cercaEstado === 'ok' && cercanos.length === 0 && (
              <p style={{ fontSize: 12.5, color: C.muted, padding: '4px 2px' }}>Nadie registrado a menos de 500 m.</p>
            )}
            {cercaEstado === 'ok' && cercanos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cercanos.map(c => (
                  <FilaCliente
                    key={c.nombre}
                    c={c}
                    badge={
                      <span style={{ fontSize: 11.5, fontWeight: 800, color: C.blue, flexShrink: 0, whiteSpace: 'nowrap' }}>
                        {c.distancia < 1000 ? `${Math.round(c.distancia)} m` : `${(c.distancia / 1000).toFixed(1)} km`}
                      </span>
                    }
                    onClick={() => onConfirmar(c.nombre, false, c.categoria ?? '', undefined, c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : undefined)}
                  />
                ))}
              </div>
            )}
          </div>

          <Seccion icon={Repeat} titulo="Frecuentes" items={frecuentes} render={c => (
            <FilaCliente key={c.nombre} c={c} onClick={() => onConfirmar(c.nombre, false, c.categoria ?? '', undefined, c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : undefined)} />
          )} />

          <Seccion icon={AlertTriangle} titulo="Pendientes de visita" items={pendientes} render={c => (
            <FilaCliente
              key={c.nombre}
              c={c}
              badge={c.diasSinComprar != null ? (
                <span style={{ fontSize: 10.5, fontWeight: 700, color: C.amber, flexShrink: 0, whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {c.diasSinComprar}d sin comprar{c.ultimaCompra && <><br /><span style={{ color: C.faint, fontWeight: 500 }}>{fFecha(c.ultimaCompra)}</span></>}
                </span>
              ) : undefined}
              onClick={() => onConfirmar(c.nombre, false, c.categoria ?? '', undefined, c.lat != null && c.lng != null ? { lat: c.lat, lng: c.lng } : undefined)}
            />
          )} />

          {recientes.length === 0 && frecuentes.length === 0 && pendientes.length === 0 && cercaEstado === 'idle' && (
            <p style={{ textAlign: 'center', fontSize: 12.5, color: C.faint, padding: '12px 0' }}>
              Escribe arriba para buscar en toda tu cartera.
            </p>
          )}
        </>
      )}
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Campo({ label, value, onChange, placeholder, tipo = 'text', autoFocus = false }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; tipo?: string; autoFocus?: boolean
}) {
  return (
    <label style={{ display: 'block' }}>
      <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 5 }}>{label}</span>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        type={tipo}
        autoFocus={autoFocus}
        style={{
          width: '100%', minHeight: 46, padding: '0 12px', borderRadius: 11,
          border: `1px solid ${C.line}`, background: C.bg, fontSize: 16, color: C.text, outline: 'none',
        }}
      />
    </label>
  )
}
