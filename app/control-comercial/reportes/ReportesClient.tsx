'use client'

import { useEffect, useState } from 'react'
import { FileDown, Mail, MessageCircle, FileText } from 'lucide-react'
import AppHeader from '@/components/ui/AppHeader'
import { formatCLP, formatLitros, formatNumero } from '@/components/control-comercial/KpiCard'
import { generarReportePDF, type ReporteSnapshot } from '@/lib/control-comercial/reportePdf'
import { generarResumenNarrativo } from '@/lib/control-comercial/resumenNarrativo'

interface PeriodoRow { id: number; nombre: string; fecha_inicio: string; fecha_fin: string; activo: boolean }
interface HistorialRow {
  id: number; periodo_nombre: string; tipo: string; resumen_texto: string | null
  creado_por_nombre: string | null; destinatarios_email: string[] | null
  enviado_email: boolean; enviado_whatsapp: boolean; created_at: string; snapshot: ReporteSnapshot
}

function descargarBase64Pdf(base64: string, filename: string) {
  const bytes = atob(base64)
  const arr = new Uint8Array(bytes.length)
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i)
  const blob = new Blob([arr], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export default function ReportesClient() {
  const [periodos, setPeriodos] = useState<PeriodoRow[]>([])
  const [periodoId, setPeriodoId] = useState<number | null>(null)
  const [tipo, setTipo] = useState<'ejecutivo' | 'completo'>('ejecutivo')
  const [generando, setGenerando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ snapshot: ReporteSnapshot; pdfBase64: string; reporteId: number | null } | null>(null)
  const [historial, setHistorial] = useState<HistorialRow[]>([])
  const [emails, setEmails] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [mensajeEnvio, setMensajeEnvio] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/control-comercial/periodos').then(r => r.json()).then(d => {
      setPeriodos(d.periodos ?? [])
      const activo = (d.periodos ?? []).find((p: PeriodoRow) => p.activo)
      setPeriodoId(activo?.id ?? d.periodos?.[0]?.id ?? null)
    })
    cargarHistorial()
  }, [])

  function cargarHistorial() {
    fetch('/api/control-comercial/reportes').then(r => r.json()).then(d => setHistorial(Array.isArray(d) ? d : []))
  }

  async function generar() {
    const periodo = periodos.find(p => p.id === periodoId)
    if (!periodo) return
    setGenerando(true)
    setError(null)
    setPreview(null)
    try {
      const anio = Number(periodo.fecha_fin.slice(0, 4))
      const mes = Number(periodo.fecha_fin.slice(5, 7))
      const qs = `anio=${anio}&mes=${mes}`

      // Secuencial a propósito: generar un reporte ya dispara ~6 endpoints que cada uno llama
      // varias RPC — todo en paralelo satura el pool de conexiones y puede superar el
      // statement_timeout. "Generar Reporte" es de uso puntual, no de alta frecuencia.
      const resumen = await fetch(`/api/control-comercial/resumen?${qs}`).then(r => r.json())
      const clientes = await fetch(`/api/control-comercial/clientes?${qs}`).then(r => r.json())
      const cobranza = await fetch(`/api/control-comercial/cobranza?${qs}`).then(r => r.json())
      const barriles = await fetch(`/api/control-comercial/barriles?${qs}`).then(r => r.json())
      const equipo = await fetch(`/api/control-comercial/equipo?${qs}`).then(r => r.json())
      const insights = await fetch(`/api/control-comercial/insights?${qs}`).then(r => r.json())

      const kpi = (id: string) => resumen.kpis?.find((k: { id: string }) => k.id === id)
      const ventaKpi = kpi('venta_ytd'); const crecKpi = kpi('crecimiento_yoy'); const metaKpi = kpi('cumplimiento_meta')
      const cobranzaKpi = kpi('cobranza_recuperada'); const barrilesKpi = kpi('barriles_criticos')

      const territorios = new Map<string, { monto: number; litros: number }>()
      for (const f of (equipo.filas ?? [])) {
        territorios.set(f.territorio, { monto: f.venta_clp, litros: f.litros })
      }

      const cobranzaKpisData = cobranza.kpis
      const deudaVarPct = cobranzaKpisData?.hay_snapshot_inicio && cobranzaKpisData.deuda_vencida_inicio_periodo > 0
        ? ((cobranzaKpisData.deuda_vencida_actual - cobranzaKpisData.deuda_vencida_inicio_periodo) / cobranzaKpisData.deuda_vencida_inicio_periodo) * 100
        : null

      const resumenTexto = generarResumenNarrativo({
        periodoNombre: periodo.nombre,
        ventaClp: ventaKpi?.valor ?? 0,
        crecimientoYoyPct: crecKpi?.variacionPct ?? null,
        cumplimientoMetaPct: metaKpi?.estado === 'sin_meta' ? null : metaKpi?.valor ?? null,
        clientesNuevos: clientes.nuevos?.length ?? 0,
        clientesConsolidados: clientes.consolidacion?.consolidados ?? 0,
        cobranzaRecuperada: cobranzaKpi?.estado === 'no_disponible' ? null : cobranzaKpi?.valor ?? null,
        cuentasRegularizadas: cobranzaKpisData?.hay_snapshot_inicio ? cobranzaKpisData.cuentas_regularizadas : null,
        deudaVencidaVariacionPct: deudaVarPct,
        barrilesRecuperados: barriles.recuperados?.hay_historial ? barriles.recuperados.recuperados : null,
        barrilesCriticos: barrilesKpi?.valor ?? 0,
      })

      const snapshot: ReporteSnapshot = {
        periodoNombre: periodo.nombre,
        tipo,
        kpis: (resumen.kpis ?? []).filter((k: { estado?: string }) => k.estado !== 'sin_meta' && k.estado !== 'no_disponible').map((k: { titulo: string; valor: number; formato: string; variacionPct: number | null }) => ({
          titulo: k.titulo,
          valor: k.formato === 'clp' ? formatCLP(k.valor) : k.formato === 'litros' ? formatLitros(k.valor) : k.formato === 'porcentaje' ? `${k.valor.toFixed(1)}%` : formatNumero(k.valor),
          variacion: k.variacionPct !== null ? `${k.variacionPct >= 0 ? '+' : ''}${k.variacionPct.toFixed(1)}%` : undefined,
        })),
        resumenTexto,
        ventasPorTerritorio: [...territorios.entries()].map(([territorio, v]) => ({ territorio, monto: formatCLP(v.monto), litros: formatLitros(v.litros) })),
        clientes: {
          nuevos: clientes.nuevos?.length ?? 0,
          consolidacionPct: clientes.consolidacion?.tasa_pct ?? 0,
          reactivados: clientes.reactivados?.length ?? 0,
          perdidos: clientes.estadoResumen?.perdido ?? 0,
          crecimientoNeto: (clientes.nuevos?.length ?? 0) + (clientes.reactivados?.length ?? 0) - (clientes.estadoResumen?.perdido ?? 0),
        },
        cobranza: cobranzaKpisData ? {
          deudaVencida: formatCLP(cobranzaKpisData.deuda_vencida_actual),
          deudaMas90: formatCLP(cobranzaKpisData.deuda_mas_90_actual),
          recuperado: formatCLP(cobranzaKpisData.hay_snapshot_inicio ? cobranzaKpisData.monto_recuperado : 0),
          regularizadas: cobranzaKpisData.hay_snapshot_inicio ? cobranzaKpisData.cuentas_regularizadas : 0,
        } : undefined,
        barriles: barriles.estado ? {
          total: barriles.estado.total, criticos: barriles.estado.criticos,
          recuperados: barriles.recuperados?.hay_historial ? barriles.recuperados.recuperados : 0,
        } : undefined,
        equipo: (equipo.filas ?? []).map((f: { territorio: string; venta_clp: number; crecimientoYoyPct: number | null; clientes_activos: number; deuda_vencida: number }) => ({
          territorio: f.territorio, ventaClp: formatCLP(f.venta_clp),
          crecimiento: f.crecimientoYoyPct !== null ? `${f.crecimientoYoyPct >= 0 ? '+' : ''}${f.crecimientoYoyPct.toFixed(1)}%` : '—',
          clientesActivos: f.clientes_activos, deudaVencida: formatCLP(f.deuda_vencida),
        })),
        insights: insights.insights ?? [],
      }

      const pdfBase64 = generarReportePDF(snapshot)

      const guardado = await fetch('/api/control-comercial/reportes', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodo_id: periodoId, periodo_nombre: periodo.nombre, tipo, filtros: { anio, mes }, snapshot, resumen_texto: resumenTexto }),
      }).then(r => r.ok ? r.json() : null).catch(() => null)

      setPreview({ snapshot, pdfBase64, reporteId: guardado?.id ?? null })
      cargarHistorial()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al generar el reporte')
    } finally {
      setGenerando(false)
    }
  }

  function descargar(snapshot: ReporteSnapshot, pdfBase64: string) {
    descargarBase64Pdf(pdfBase64, `control-comercial-${snapshot.periodoNombre.replace(/\s+/g, '-').toLowerCase()}.pdf`)
  }

  async function enviarCorreo() {
    if (!preview) return
    const destinatarios = emails.split(',').map(e => e.trim()).filter(Boolean)
    if (destinatarios.length === 0) return
    setEnviando(true)
    setMensajeEnvio(null)
    try {
      const res = await fetch('/api/control-comercial/reportes/enviar-email', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reporteId: preview.reporteId, destinatarios, periodoNombre: preview.snapshot.periodoNombre, resumenTexto: preview.snapshot.resumenTexto, pdfBase64: preview.pdfBase64 }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? 'Error al enviar')
      setMensajeEnvio('Enviado correctamente.')
      cargarHistorial()
    } catch (e) {
      setMensajeEnvio(e instanceof Error ? e.message : 'Error al enviar')
    } finally {
      setEnviando(false)
    }
  }

  async function compartirWhatsApp() {
    if (!preview) return
    const s = preview.snapshot
    const texto = `CONTROL COMERCIAL EL REGRESO — ${s.periodoNombre.toUpperCase()}\n\n${s.resumenTexto}\n\n(Informe completo en PDF adjunto — descárgalo desde Control Comercial y compártelo junto a este mensaje.)`
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
    if (preview.reporteId) {
      await fetch(`/api/control-comercial/reportes/${preview.reporteId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ enviado_whatsapp: true }),
      })
      cargarHistorial()
    }
  }

  async function reabrirHistorial(row: HistorialRow) {
    const pdfBase64 = generarReportePDF(row.snapshot)
    descargarBase64Pdf(pdfBase64, `control-comercial-${row.periodo_nombre.replace(/\s+/g, '-').toLowerCase()}.pdf`)
  }

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 900, width: '100%', margin: '0 auto' }}>
      <AppHeader eyebrow="Control Comercial" title="Generar Reporte" />

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <select value={periodoId ?? ''} onChange={e => setPeriodoId(Number(e.target.value))}
            style={{ background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', color: 'var(--cream)', fontSize: 13 }}>
            {periodos.map(p => <option key={p.id} value={p.id}>{p.nombre}{p.activo ? ' · en curso' : ''}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: 3 }}>
            {(['ejecutivo', 'completo'] as const).map(t => (
              <button key={t} onClick={() => setTipo(t)} style={{
                padding: '7px 12px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                background: tipo === t ? 'var(--gold-dim)' : 'transparent', color: tipo === t ? 'var(--gold)' : 'var(--muted)',
              }}>{t === 'ejecutivo' ? 'Ejecutivo' : 'Completo'}</button>
            ))}
          </div>
          <button onClick={generar} disabled={generando || !periodoId} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 9,
            background: 'var(--gold)', color: '#0A0A0A', border: 'none', fontWeight: 800, fontSize: 13, cursor: 'pointer', opacity: generando ? 0.6 : 1,
          }}>
            <FileText size={15} /> {generando ? 'Generando…' : 'Generar reporte'}
          </button>
        </div>
        {error && <p style={{ color: 'var(--red)', fontSize: 12 }}>{error}</p>}

        {preview && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginTop: 4 }}>
            <p style={{ fontSize: 13, color: 'var(--cream)', lineHeight: 1.6, marginBottom: 14 }}>{preview.snapshot.resumenTexto}</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <button onClick={() => descargar(preview.snapshot, preview.pdfBase64)} style={btnStyle()}>
                <FileDown size={14} /> Descargar PDF
              </button>
              <button onClick={compartirWhatsApp} style={btnStyle()}>
                <MessageCircle size={14} /> Compartir WhatsApp
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <input placeholder="correo1@ejemplo.com, correo2@ejemplo.com" value={emails} onChange={e => setEmails(e.target.value)}
                style={{ flex: '1 1 260px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 10px', color: 'var(--cream)', fontSize: 13 }} />
              <button onClick={enviarCorreo} disabled={enviando || !emails.trim()} style={btnStyle()}>
                <Mail size={14} /> {enviando ? 'Enviando…' : 'Enviar por correo'}
              </button>
            </div>
            {mensajeEnvio && <p style={{ fontSize: 12, color: mensajeEnvio.startsWith('Error') ? 'var(--red)' : 'var(--green)', marginTop: 8 }}>{mensajeEnvio}</p>}
          </div>
        )}
      </div>

      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Historial de reportes</h2>
        {historial.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', padding: '20px 0' }}>Sin reportes generados todavía.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {historial.map(h => (
              <div key={h.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 4px', borderBottom: '1px solid var(--border-subtle)' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--cream)' }}>{h.periodo_nombre} · {h.tipo === 'ejecutivo' ? 'Ejecutivo' : 'Completo'}</p>
                  <p style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {h.creado_por_nombre} · {new Date(h.created_at).toLocaleDateString('es-CL')}
                    {h.enviado_email && ' · Enviado por correo'}
                    {h.enviado_whatsapp && ' · Compartido WhatsApp'}
                  </p>
                </div>
                <button onClick={() => reabrirHistorial(h)} style={{ fontSize: 12, color: 'var(--gold)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                  Descargar de nuevo
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function btnStyle(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9,
    background: 'var(--surface2)', color: 'var(--cream)', border: '1px solid var(--border)', fontWeight: 700, fontSize: 12.5, cursor: 'pointer',
  }
}
