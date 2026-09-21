'use client'

import { useMemo, useState } from 'react'
import { ChevronLeft, CheckCircle2, User, Users, UserX, Lock, Package, FileText, Eye, DollarSign, CircleDollarSign, ThumbsDown, CheckCheck, MoreHorizontal, MessageCircle, Phone, Send, CornerDownLeft, Ban } from 'lucide-react'
import { C, TAP, cardStyle, btnPrimario } from '../theme'

export type Contacto = 'encargado' | 'otra_persona' | 'ausente' | 'local_cerrado'
export type ResultadoVisita = 'pedido_confirmado' | 'cotizacion_solicitada' | 'evaluar_propuesta' | 'tiene_stock' | 'precio' | 'deuda' | 'no_interesado' | 'gestion_resuelta' | 'otro'
export type ProximoPaso = 'whatsapp' | 'llamada' | 'enviar_cotizacion' | 'volver' | 'sin_pendiente'

export interface CierrePayloadLlegada {
  contacto: Contacto
  resultado: ResultadoVisita | null
  proximoPaso: ProximoPaso
  proximoPasoFecha: string | null
  nota: string
}

const CONTACTOS: { k: Contacto; l: string; Icon: typeof User }[] = [
  { k: 'encargado', l: 'Encargado', Icon: User },
  { k: 'otra_persona', l: 'Otra persona', Icon: Users },
  { k: 'ausente', l: 'Ausente', Icon: UserX },
  { k: 'local_cerrado', l: 'Local cerrado', Icon: Lock },
]

const RESULTADOS: { k: ResultadoVisita; l: string; Icon: typeof Package }[] = [
  { k: 'tiene_stock', l: 'Tiene stock', Icon: Package },
  { k: 'pedido_confirmado', l: 'Pedido', Icon: FileText },
  { k: 'cotizacion_solicitada', l: 'Cotización', Icon: DollarSign },
  { k: 'evaluar_propuesta', l: 'Evaluar propuesta', Icon: Eye },
  { k: 'precio', l: 'Precio', Icon: CircleDollarSign },
  { k: 'deuda', l: 'Deuda', Icon: CircleDollarSign },
  { k: 'no_interesado', l: 'No interesado', Icon: ThumbsDown },
  { k: 'gestion_resuelta', l: 'Gestión resuelta', Icon: CheckCheck },
  { k: 'otro', l: 'Otro', Icon: MoreHorizontal },
]

const PROXIMOS_PASOS: { k: ProximoPaso; l: string; Icon: typeof MessageCircle }[] = [
  { k: 'whatsapp', l: 'WhatsApp', Icon: MessageCircle },
  { k: 'llamada', l: 'Llamar', Icon: Phone },
  { k: 'enviar_cotizacion', l: 'Enviar cotización', Icon: Send },
  { k: 'volver', l: 'Volver', Icon: CornerDownLeft },
  { k: 'sin_pendiente', l: 'Sin pendiente', Icon: Ban },
]

interface Props {
  clienteNombre: string
  horaLlegada: string | null
  guardando: boolean
  onVolver: () => void
  onFinalizar: (p: CierrePayloadLlegada) => void
}

/**
 * Cierre de visita — sin selección de productos. Si el resultado exige un
 * pedido/cotización real, quien llama a onFinalizar (NuevaVisitaClient)
 * decide pasar al catálogo antes de guardar; este componente sólo captura
 * la decisión, nunca construye el carrito.
 */
