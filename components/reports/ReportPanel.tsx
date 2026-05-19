'use client'

import { useState, useMemo } from 'react'
import { RcTask, AREAS, AREA_CFG } from '@/lib/gestion-types'
import {
  calcOTCR,
  calcSemaphoreDistribution,
  calcLeadTime,
  calcNetProductivity,
  SEMAPHORE_HEX,
} from '@/lib/kpis'

interface Props {
  tasks: RcTask[]
  commentCounts: Record<string, number>
}

type SendState = 'idle' | 'generating' | 'sending' | 'done' | 'error'

export default function ReportPanel({ tasks, commentCounts }: Props) {
  const [scope, setScope]           = useState<string>('all')
  const [email, setEmail]           = useState('')
  const [sendState, setSendState]   = useState<SendState>('idle')
  const [sentTo, setSentTo]         = useState('')
  const [errorMsg, setErrorMsg]     = useState('')
  const [lastPdfBase64, setLastPdfBase64] = useState<string | null>(null)

  const scopedTasks = useMemo(() => {
    const base = tasks.filter(t => t.area !== 'Mi Cerebro')
    return scope === 'all' ? base : base.filter(t => t.area === scope)
  }, [tasks, scope])

  const dist     = useMemo(() => calcSemaphoreDistribution(scopedTasks), [scopedTasks])
  const otcr     = useMemo(() => calcOTCR(scopedTasks), [scopedTasks])
  const leadTime = useMemo(() => calcLeadTime(scopedTasks), [scopedTasks])
  const netProd  = useMemo(() => calcNetProductivity(scopedTasks), [scopedTasks])
  const totalC   = useMemo(() => scopedTasks.reduce((s, t) => s + (commentCounts[t.id] ?? 0), 0), [scopedTasks, commentCounts])
  const pimp     = scopedTasks.length > 0 ? Math.round((totalC / scopedTasks.length) * 10) / 10 : 0
  const redPct   = dist.total > 0 ? Math.round((dist.red / dist.total) * 100) : 0

  const cfg = scope !== 'all' ? AREA_CFG[scope] : null

  // Genera el PDF y lo guarda en estado; retorna base64 o null
  async function buildPdf(): Promise<string | null> {
    const { generateReportPDF } = await import('@/lib/generate-pdf')
    return generateReportPDF({
      area: scope === 'all' ? undefined : scope,
      tasks,
      commentCounts,
    })
  }

  function downloadPdf(base64: string) {
    const filename = scope === 'all'
      ? `reporte-general-${new Date().toISOString().slice(0, 10)}.pdf`
      : `reporte-${scope.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().slice(0, 10)}.pdf`
    const link = document.createElement('a')
    link.href = `data:application/pdf;base64,${base64}`
    link.download = filename
    link.click()
  }

  async function handleDownload() {
    if (scopedTasks.length === 0) return
    setSendState('generating')
    setErrorMsg('')
    try {
      const base64 = await buildPdf()
      if (!base64) throw new Error('PDF vacío')
      setLastPdfBase64(base64)
      downloadPdf(base64)
      setSendState('idle')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error generando el PDF')
      setSendState('error')
    }
  }

  async function handleSend() {
    if (scopedTasks.length === 0) return
    setSendState('generating')
    setErrorMsg('')

    try {
      // Reutiliza el PDF ya generado si existe, sino genera uno nuevo
      let base64 = lastPdfBase64
      if (!base64) {
        base64 = await buildPdf()
        if (!base64) throw new Error('PDF vacío')
        setLastPdfBase64(base64)
      }

      setSendState('sending')
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pdfBase64: base64,
          area: scope === 'all' ? null : scope,
          recipientEmail: email.trim() || undefined,
        }),
      })

      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data.error ?? `Error HTTP ${res.status}`)
      }

      setSentTo(data.sentTo ?? email)
      setSendState('done')
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Error enviando el reporte')
      setSendState('error')
    }
  }

  function reset() {
    setSendState('idle')
    setErrorMsg('')
    setSentTo('')
    setLastPdfBase64(null)
  }

  const busy = sendState === 'generating' || sendState === 'sending'

  const previewKpis = [
    {
      label: 'Efectividad',
      value: otcr.total > 0 ? `${otcr.rate}%` : '—',
      color: otcr.rate >= 85 ? '#16A34A' : otcr.rate >= 60 ? '#D97706' : '#DC2626',
    },
    {
      label: 'Tareas rojas',
      value: dist.red.toString(),
      color: dist.red > 0 ? SEMAPHORE_HEX.red : '#16A34A',
    },
    {
      label: 'Nivel riesgo',
      value: dist.total > 0 ? `${redPct}%` : '—',
      color: redPct < 15 ? '#16A34A' : redPct < 30 ? '#D97706' : '#DC2626',
    },
    {
      label: 'Lead time',
      value: leadTime.avg > 0 ? `${leadTime.avg}d` : '—',
      color: '#3B82F6',
    },
    {
      label: 'Pimponeo',
      value: pimp > 0 ? `${pimp}` : '—',
      color: pimp < 2 ? '#16A34A' : pimp < 3 ? '#D97706' : '#DC2626',
    },
    {
      label: 'Productividad',
      value: netProd.created > 0 ? `${netProd.ratio.toFixed(1)}x` : '—',
      color: netProd.ratio >= 1 ? '#16A34A' : '#DC2626',
    },
  ]

  return (
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 20, overflow: 'hidden',
      borderTop: '3px solid rgba(212,175,55,0.5)',
    }}>
      {/* Section header */}
      <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 34, height: 34, borderRadius: 10, flexShrink: 0,
            background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16,
          }}>📄</div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 800, color: 'var(--cream)', letterSpacing: -0.3 }}>
              Generador de Reportes PDF
            </div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
              Genera y envía un informe de gestión por correo electrónico
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '20px 22px 24px', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {/* Scope selector */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 }}>
            Alcance del Reporte
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
            {/* All areas option */}
            <div
              onClick={() => { setScope('all'); reset() }}
              className="cursor-pointer touch-active"
              style={{
                padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                background: scope === 'all' ? 'rgba(212,175,55,0.1)' : 'rgba(128,128,128,0.05)',
                border: `1px solid ${scope === 'all' ? 'rgba(212,175,55,0.4)' : 'rgba(128,128,128,0.12)'}`,
                display: 'flex', alignItems: 'center', gap: 9, transition: 'all 0.15s',
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                background: scope === 'all' ? 'rgba(212,175,55,0.2)' : 'rgba(128,128,128,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, fontWeight: 900,
                color: scope === 'all' ? '#D4AF37' : 'var(--muted)',
              }}>ALL</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: scope === 'all' ? 'var(--cream)' : 'var(--muted)' }}>
                  Todas las áreas
                </div>
                <div style={{ fontSize: 9, color: 'var(--muted)' }}>Reporte consolidado</div>
              </div>
            </div>

            {/* Individual areas */}
            {AREAS.map(area => {
              const areaCfg = AREA_CFG[area]
              const selected = scope === area
              return (
                <div
                  key={area}
                  onClick={() => { setScope(area); reset() }}
                  className="cursor-pointer touch-active"
                  style={{
                    padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                    background: selected ? `${areaCfg.color}10` : 'rgba(128,128,128,0.05)',
                    border: `1px solid ${selected ? areaCfg.color + '40' : 'rgba(128,128,128,0.12)'}`,
                    display: 'flex', alignItems: 'center', gap: 9, transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                    background: selected ? `${areaCfg.color}20` : 'rgba(128,128,128,0.1)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 8, fontWeight: 900,
                    color: selected ? areaCfg.color : 'var(--muted)',
                  }}>{areaCfg.code}</div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: selected ? 'var(--cream)' : 'var(--muted)' }}>
                      {area}
                    </div>
                    <div style={{ fontSize: 9, color: 'var(--muted)' }}>Reporte específico</div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Preview */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase' }}>
              Vista Previa de Datos
            </div>
            <div style={{
              fontSize: 9, padding: '2px 8px', borderRadius: 20,
              background: cfg ? `${cfg.color}12` : 'rgba(212,175,55,0.1)',
              border: `1px solid ${cfg ? cfg.color + '30' : 'rgba(212,175,55,0.25)'}`,
              color: cfg ? cfg.color : '#D4AF37', fontWeight: 700,
            }}>
              {scope === 'all' ? `${scopedTasks.length} tareas · todas las áreas` : `${scopedTasks.length} tareas en ${scope}`}
            </div>
          </div>

          {scopedTasks.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)', fontSize: 12, background: 'rgba(128,128,128,0.04)', borderRadius: 14, border: '1px solid var(--border)' }}>
              No hay tareas registradas para este alcance
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {previewKpis.map(k => (
                <div key={k.label} style={{
                  background: 'rgba(128,128,128,0.04)', border: '1px solid var(--border)',
                  borderRadius: 12, padding: '12px 14px',
                  borderTop: `2px solid ${k.color}`,
                }}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: k.color, letterSpacing: -1, lineHeight: 1, marginBottom: 5 }}>
                    {k.value}
                  </div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    {k.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Email */}
        <div>
          <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>
            Destinatario
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, pointerEvents: 'none' }}>✉</span>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="correo@destino.cl  (deja vacío para usar el tuyo)"
                disabled={busy}
                style={{
                  width: '100%', paddingLeft: 34, borderRadius: 12, fontSize: 13,
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  color: 'var(--cream)',
                }}
              />
            </div>
          </div>
          <div style={{ fontSize: 9, color: 'var(--muted)', marginTop: 5 }}>
            Si lo dejas vacío, el reporte se envía a tu correo de administrador.
          </div>
        </div>

        {/* Actions */}
        {sendState === 'done' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{
              padding: '14px 18px', borderRadius: 14,
              background: 'rgba(22,163,74,0.1)', border: '1px solid rgba(22,163,74,0.3)',
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ fontSize: 22 }}>✅</span>
              <div>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#16A34A', marginBottom: 2 }}>Reporte enviado exitosamente</div>
                <div style={{ fontSize: 11, color: 'var(--muted)' }}>Enviado a: <strong style={{ color: 'var(--cream)' }}>{sentTo}</strong></div>
                <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>Revisa tu bandeja de entrada (y spam por si acaso)</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {lastPdfBase64 && (
                <button
                  onClick={() => downloadPdf(lastPdfBase64!)}
                  style={{
                    padding: '11px', borderRadius: 12, cursor: 'pointer',
                    background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.25)',
                    fontSize: 12, color: '#3B82F6', fontWeight: 700,
                  }}
                >
                  ↓ Descargar PDF
                </button>
              )}
              <button
                onClick={reset}
                style={{
                  padding: '11px', borderRadius: 12, cursor: 'pointer',
                  background: 'rgba(128,128,128,0.07)', border: '1px solid rgba(128,128,128,0.15)',
                  fontSize: 12, color: 'var(--muted)', fontWeight: 600,
                  gridColumn: lastPdfBase64 ? 'auto' : '1 / -1',
                }}
              >
                Generar otro reporte
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {sendState === 'error' && (
              <div style={{
                padding: '11px 14px', borderRadius: 12,
                background: 'rgba(220,38,38,0.08)', border: '1px solid rgba(220,38,38,0.25)',
                fontSize: 12, color: '#FF6666', lineHeight: 1.5,
              }}>
                ✕ {errorMsg}
              </div>
            )}

            {/* Botones principales */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
              {/* Descargar */}
              <button
                onClick={handleDownload}
                disabled={busy || scopedTasks.length === 0}
                className="touch-active"
                style={{
                  padding: '15px 10px', borderRadius: 14,
                  cursor: busy || scopedTasks.length === 0 ? 'not-allowed' : 'pointer',
                  background: 'rgba(59,130,246,0.08)',
                  border: '1px solid rgba(59,130,246,0.3)',
                  fontSize: 12, fontWeight: 700, color: '#3B82F6',
                  opacity: scopedTasks.length === 0 ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <span>↓</span>
                Descargar
              </button>

              {/* Enviar por email */}
              <button
                onClick={handleSend}
                disabled={busy || scopedTasks.length === 0}
                className="touch-active"
                style={{
                  padding: '15px', borderRadius: 14,
                  cursor: busy || scopedTasks.length === 0 ? 'not-allowed' : 'pointer',
                  background: busy ? 'rgba(212,175,55,0.06)' : 'rgba(212,175,55,0.12)',
                  border: `1px solid ${busy ? 'rgba(212,175,55,0.2)' : 'rgba(212,175,55,0.4)'}`,
                  fontSize: 13, fontWeight: 800, color: '#D4AF37',
                  opacity: scopedTasks.length === 0 ? 0.4 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}
              >
                {sendState === 'generating' && <><span>⏳</span> Generando PDF…</>}
                {sendState === 'sending'    && <><span>📤</span> Enviando…</>}
                {(sendState === 'idle' || sendState === 'error') && (
                  <><span>✉</span> Enviar por Email{scope !== 'all' ? ` · ${scope}` : ''}</>
                )}
              </button>
            </div>

            <div style={{ display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
              {[
                scope === 'all' ? 'General' : 'Específico',
                `${scopedTasks.length} tareas`,
                'PDF A4',
                'Análisis automático',
              ].map(tag => (
                <span key={tag} style={{
                  fontSize: 9, padding: '2px 8px', borderRadius: 20,
                  background: 'rgba(128,128,128,0.07)', border: '1px solid rgba(128,128,128,0.12)',
                  color: 'var(--muted)',
                }}>{tag}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
