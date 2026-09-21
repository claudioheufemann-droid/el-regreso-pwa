'use client'

/**
 * Planificación semanal — "Mi semana". Referencia visual 01 del prompt de Claudio
 * (planificación semanal / detalle del día), adaptada al sistema visual ya existente de
 * Terreno (mismo header con Volver + eyebrow, mismas tarjetas blancas, mismo botón
 * primario) en vez de recrear el chrome ficticio de la imagen.
 */
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Bed, Loader2, AlertTriangle } from 'lucide-react'
import { C, PLAN, TAP, cardStyle, btnPrimario, fPeso } from '../theme'
import type { PlanCompleto } from '@/lib/terreno/planificacion/cargarPlanCompleto'

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']

function sumarDias(fechaISO: string, dias: number): string {
  const [Y, M, D] = fechaISO.split('-').map(Number)
  return new Date(Date.UTC(Y, M - 1, D + dias)).toISOString().slice(0, 10)
}

function fCorta(fechaISO: string): string {
  const d = new Date(fechaISO + 'T12:00:00')
  return d.toLocaleDateString('es-CL', { day: 'numeric', month: 'short' })
}

const ESTADO_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  borrador: { label: 'Borrador', color: '#92400E', bg: '#FEF3C7' },
  enviado: { label: 'Enviado', color: '#1D4ED8', bg: '#DBEAFE' },
  en_revision: { label: 'En revisión', color: '#1D4ED8', bg: '#DBEAFE' },
  devuelto: { label: 'Devuelto', color: '#B45309', bg: '#FEF3C7' },
  aprobado: { label: 'Aprobado', color: '#166534', bg: '#DCFCE7' },
  rechazado: { label: 'Rechazado', color: '#B91C1C', bg: '#FEE2E2' },
  cancelado: { label: 'Cancelado', color: C.muted, bg: C.bg },
}