export default function FinalizarVisita({ clienteNombre, horaLlegada, guardando, onVolver, onFinalizar }: Props) {
  const [contacto, setContacto] = useState<Contacto | null>(null)
  const [resultado, setResultado] = useState<ResultadoVisita | null>(null)
  const [proximoPaso, setProximoPaso] = useState<ProximoPaso | null>(null)
  const [fecha, setFecha] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 1)
    return d.toISOString().split('T')[0]
  })
  const [nota, setNota] = useState('')

  const esCerradoOAusente = contacto === 'ausente' || contacto === 'local_cerrado'
  const necesitaNotaObligatoria = resultado === 'otro'
  const puedeGuardar = !!contacto
    && (esCerradoOAusente || !!resultado)
    && (!necesitaNotaObligatoria || nota.trim().length > 0)

  const esPedidoOCotizacion = resultado === 'pedido_confirmado' || resultado === 'cotizacion_solicitada'

  const resultadosVisibles = useMemo(() => esCerradoOAusente ? [] : RESULTADOS, [esCerradoOAusente])

  function guardar() {
    if (!contacto || !puedeGuardar) return
    onFinalizar({
      contacto,
      resultado: esCerradoOAusente ? null : resultado,
      proximoPaso: proximoPaso ?? 'sin_pendiente',
      proximoPasoFecha: proximoPaso && proximoPaso !== 'sin_pendiente' ? fecha : null,
      nota: nota.trim(),
    })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <button
          onClick={onVolver}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 38, cursor: 'pointer',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
            padding: '7px 14px 7px 10px', color: C.blue, fontSize: 13, fontWeight: 700,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>
      </div>

      <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>FINALIZAR VISITA</p>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, letterSpacing: '-0.4px', lineHeight: 1.2, marginBottom: 10 }}>
        {clienteNombre}
      </h1>

      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, background: C.verdeLlegadaSoft, color: C.verdeLlegada,
        borderRadius: 100, padding: '6px 12px', fontSize: 12.5, fontWeight: 800, marginBottom: 18,
      }}>
        <CheckCircle2 size={14} />
        Llegada verificada{horaLlegada ? ` · ${horaLlegada}` : ''}
      </div>

      <Seccion titulo="¿Con quién hablaste?">
        <Grid2>
          {CONTACTOS.map(({ k, l, Icon }) => (
            <Opcion key={k} activo={contacto === k} onClick={() => setContacto(k)} Icon={Icon} label={l} />
          ))}
        </Grid2>
      </Seccion>

      {esCerradoOAusente && (
        <p style={{ fontSize: 12.5, color: C.muted, marginTop: -8, marginBottom: 16 }}>
          Cuenta como visita realizada — solo falta decidir si se reprograma.
        </p>
      )}

      {!esCerradoOAusente && (
        <Seccion titulo="Resultado">
          <Grid2>
            {resultadosVisibles.map(({ k, l, Icon }) => (
              <Opcion key={k} activo={resultado === k} onClick={() => setResultado(k)} Icon={Icon} label={l} />
            ))}
          </Grid2>
        </Seccion>
      )}

      <Seccion titulo="Próximo paso">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {PROXIMOS_PASOS.map(({ k, l, Icon }) => {
            const on = proximoPaso === k
            return (
              <button
                key={k}
                onClick={() => setProximoPaso(k)}
                style={{
                  minHeight: TAP, borderRadius: 12, cursor: 'pointer', padding: '0 14px',
                  border: `1.5px solid ${on ? C.blue : C.line}`, background: on ? C.blueSoft : C.card,
                  color: on ? C.blue : C.text, fontSize: 14, fontWeight: on ? 800 : 600,
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                }}
              >
                <Icon size={17} color={on ? C.blue : C.muted} />
                {l}
              </button>
            )
          })}
        </div>
        {proximoPaso && proximoPaso !== 'sin_pendiente' && (
          <label style={{ display: 'block', marginTop: 10 }}>
            <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: C.muted, marginBottom: 5 }}>¿Cuándo?</span>
            <input
              type="date"
              value={fecha}
              onChange={e => setFecha(e.target.value)}
              style={{
                width: '100%', minHeight: TAP, padding: '0 12px', borderRadius: 11,
                border: `1px solid ${C.line}`, background: C.card, fontSize: 15, color: C.text, outline: 'none',
              }}
            />
            <p style={{ fontSize: 11.5, color: C.muted, marginTop: 6 }}>Se creará un recordatorio de seguimiento.</p>
          </label>
        )}
      </Seccion>

      <Seccion titulo={`Nota ${necesitaNotaObligatoria ? '(obligatoria)' : '(opcional)'}`}>
        <textarea
          value={nota}
          onChange={e => setNota(e.target.value)}
          placeholder="Algo que valga la pena recordar de esta visita…"
          rows={3}
          style={{
            width: '100%', padding: 12, borderRadius: 12, resize: 'vertical',
            border: `1px solid ${necesitaNotaObligatoria && !nota.trim() ? C.amber : C.line}`,
            background: C.card, fontSize: 15, color: C.text, outline: 'none',
          }}
        />
      </Seccion>

      <button
        onClick={guardar}
        disabled={!puedeGuardar || guardando}
        style={{
          ...btnPrimario,
          background: puedeGuardar && !guardando ? C.verdeLlegada : C.line,
          color: puedeGuardar && !guardando ? '#fff' : C.faint,
          cursor: puedeGuardar && !guardando ? 'pointer' : 'not-allowed',
          marginTop: 6,
        }}
      >
        {guardando ? 'Guardando…' : esPedidoOCotizacion ? 'Continuar al pedido →' : 'Guardar y finalizar'}
      </button>
      {!puedeGuardar && (
        <p style={{ fontSize: 11.5, color: C.muted, textAlign: 'center', marginTop: 8 }}>
          {!contacto ? 'Elige con quién hablaste' : necesitaNotaObligatoria ? 'La nota es obligatoria para "Otro"' : 'Elige un resultado para continuar'}
        </p>
      )}
    </div>
  )
}

function Seccion({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: C.muted, letterSpacing: '0.03em', marginBottom: 9 }}>{titulo.toUpperCase()}</p>
      {children}
    </div>
  )
}

function Grid2({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>{children}</div>
}

function Opcion({ activo, onClick, Icon, label }: { activo: boolean; onClick: () => void; Icon: typeof User; label: string }) {
  return (
    <button
      onClick={onClick}
      style={{
        ...cardStyle,
        border: `1.5px solid ${activo ? C.verdeLlegada : C.line}`,
        background: activo ? C.verdeLlegadaSoft : C.card,
        minHeight: 58, padding: '0 12px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 9,
      }}
    >
      <Icon size={18} color={activo ? C.verdeLlegada : C.muted} style={{ flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, fontWeight: activo ? 800 : 600, color: activo ? C.verdeLlegada : C.text, lineHeight: 1.2, textAlign: 'left' }}>
        {label}
      </span>
    </button>
  )
}
