'use client'

import { useState, useMemo } from 'react'
import { Search, Plus, ChevronRight, MapPin, X } from 'lucide-react'
import { C, TAP, btnPrimario, cardStyle } from '../theme'

export interface ClienteExistente {
  nombre_fantasia: string
  categoria_negocio: string | null
  localidad: string | null
  lat?: number | null
  lng?: number | null
}

export interface NuevoClienteDetalle {
  direccion: string
  lat: number | null
  lng: number | null
  contacto: string
  rut: string
}

/**
 * Paso 1 — ¿a quién le vendo?
 *
 * Antes esto era una pantalla con tarjetas grandes por cliente, tabs de
 * canal y un formulario de alta separado. Ahora es una sola lista buscable:
 * el vendedor escribe dos letras y toca. Crear un cliente nuevo es un botón
 * que aparece dentro de la misma búsqueda cuando no hay coincidencia, así
 * no hay que decidir "existente o nuevo" ANTES de buscar, que era el paso
 * que más trababa a la gente.
 */
export default function PasoCliente({ clientes, onConfirmar }: {
  clientes: ClienteExistente[]
  onConfirmar: (nombre: string, esNuevo: boolean, canal: string, detalle?: NuevoClienteDetalle) => void
}) {
  const [busca, setBusca] = useState('')
  const [creando, setCreando] = useState(false)
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [direccion, setDireccion] = useState('')
  const [contacto, setContacto] = useState('')
  const [rut, setRut] = useState('')

  const q = busca.trim().toLowerCase()
  const filtrados = useMemo(() => {
    if (!q) return clientes.slice(0, 40)
    return clientes
      .filter(c =>
        c.nombre_fantasia.toLowerCase().includes(q) ||
        (c.localidad ?? '').toLowerCase().includes(q)
      )
      .slice(0, 40)
  }, [clientes, q])

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
        {q ? `Crear "${busca.trim()}"` : 'Cliente nuevo'}
      </button>

      {filtrados.length === 0 ? (
        <p style={{ textAlign: 'center', fontSize: 13, color: C.muted, padding: '24px 0' }}>
          Sin coincidencias. Puedes crearlo con el botón de arriba.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtrados.map(c => (
            <button
              key={c.nombre_fantasia}
              onClick={() => onConfirmar(c.nombre_fantasia, false, c.categoria_negocio ?? '')}
              style={{
                ...cardStyle, padding: '12px 14px', cursor: 'pointer', textAlign: 'left',
                display: 'flex', alignItems: 'center', gap: 10, minHeight: 58,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14.5, fontWeight: 700, color: C.text, lineHeight: 1.3 }}>
                  {c.nombre_fantasia}
                </p>
                {(c.localidad || c.categoria_negocio) && (
                  <p style={{ fontSize: 11.5, color: C.muted, marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                    {c.localidad && <><MapPin size={11} />{c.localidad}</>}
                    {c.localidad && c.categoria_negocio ? ' · ' : ''}
                    {c.categoria_negocio}
                  </p>
                )}
              </div>
              <ChevronRight size={17} color={C.faint} style={{ flexShrink: 0 }} />
            </button>
          ))}
        </div>
      )}
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