export default function PlanificacionClient({ inicial, semanaActual }: { inicial: PlanCompleto; semanaActual: string }) {
  const router = useRouter()
  const [completo, setCompleto] = useState(inicial)
  const [pending, startTransition] = useTransition()
  const [enviando, setEnviando] = useState(false)
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null)

  const { plan, dias, paradas } = completo
  const editable = ['borrador', 'devuelto'].includes(plan.estado_plan)
  const estadoInfo = ESTADO_LABEL[plan.estado_plan] ?? ESTADO_LABEL.borrador

  const paradasPorDia = new Map<string, number>()
  for (const p of paradas) paradasPorDia.set(p.plan_dia_id, (paradasPorDia.get(p.plan_dia_id) ?? 0) + 1)
  const diaPorFecha = new Map(dias.map(d => [d.fecha, d]))

  const totalVisitas = paradas.length
  const totalKmPagable = completo.presupuesto
    ? completo.presupuesto.dias.reduce((s, d) => s + (d.kmPagableM ?? 0), 0) / 1000
    : 0
  const algunPendiente = completo.presupuesto?.algunDiaPendienteDeCalculo ?? false

  const montoFondo = plan.estado_plan === 'aprobado'
    ? plan.monto_aprobado_total
    : ['enviado', 'en_revision'].includes(plan.estado_plan)
      ? plan.monto_solicitado_total
      : completo.presupuesto?.montoTotalClp ?? 0

  const montoAlojamiento = completo.presupuesto?.montoAlojamientoEstimadoClp ?? plan.monto_alojamiento_estimado ?? 0

  function irASemana(offsetSemanas: number) {
    const nueva = sumarDias(semanaActual, offsetSemanas * 7)
    startTransition(() => router.push(`/terreno/planificacion?semana=${nueva}`))
  }

  async function abrirDia(fecha: string) {
    const existente = diaPorFecha.get(fecha)
    if (existente) {
      router.push(`/terreno/planificacion/dia/${existente.id}`)
      return
    }
    const res = await fetch(`/api/terreno/planificacion/${plan.id}/dias`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fecha, regreso_mismo_dia: true, jornada_tipo: 'visitas_locales' }),
    })
    const data = await res.json()
    if (!res.ok) { alert(data.error ?? 'No se pudo crear el día'); return }
    router.push(`/terreno/planificacion/dia/${data.id}`)
  }

  async function enviarAAprobacion() {
    setEnviando(true)
    setErrorEnvio(null)
    try {
      const res = await fetch(`/api/terreno/planificacion/${plan.id}/enviar`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'No se pudo enviar el plan')
      router.refresh()
      setCompleto(c => ({ ...c, plan: data.plan }))
    } catch (e) {
      setErrorEnvio(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/terreno')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, minHeight: 36, cursor: 'pointer',
            background: C.card, border: `1px solid ${C.line}`, borderRadius: 100,
            padding: '7px 14px 7px 10px', color: PLAN.primario, fontSize: 13, fontWeight: 700, marginBottom: 14,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={PLAN.primario} />
          Volver
        </button>

        <div style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>VENTAS EN TERRENO</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>Mi semana</h1>
          </div>
          <span style={{
            fontSize: 12, fontWeight: 800, color: estadoInfo.color, background: estadoInfo.bg,
            borderRadius: 100, padding: '6px 12px', flexShrink: 0, marginTop: 4,
          }}>
            {estadoInfo.label}
          </span>
        </div>

        {/* Selector de semana */}
        <div style={{ ...cardStyle, padding: '10px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => irASemana(-1)} disabled={pending} aria-label="Semana anterior"
            style={{ width: TAP, height: TAP, border: 'none', background: 'none', color: C.muted, cursor: 'pointer' }}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>
            {fCorta(semanaActual)} – {fCorta(sumarDias(semanaActual, 6))}
          </span>
          <button onClick={() => irASemana(1)} disabled={pending} aria-label="Semana siguiente"
            style={{ width: TAP, height: TAP, border: 'none', background: 'none', color: C.muted, cursor: 'pointer' }}>
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Franja de métricas */}
        <div style={{ ...cardStyle, background: PLAN.primarioSoft, border: `1px solid ${PLAN.borde}`, padding: '14px 10px', marginBottom: 14, display: 'flex' }}>
          <Metrica valor={String(totalVisitas)} label="visitas" />
          <Divisor />
          <Metrica valor={algunPendiente ? '—' : totalKmPagable.toLocaleString('es-CL', { maximumFractionDigits: 0 })} label={algunPendiente ? 'km (pendiente)' : 'km'} />
          <Divisor />
          <Metrica valor={fPeso(montoFondo ?? 0)} label={plan.estado_plan === 'aprobado' ? 'fondo aprobado' : 'fondo solicitado'} chico />
        </div>

        {algunPendiente && (
          <div style={{ ...cardStyle, background: C.amberSoft, border: `1px solid ${C.amber}33`, padding: '10px 12px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={16} color={C.amber} style={{ flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: '#92400E', lineHeight: 1.4 }}>
              Hay días con ruta pendiente de calcular — el km de esos días no cuenta todavía en el fondo. Entra al día para calcularla.
            </p>
          </div>
        )}

        {/* Días de la semana */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {DIAS_SEMANA.map((nombre, i) => {
            const fecha = sumarDias(semanaActual, i)
            const dia = diaPorFecha.get(fecha)
            const nParadas = dia ? paradasPorDia.get(dia.id) ?? 0 : 0
            const resultadoDia = completo.presupuesto?.dias.find(d => d.plan_dia_id === dia?.id)
            const monto = dia
              ? (plan.estado_plan === 'aprobado' || ['enviado', 'en_revision'].includes(plan.estado_plan))
                ? null // el desglose por día sólo se recalcula en vivo en borrador; en versiones enviadas se ve en el detalle
                : resultadoDia?.montoDiaClp ?? null
              : null
            const esFinde = i >= 5

            return (
              <button
                key={fecha}
                onClick={() => editable && abrirDia(fecha)}
                disabled={!editable && !dia}
                style={{
                  ...cardStyle, textAlign: 'left', cursor: editable || dia ? 'pointer' : 'default',
                  padding: '14px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  opacity: esFinde && !dia ? 0.6 : 1,
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{nombre} {fCorta(fecha).split(' ')[0]}</p>
                  {dia ? (
                    <p style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>
                      {nParadas} {nParadas === 1 ? 'visita' : 'visitas'}
                      {resultadoDia?.kmPagableM != null ? ` · ${Math.round(resultadoDia.kmPagableM / 1000)} km` : resultadoDia ? ' · km pendiente' : ''}
                      {dia.pernocta && (
                        <span style={{ marginLeft: 6, color: C.amber, fontWeight: 700 }}>
                          <Bed size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 2 }} />
                          1 noche fuera
                        </span>
                      )}
                    </p>
                  ) : (
                    <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
                      {esFinde ? 'Sin actividad' : editable ? 'Toca para planificar' : 'Sin planificar'}
                    </p>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {monto != null && <span style={{ fontSize: 14, fontWeight: 800, color: C.text }}>{fPeso(monto)}</span>}
                  {(editable || dia) && <ChevronRight size={16} color={C.faint} />}
                </div>
              </button>
            )
          })}
        </div>

        {montoAlojamiento > 0 && (
          <div style={{ ...cardStyle, background: C.bg, padding: '10px 12px', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <Bed size={16} color={C.muted} style={{ flexShrink: 0 }} />
            <p style={{ fontSize: 12, color: C.muted }}>
              Alojamiento previsto: <strong style={{ color: C.text }}>{fPeso(montoAlojamiento)}</strong> · Reembolso posterior, no incluido en el fondo
            </p>
          </div>
        )}

        {errorEnvio && (
          <div style={{ ...cardStyle, background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '10px 12px', marginBottom: 12 }}>
            <p style={{ fontSize: 12, color: '#B91C1C' }}>{errorEnvio}</p>
          </div>
        )}

        {editable ? (
          <button
            onClick={enviarAAprobacion}
            disabled={enviando || totalVisitas === 0}
            style={{ ...btnPrimario, background: PLAN.primario, opacity: totalVisitas === 0 ? 0.5 : 1 }}
          >
            {enviando ? <Loader2 size={18} className="animate-spin" /> : null}
            Enviar a aprobación
          </button>
        ) : (
          <div style={{ ...cardStyle, padding: '14px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: C.muted }}>
              {plan.estado_plan === 'enviado' || plan.estado_plan === 'en_revision'
                ? 'Enviado — esperando revisión de Claudio.'
                : plan.estado_plan === 'aprobado'
                  ? 'Plan aprobado.'
                  : plan.estado_plan === 'rechazado'
                    ? 'Plan rechazado.'
                    : 'Plan cancelado.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function Metrica({ valor, label, chico }: { valor: string; label: string; chico?: boolean }) {
  return (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <p style={{ fontSize: chico ? 16 : 20, fontWeight: 800, color: PLAN.textoFuerte }}>{valor}</p>
      <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{label}</p>
    </div>
  )
}

function Divisor() {
  return <div style={{ width: 1, background: PLAN.borde, margin: '2px 4px' }} />
}
