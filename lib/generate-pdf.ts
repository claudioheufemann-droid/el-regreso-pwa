import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { RcTask, MACRO_AREAS, MacroKey } from './gestion-types'
import {
  calcAreaKpis,
  calcOTCR,
  calcSemaphoreDistribution,
  calcNetProductivity,
  calcLeadTime,
  calcReactionTime,
  getSemaphore,
} from './kpis'

// ── Paleta alto contraste (impresión) ────────────────────────
const C = {
  red:       '#C41A1A',
  yellow:    '#7A4F00',
  green:     '#145E2E',
  blue:      '#1A4FAD',
  gold:      '#7A5C00',
  dark:      '#111111',
  gray:      '#555555',
  lightGray: '#F4F5F6',
  border:    '#CCCCCC',
  white:     '#FFFFFF',
  headerBg:  '#1A1A2E',
}

type RGB = [number, number, number]
function hex(h: string): RGB {
  return [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)]
}
function formatPlazo(p: string): string {
  const [y,m,d] = p.slice(0,10).split('-').map(Number)
  return `${d}/${m}/${y}`
}
function riskLevel(pct: number): string {
  if (pct === 0)   return 'Sin riesgo'
  if (pct < 10)    return 'Bajo'
  if (pct < 20)    return 'Moderado'
  if (pct < 35)    return 'Alto'
  return 'Critico'
}
function riskColor(pct: number): string {
  if (pct === 0)  return C.green
  if (pct < 10)  return C.green
  if (pct < 20)  return C.yellow
  return C.red
}
function otcrLabel(rate: number, total: number): string {
  if (total === 0) return 'Sin datos'
  if (rate >= 85)  return 'Excelente'
  if (rate >= 70)  return 'Aceptable'
  if (rate >= 50)  return 'Deficiente'
  return 'Critico'
}

// ── Análisis ejecutivo detallado ─────────────────────────────

interface AnalysisResult {
  headline: string
  paragraphs: string[]
  recommendations: string[]
  positives: string[]
}

function buildAnalysis(
  tasks: RcTask[],
  commentCounts: Record<string, number>,
  area?: string,
): AnalysisResult {
  const scope   = tasks.filter(t => t.area !== 'Mi Cerebro' && (!area || t.area === area))
  const dist    = calcSemaphoreDistribution(scope)
  const otcr    = calcOTCR(scope)
  const netProd = calcNetProductivity(scope)
  const lt      = calcLeadTime(scope)
  const rt      = calcReactionTime(scope)
  const totalC  = scope.reduce((s,t) => s + (commentCounts[t.id] ?? 0), 0)
  const pimp    = scope.length > 0 ? Math.round((totalC / scope.length) * 10) / 10 : 0
  const redPct  = dist.total > 0 ? Math.round((dist.red  / dist.total) * 100) : 0

  const paragraphs: string[]     = []
  const recommendations: string[] = []
  const positives: string[]      = []

  // ── Headline ──
  let headline = ''
  if (otcr.total === 0) {
    headline = area
      ? `El area de ${area} no registra tareas completadas en el periodo analizado.`
      : 'No hay tareas completadas suficientes para evaluar el desempeno en este periodo.'
  } else if (otcr.rate >= 85 && redPct < 15) {
    headline = area
      ? `${area} opera en nivel optimo: alta efectividad y riesgo controlado.`
      : 'El equipo opera en nivel optimo: efectividad superior al objetivo con riesgo bajo.'
  } else if (otcr.rate < 60 || redPct >= 30) {
    headline = area
      ? `${area} requiere intervencion urgente: indicadores por debajo del umbral critico.`
      : 'Se detectan alertas criticas que requieren accion inmediata en multiples areas.'
  } else {
    headline = area
      ? `${area} muestra desempeno parcial con oportunidades claras de mejora.`
      : 'El desempeno general es aceptable con brechas especificas por atender.'
  }

  // ── Parrafo 1: Efectividad ──
  if (otcr.total > 0) {
    if (otcr.rate >= 85) {
      paragraphs.push(
        `La efectividad de entrega (OTCR) se situa en ${otcr.rate}%, superando la meta organizacional del 85%. ` +
        `De ${otcr.total} tareas completadas, ${otcr.onTime} fueron entregadas sin retrasos, ` +
        `lo que refleja una gestion de compromisos solida y disciplina operacional.`
      )
      positives.push(`Efectividad del ${otcr.rate}% — supera la meta del 85%`)
    } else if (otcr.rate >= 70) {
      paragraphs.push(
        `La efectividad de entrega alcanza el ${otcr.rate}%, dentro del rango aceptable pero ` +
        `aun por debajo del objetivo del 85%. De ${otcr.total} tareas completadas, ` +
        `${otcr.late} registraron retrasos, lo que representa una brecha operacional que debe atenderse ` +
        `mediante mayor seguimiento y anticipacion de obstaculos.`
      )
    } else {
      paragraphs.push(
        `La efectividad de entrega es de ${otcr.rate}%, significativamente por debajo del 85% objetivo. ` +
        `${otcr.late} de ${otcr.total} tareas completadas registraron retrasos, ` +
        `indicando problemas sistemicos en la planificacion, la asignacion de plazos o la disponibilidad de recursos.`
      )
    }
  }

  // ── Parrafo 2: Riesgo ──
  if (dist.total > 0) {
    const yellowPct = Math.round((dist.yellow / dist.total) * 100)
    if (redPct === 0 && dist.yellow === 0) {
      paragraphs.push(
        `El portafolio activo muestra un perfil de riesgo excelente: ninguna tarea se encuentra en estado critico ` +
        `ni proxima a vencer. Todas las tareas activas tienen margen de tiempo suficiente para su cumplimiento.`
      )
      positives.push('Cero tareas en zona critica o de alerta')
    } else if (redPct > 0) {
      paragraphs.push(
        `Se identifican ${dist.red} tarea${dist.red !== 1 ? 's' : ''} en estado critico (${redPct}% del total activo), ` +
        `${dist.yellow > 0 ? `y ${dist.yellow} adicionales en zona de alerta (${yellowPct}%). ` : ''}` +
        `Nivel de riesgo general: ${riskLevel(redPct)}. ` +
        `La concentracion de tareas vencidas o proximas a vencer es la principal amenaza al cumplimiento del periodo.`
      )
    } else {
      paragraphs.push(
        `No hay tareas vencidas, pero ${dist.yellow} estan en zona de alerta (${yellowPct}%) con menos de 72h para su vencimiento. ` +
        `Se recomienda seguimiento activo para evitar que ingresen a zona critica.`
      )
      positives.push('Sin tareas vencidas en el periodo')
    }
  }

  // ── Parrafo 3: Lead Time y Velocidad de Adopcion ──
  if (lt.avg > 0 || rt.pending > 0) {
    let ltText = lt.avg > 0
      ? `El lead time promedio es de ${lt.avg} dias (min: ${lt.min}d, max: ${lt.max}d). `
      : ''
    let rtText = ''
    if (rt.pending > 0) {
      rtText = `Hay ${rt.pending} tarea${rt.pending !== 1 ? 's' : ''} asignadas sin iniciar, ` +
        `con un tiempo de espera promedio de ${rt.avgPendingDays} dias. ` +
        (rt.pendingOver72h > 0
          ? `Preocupa que ${rt.pendingOver72h} llevan mas de 72h sin ser tomadas, lo que aumenta el riesgo de incumplimiento.`
          : rt.pendingOver24h > 0
            ? `${rt.pendingOver24h} superan las 24h sin ser iniciadas.`
            : 'Todas dentro del margen de reaccion esperado.')
    }
    if (ltText || rtText) {
      paragraphs.push(ltText + rtText)
    }
  }

  // ── Parrafo 4: Productividad y Pimponeo ──
  const prodParts: string[] = []
  if (netProd.created > 0) {
    if (netProd.ratio >= 1.2) {
      prodParts.push(`La productividad semanal es muy positiva (ratio ${netProd.ratio.toFixed(1)}x): se cierran mas compromisos de los que ingresan, reduciendo el backlog.`)
      positives.push(`Ratio productividad semanal: ${netProd.ratio.toFixed(1)}x`)
    } else if (netProd.ratio >= 1) {
      prodParts.push(`La productividad semanal es equilibrada (${netProd.ratio.toFixed(1)}x): ${netProd.closed} tareas cerradas frente a ${netProd.created} nuevas.`)
    } else {
      prodParts.push(`La productividad semanal muestra acumulacion de carga (${netProd.ratio.toFixed(1)}x): ${netProd.created} tareas nuevas frente a solo ${netProd.closed} cerradas.`)
    }
  }
  if (pimp > 0) {
    if (pimp < 2) {
      prodParts.push(`El indice de comunicacion (pimponeo) es saludable: ${pimp} msg/tarea promedio.`)
      positives.push(`Pimponeo bajo (${pimp} msg/t) — instrucciones claras`)
    } else if (pimp < 3) {
      prodParts.push(`El pimponeo de ${pimp} msg/tarea es moderado; algunas tareas generan consultas que podrian prevenirse con instrucciones mas detalladas.`)
    } else {
      prodParts.push(`El pimponeo de ${pimp} msg/tarea es elevado, evidenciando ambiguedad sistematica en la definicion de las tareas. Esto consume tiempo de gestion adicional.`)
    }
  }
  if (prodParts.length) paragraphs.push(prodParts.join(' '))

  // ── Recomendaciones ──
  if (otcr.total > 0 && otcr.rate < 85) {
    recommendations.push(
      `Implementar check-in semanal con los responsables de tareas retrasadas: ` +
      `identificar el cuello de botella (recursos, dependencias o claridad) y actuar antes del vencimiento.`
    )
  }
  if (dist.red > 0) {
    recommendations.push(
      `Revisar hoy mismo las ${dist.red} tarea${dist.red !== 1 ? 's' : ''} en estado critico. ` +
      `Determinar si requieren renegociacion de plazo, apoyo adicional o escalar a gerencia.`
    )
  }
  if (dist.yellow > 0) {
    recommendations.push(
      `Contactar a los responsables de las ${dist.yellow} tareas en zona amarilla ` +
      `para confirmar que estan en avance y no derivaran en incumplimiento.`
    )
  }
  if (rt.pendingOver72h > 0) {
    recommendations.push(
      `Urgente: ${rt.pendingOver72h} tarea${rt.pendingOver72h !== 1 ? 's' : ''} llevan mas de 72h asignadas sin iniciar. ` +
      `Verificar si el responsable tiene visibilidad de la tarea o si hay un impedimento.`
    )
  }
  if (pimp >= 2) {
    recommendations.push(
      `Mejorar la calidad de la descripcion al crear tareas: incluir criterio de aceptacion, ` +
      `contexto operacional y referencias visuales cuando aplique. Esto reduce el pimponeo y acelera la ejecucion.`
    )
  }
  if (netProd.created > 0 && netProd.ratio < 1) {
    recommendations.push(
      `Analizar el backlog acumulado: con ratio de productividad ${netProd.ratio.toFixed(1)}x, el volumen crece semana a semana. ` +
      `Evaluar prioridades, cerrar tareas bloqueadas o redistribuir carga entre el equipo.`
    )
  }
  if (lt.avg > 10) {
    recommendations.push(
      `El lead time promedio de ${lt.avg} dias sugiere que los plazos se estan definiendo con demasiada holgura ` +
      `o que las tareas no se inician oportunamente. Revisar criterios de asignacion de plazos.`
    )
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Mantener el ritmo actual y documentar las buenas practicas del equipo para replicarlas en otras areas.',
      'Establecer metas mas exigentes para el proximo periodo dado el alto nivel de cumplimiento actual.'
    )
  }

  return { headline, paragraphs, recommendations, positives }
}

// ── Helpers de layout ─────────────────────────────────────────

function sectionTitle(doc: jsPDF, text: string, y: number, mg: number, cW: number): number {
  doc.setFillColor(...hex(C.headerBg))
  doc.roundedRect(mg, y, cW, 8, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.text(text.toUpperCase(), mg + 6, y + 5.5)
  return y + 12
}

function miniKpi(doc: jsPDF, x: number, y: number, w: number, h: number,
  label: string, value: string, sub: string, color: string): void {
  doc.setFillColor(...hex(C.lightGray))
  doc.setDrawColor(...hex(C.border))
  doc.roundedRect(x, y, w, h, 2, 2, 'FD')
  doc.setFillColor(...hex(color))
  doc.rect(x, y, w, 2, 'F')
  doc.setTextColor(...hex(color))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(15)
  doc.text(value, x + w/2, y + 13, { align: 'center' })
  doc.setTextColor(...hex(C.dark))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(6.5)
  doc.text(label.toUpperCase(), x + w/2, y + 20, { align: 'center' })
  doc.setTextColor(...hex(C.gray))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(5.5)
  doc.text(sub, x + w/2, y + 25.5, { align: 'center' })
}

// ── Exportación principal ─────────────────────────────────────

export interface ReportInput {
  area?: string
  tasks: RcTask[]
  commentCounts: Record<string, number>
}

export function generateReportPDF({ area, tasks, commentCounts }: ReportInput): string {
  const doc  = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W    = 210
  const mg   = 14
  const cW   = W - mg * 2
  let y      = mg
  type DocEx = jsPDF & { lastAutoTable: { finalY: number } }
  const dx = doc as DocEx

  const scope    = tasks.filter(t => t.area !== 'Mi Cerebro' && (!area || t.area === area))
  const dist     = calcSemaphoreDistribution(scope)
  const otcr     = calcOTCR(scope)
  const lt       = calcLeadTime(scope)
  const netProd  = calcNetProductivity(scope)
  const rt       = calcReactionTime(scope)
  const totalC   = scope.reduce((s,t) => s + (commentCounts[t.id] ?? 0), 0)
  const pimp     = scope.length > 0 ? Math.round((totalC / scope.length) * 10) / 10 : 0
  const redPct   = dist.total > 0 ? Math.round((dist.red  / dist.total) * 100) : 0
  const active   = dist.red + dist.yellow + dist.green
  const analysis = buildAnalysis(tasks, commentCounts, area)

  const dateStr = new Date().toLocaleDateString('es-CL', { day:'2-digit', month:'long', year:'numeric' })
  const today   = new Date()

  // ══════════════════════════════════════════════════════════
  // PÁGINA 1
  // ══════════════════════════════════════════════════════════

  // ── Franja superior dorada ──
  doc.setFillColor(...hex(C.gold))
  doc.rect(0, 0, W, 1.5, 'F')

  // ── Logo + brand ──
  doc.setFillColor(...hex(C.gold))
  doc.roundedRect(mg, y + 2, 14, 14, 2, 2, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(7.5)
  doc.text('RC', mg + 7, y + 11, { align: 'center' })

  doc.setTextColor(...hex(C.gold))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9)
  doc.text('EL REGRESO CONTROL', mg + 18, y + 7)
  doc.setTextColor(...hex(C.gray))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(6)
  doc.text('SISTEMA OPERATIVO EJECUTIVO — CONFIDENCIAL', mg + 18, y + 12)

  doc.setTextColor(...hex(C.gray))
  doc.setFontSize(7)
  doc.text(dateStr, W - mg, y + 7, { align: 'right' })
  doc.text(
    `${today.toLocaleDateString('es-CL', { weekday: 'long' })}`,
    W - mg, y + 12, { align: 'right' }
  )
  y += 22

  // ── Separador ──
  doc.setDrawColor(...hex(C.border))
  doc.setLineWidth(0.4)
  doc.line(mg, y, W - mg, y)
  y += 7

  // ── Título del reporte ──
  doc.setTextColor(...hex(C.dark))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.text(area ? `Reporte de Area: ${area}` : 'Reporte General de Gestion', mg, y)
  y += 7

  doc.setTextColor(...hex(C.gray))
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(8.5)
  doc.text(`"${analysis.headline}"`, mg, y)
  y += 9

  // ── Barra semaforo global ──
  if (dist.total > 0) {
    const barW = cW
    const barH = 5
    let bx = mg
    const colors = [
      { v: dist.red,    c: C.red    },
      { v: dist.yellow, c: C.yellow },
      { v: dist.green,  c: C.green  },
      { v: dist.blue,   c: C.blue   },
    ]
    colors.forEach(({ v, c }) => {
      if (v <= 0) return
      const w = (v / dist.total) * barW
      doc.setFillColor(...hex(c))
      doc.rect(bx, y, w, barH, 'F')
      bx += w
    })
    // Labels debajo
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6)
    const labels = [
      { v: dist.red,    c: C.red,    t: `${dist.red} Criticas` },
      { v: dist.yellow, c: C.yellow, t: `${dist.yellow} Alerta` },
      { v: dist.green,  c: C.green,  t: `${dist.green} En Plazo` },
      { v: dist.blue,   c: C.blue,   t: `${dist.blue} Completas` },
    ]
    let lx = mg
    labels.forEach(({ v, c, t }) => {
      if (v <= 0) return
      const w = (v / dist.total) * barW
      doc.setTextColor(...hex(c))
      doc.text(t, lx + w/2, y + barH + 4, { align: 'center' })
      lx += w
    })
    y += barH + 8
  }

  // ── KPI Banner (6 cajas) ──
  const kpiData = [
    {
      label: 'Efectividad', value: otcr.total > 0 ? `${otcr.rate}%` : '--',
      sub: otcrLabel(otcr.rate, otcr.total),
      color: otcr.rate >= 85 ? C.green : otcr.rate >= 70 ? C.yellow : C.red,
    },
    {
      label: 'Tareas Criticas', value: dist.red.toString(),
      sub: redPct > 0 ? `${redPct}% del total` : 'Sin riesgo',
      color: dist.red > 0 ? C.red : C.green,
    },
    {
      label: 'Lead Time', value: lt.avg > 0 ? `${lt.avg}d` : '--',
      sub: lt.avg > 0 ? `min ${lt.min}d / max ${lt.max}d` : 'Sin datos',
      color: lt.avg <= 7 ? C.green : lt.avg <= 14 ? C.yellow : C.red,
    },
    {
      label: 'Productividad', value: netProd.created > 0 ? `${netProd.ratio.toFixed(1)}x` : '--',
      sub: netProd.created > 0 ? `${netProd.closed} cerradas / ${netProd.created} creadas` : 'Esta semana',
      color: netProd.ratio >= 1 ? C.green : netProd.ratio >= 0.7 ? C.yellow : C.red,
    },
    {
      label: 'Pimponeo', value: pimp > 0 ? `${pimp}` : '--',
      sub: pimp > 0 ? 'msg / tarea' : 'Sin comentarios',
      color: pimp < 2 ? C.green : pimp < 3 ? C.yellow : C.red,
    },
    {
      label: 'Sin Iniciar', value: rt.pending.toString(),
      sub: rt.pending > 0 ? `${rt.pendingOver24h} llevan >24h` : 'Todo en curso',
      color: rt.pendingOver72h > 0 ? C.red : rt.pending > 0 ? C.yellow : C.green,
    },
  ]
  const kpiW  = cW / 6
  const kpiH  = 30
  kpiData.forEach((k, i) => miniKpi(doc, mg + i * kpiW, y, kpiW - 1, kpiH, k.label, k.value, k.sub, k.color))
  y += kpiH + 10

  // ── Estadísticas generales ──
  const stats = [
    { label: 'Total tareas', value: dist.total.toString() },
    { label: 'Activas',      value: active.toString() },
    { label: 'Completadas',  value: dist.blue.toString() },
    { label: 'Nivel riesgo', value: riskLevel(redPct) },
    ...(area ? [] : [{ label: 'Areas evaluadas', value: String(
      calcAreaKpis(scope, (Object.values(MACRO_AREAS) as typeof MACRO_AREAS[MacroKey][])
        .flatMap(m => [...m.areas])).filter(a => a.total > 0).length
    )}]),
  ]
  doc.setFillColor(...hex(C.lightGray))
  doc.setDrawColor(...hex(C.border))
  doc.roundedRect(mg, y, cW, 10, 2, 2, 'FD')
  const statW = cW / stats.length
  stats.forEach((s, i) => {
    const sx = mg + i * statW
    doc.setTextColor(...hex(C.gray))
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6)
    doc.text(s.label.toUpperCase(), sx + statW/2, y + 3.5, { align: 'center' })
    doc.setTextColor(...hex(C.dark))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8.5)
    doc.text(s.value, sx + statW/2, y + 8, { align: 'center' })
    if (i < stats.length - 1) {
      doc.setDrawColor(...hex(C.border))
      doc.line(sx + statW, y + 2, sx + statW, y + 8)
    }
  })
  y += 16

  // ══════════════════════════════════════════════════════════
  // CUERPO: General vs Área
  // ══════════════════════════════════════════════════════════

  if (!area) {
    // ── Reporte General ──

    const allAreaNames = (Object.values(MACRO_AREAS) as typeof MACRO_AREAS[MacroKey][]).flatMap(m => [...m.areas])
    const areaKpis = calcAreaKpis(scope, allAreaNames).filter(a => a.total > 0)
    const sorted   = [...areaKpis].sort((a,b) => b.otcr - a.otcr || a.red - b.red)

    // ── Resumen por macro-area ──
    y = sectionTitle(doc, 'Comparativa por Unidad de Negocio', y, mg, cW)

    const macros = (Object.entries(MACRO_AREAS) as [MacroKey, typeof MACRO_AREAS[MacroKey]][]).map(([, m]) => {
      const mN   = m.areas as readonly string[]
      const mK   = areaKpis.filter(a => mN.includes(a.area))
      const mTot = mK.reduce((s,a) => s + a.total, 0)
      const mRed = mK.reduce((s,a) => s + a.red,   0)
      const mBlu = mK.reduce((s,a) => s + a.blue,  0)
      const mOtcr = mK.filter(a => a.otcr > 0).length > 0
        ? Math.round(mK.reduce((s,a) => s + a.otcr, 0) / mK.filter(a => a.otcr > 0).length) : 0
      const mRedPct = mTot > 0 ? Math.round((mRed / mTot) * 100) : 0
      return { label: m.label, code: m.code, total: mTot, red: mRed, blue: mBlu, otcr: mOtcr, redPct: mRedPct, areas: mN.length }
    }).filter(m => m.total > 0)

    if (macros.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: mg, right: mg },
        head: [['Unidad de Negocio', 'Areas', 'Total', 'Criticas', 'Completadas', 'OTCR Grupo', 'Nivel Riesgo']],
        body: macros.map(m => [
          m.label, m.areas.toString(), m.total.toString(),
          m.red.toString(), m.blue.toString(),
          m.otcr > 0 ? `${m.otcr}%` : '--',
          `${m.redPct}% (${riskLevel(m.redPct)})`,
        ]),
        headStyles: { fillColor: hex(C.headerBg), textColor: [255,255,255], fontSize: 7.5, fontStyle: 'bold', cellPadding: 4 },
        bodyStyles: { fontSize: 8, cellPadding: 4, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 46 },
          1: { cellWidth: 16, halign: 'center' },
          2: { cellWidth: 16, halign: 'center' },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 22, halign: 'center' },
          5: { cellWidth: 22, halign: 'center' },
          6: { cellWidth: 32, halign: 'center' },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          const m = macros[d.row.index]
          if (!m) return
          if (d.column.index === 3 && m.red > 0) { d.cell.styles.textColor = hex(C.red); d.cell.styles.fontStyle = 'bold' }
          if (d.column.index === 5 && m.otcr > 0) {
            d.cell.styles.textColor = m.otcr >= 85 ? hex(C.green) : m.otcr >= 70 ? hex(C.yellow) : hex(C.red)
          }
          if (d.column.index === 6) {
            d.cell.styles.textColor = m.redPct === 0 ? hex(C.green) : m.redPct < 20 ? hex(C.yellow) : hex(C.red)
          }
        },
        alternateRowStyles: { fillColor: hex('#F7F8FA') },
      })
      y = dx.lastAutoTable.finalY + 8
    }

    // ── Ranking detallado de areas ──
    if (y > 230) { doc.addPage(); y = mg + 8 }
    y = sectionTitle(doc, 'Ranking de Areas por Cumplimiento', y, mg, cW)

    if (sorted.length) {
      autoTable(doc, {
        startY: y,
        margin: { left: mg, right: mg },
        head: [['#', 'Area', 'Total', 'Criticas', 'Alerta', 'En Plazo', 'Compl.', 'OTCR %', 'Riesgo', 'Lead T.']],
        body: sorted.map((k, i) => {
          const rp = k.total > 0 ? Math.round((k.red / k.total) * 100) : 0
          return [
            (i+1).toString(), k.area,
            k.total.toString(), k.red.toString(), k.yellow.toString(),
            k.green.toString(), k.blue.toString(),
            k.otcr > 0 ? `${k.otcr}%` : '--',
            `${rp}%`,
            k.leadTime > 0 ? `${k.leadTime}d` : '--',
          ]
        }),
        headStyles: { fillColor: hex(C.headerBg), textColor: [255,255,255], fontSize: 7, fontStyle: 'bold', cellPadding: 3.5 },
        bodyStyles: { fontSize: 7.5, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 8,  halign: 'center' },
          1: { cellWidth: 34 },
          2: { cellWidth: 12, halign: 'center' },
          3: { cellWidth: 14, halign: 'center' },
          4: { cellWidth: 14, halign: 'center' },
          5: { cellWidth: 14, halign: 'center' },
          6: { cellWidth: 13, halign: 'center' },
          7: { cellWidth: 17, halign: 'center' },
          8: { cellWidth: 16, halign: 'center' },
          9: { cellWidth: 16, halign: 'center' },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          const k = sorted[d.row.index]
          if (!k) return
          if (d.column.index === 3 && k.red > 0) { d.cell.styles.textColor = hex(C.red); d.cell.styles.fontStyle = 'bold' }
          if (d.column.index === 7 && k.otcr > 0) {
            d.cell.styles.textColor = k.otcr >= 85 ? hex(C.green) : k.otcr >= 70 ? hex(C.yellow) : hex(C.red)
            d.cell.styles.fontStyle = 'bold'
          }
          if (d.column.index === 8) {
            const rp = k.total > 0 ? (k.red / k.total) * 100 : 0
            d.cell.styles.textColor = rp === 0 ? hex(C.green) : rp < 20 ? hex(C.yellow) : hex(C.red)
          }
          if (d.row.index === 0) d.cell.styles.fillColor = hex('#FDFBE8')
        },
        alternateRowStyles: { fillColor: hex('#F7F8FA') },
      })
      y = dx.lastAutoTable.finalY + 8
    }

    // ── Alertas criticas: top tareas en rojo ──
    const criticalAll = scope
      .filter(t => getSemaphore(t.plazo, t.estado).color === 'red')
      .sort((a,b) => a.plazo.localeCompare(b.plazo))
      .slice(0, 8)

    if (criticalAll.length > 0) {
      if (y > 220) { doc.addPage(); y = mg + 8 }
      y = sectionTitle(doc, `Alertas Criticas — ${criticalAll.length} Tareas Vencidas o en Limite`, y, mg, cW)
      autoTable(doc, {
        startY: y,
        margin: { left: mg, right: mg },
        head: [['Tarea', 'Area', 'Responsable', 'Plazo', 'Demora']],
        body: criticalAll.map(t => {
          const s = getSemaphore(t.plazo, t.estado)
          return [
            t.titulo.length > 38 ? t.titulo.slice(0, 35) + '...' : t.titulo,
            t.area,
            t.responsable?.nombre ?? '--',
            formatPlazo(t.plazo),
            s.label,
          ]
        }),
        headStyles: {
          fillColor: hex('#5A0000'), textColor: [255,255,255],
          fontSize: 7.5, fontStyle: 'bold', cellPadding: 3.5,
        },
        bodyStyles: { fontSize: 7, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 55 },
          1: { cellWidth: 28 },
          2: { cellWidth: 32 },
          3: { cellWidth: 22, halign: 'center' },
          4: { cellWidth: 25, halign: 'center' },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          if (d.column.index === 4) {
            d.cell.styles.textColor = hex(C.red)
            d.cell.styles.fontStyle = 'bold'
          }
        },
        alternateRowStyles: { fillColor: hex('#FFF5F5') },
      })
      y = dx.lastAutoTable.finalY + 8
    }

  } else {
    // ── Reporte por Área ──

    // Responsables únicos
    const responsablesMap = new Map<string, { nombre: string; total: number; red: number; yellow: number; blue: number }>()
    scope.forEach(t => {
      const nombre = t.responsable?.nombre ?? 'Sin asignar'
      const s = getSemaphore(t.plazo, t.estado)
      if (!responsablesMap.has(nombre)) responsablesMap.set(nombre, { nombre, total: 0, red: 0, yellow: 0, blue: 0 })
      const r = responsablesMap.get(nombre)!
      r.total++
      if (s.color === 'red')    r.red++
      if (s.color === 'yellow') r.yellow++
      if (s.color === 'blue')   r.blue++
    })
    const responsables = Array.from(responsablesMap.values()).sort((a,b) => b.red - a.red || b.total - a.total)

    // ── Tabla por responsable ──
    if (responsables.length > 0) {
      y = sectionTitle(doc, 'Distribucion por Responsable', y, mg, cW)
      autoTable(doc, {
        startY: y,
        margin: { left: mg, right: mg },
        head: [['Responsable', 'Total', 'Criticas', 'En Alerta', 'Completadas', 'Estado']],
        body: responsables.map(r => {
          const rp = r.total > 0 ? Math.round((r.red / r.total) * 100) : 0
          const estado = r.red > 0 ? 'Requiere atencion' : r.yellow > 0 ? 'Monitorear' : 'Al dia'
          return [r.nombre, r.total.toString(), r.red.toString(), r.yellow.toString(), r.blue.toString(), estado]
        }),
        headStyles: { fillColor: hex(C.headerBg), textColor: [255,255,255], fontSize: 7.5, fontStyle: 'bold', cellPadding: 3.5 },
        bodyStyles: { fontSize: 8, cellPadding: 3.5 },
        columnStyles: {
          0: { cellWidth: 40 },
          1: { cellWidth: 15, halign: 'center' },
          2: { cellWidth: 18, halign: 'center' },
          3: { cellWidth: 18, halign: 'center' },
          4: { cellWidth: 22, halign: 'center' },
          5: { cellWidth: 35 },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          const r = responsables[d.row.index]
          if (!r) return
          if (d.column.index === 2 && r.red > 0) { d.cell.styles.textColor = hex(C.red); d.cell.styles.fontStyle = 'bold' }
          if (d.column.index === 5) {
            d.cell.styles.textColor = r.red > 0 ? hex(C.red) : r.yellow > 0 ? hex(C.yellow) : hex(C.green)
            d.cell.styles.fontStyle = 'bold'
          }
        },
        alternateRowStyles: { fillColor: hex('#F7F8FA') },
      })
      y = dx.lastAutoTable.finalY + 8
    }

    // ── Tareas criticas y en alerta ──
    const critical = scope
      .filter(t => { const s = getSemaphore(t.plazo, t.estado); return s.color === 'red' || s.color === 'yellow' })
      .sort((a,b) => a.plazo.localeCompare(b.plazo))

    if (y > 225) { doc.addPage(); y = mg + 8 }
    y = sectionTitle(doc,
      critical.length > 0
        ? `Tareas Criticas y en Alerta — ${critical.length} Requieren Atencion`
        : 'Estado de Tareas — Sin Alertas Activas',
      y, mg, cW
    )

    if (critical.length > 0) {
      autoTable(doc, {
        startY: y,
        margin: { left: mg, right: mg },
        head: [['Tarea', 'Responsable', 'Plazo', 'Estado', 'Retrasos', 'Comentarios']],
        body: critical.map(t => {
          const s = getSemaphore(t.plazo, t.estado)
          return [
            t.titulo.length > 40 ? t.titulo.slice(0,37)+'...' : t.titulo,
            t.responsable?.nombre ?? '--',
            formatPlazo(t.plazo),
            s.label,
            t.contador_retrasos.toString(),
            (commentCounts[t.id] ?? 0).toString(),
          ]
        }),
        headStyles: { fillColor: hex('#5A0000'), textColor: [255,255,255], fontSize: 7.5, fontStyle: 'bold', cellPadding: 3.5 },
        bodyStyles: { fontSize: 7, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 56 },
          1: { cellWidth: 30 },
          2: { cellWidth: 20, halign: 'center' },
          3: { cellWidth: 24, halign: 'center' },
          4: { cellWidth: 16, halign: 'center' },
          5: { cellWidth: 16, halign: 'center' },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          const t = critical[d.row.index]
          if (!t) return
          const s = getSemaphore(t.plazo, t.estado)
          if (d.column.index === 3) {
            d.cell.styles.textColor = s.color === 'red' ? hex(C.red) : hex(C.yellow)
            d.cell.styles.fontStyle = 'bold'
          }
          if (d.column.index === 4 && t.contador_retrasos > 0) {
            d.cell.styles.textColor = hex(C.red); d.cell.styles.fontStyle = 'bold'
          }
        },
        alternateRowStyles: { fillColor: hex('#FFF5F5') },
      })
      y = dx.lastAutoTable.finalY + 8
    } else {
      doc.setFillColor(...hex('#EEF9EE'))
      doc.setDrawColor(...hex('#86EFAC'))
      doc.roundedRect(mg, y, cW, 12, 3, 3, 'FD')
      doc.setTextColor(...hex(C.green))
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8.5)
      doc.text('Sin tareas criticas ni en alerta. El area opera dentro de los plazos establecidos.', mg + 6, y + 8)
      y += 18
    }

    // ── Listado completo ──
    if (scope.length > 0 && y < 230) {
      y = sectionTitle(doc, `Listado Completo — ${scope.length} Tareas del Area`, y, mg, cW)
      autoTable(doc, {
        startY: y,
        margin: { left: mg, right: mg },
        head: [['Tarea', 'Responsable', 'Plazo', 'Estado', 'Comentarios']],
        body: scope
          .sort((a,b) => a.plazo.localeCompare(b.plazo))
          .map(t => [
            t.titulo.length > 46 ? t.titulo.slice(0,43)+'...' : t.titulo,
            t.responsable?.nombre ?? '--',
            formatPlazo(t.plazo),
            t.estado,
            (commentCounts[t.id] ?? 0).toString(),
          ]),
        headStyles: { fillColor: hex(C.headerBg), textColor: [255,255,255], fontSize: 7.5, fontStyle: 'bold', cellPadding: 3.5 },
        bodyStyles: { fontSize: 7, cellPadding: 3 },
        columnStyles: {
          0: { cellWidth: 65 },
          1: { cellWidth: 35 },
          2: { cellWidth: 22, halign: 'center' },
          3: { cellWidth: 28 },
          4: { cellWidth: 12, halign: 'center' },
        },
        didParseCell: (d) => {
          if (d.section !== 'body') return
          if (d.column.index === 3) {
            const estado = d.cell.raw as string
            const colorMap: Record<string, string> = {
              'Asignada': C.blue, 'En Proceso': '#B85C00', 'Por Aprobar': C.gold,
              'Atrasada': C.red, 'Completada': C.green, 'Rechazada': C.red,
            }
            d.cell.styles.textColor = hex(colorMap[estado] ?? C.gray)
            if (estado === 'Atrasada' || estado === 'Rechazada') d.cell.styles.fontStyle = 'bold'
          }
        },
        alternateRowStyles: { fillColor: hex('#F7F8FA') },
      })
      y = dx.lastAutoTable.finalY + 8
    }
  }

  // ══════════════════════════════════════════════════════════
  // ANÁLISIS Y RECOMENDACIONES (última sección)
  // ══════════════════════════════════════════════════════════

  if (y > 200) { doc.addPage(); y = mg + 8 }
  y = sectionTitle(doc, 'Analisis Ejecutivo Detallado', y, mg, cW)

  // Párrafos del análisis
  analysis.paragraphs.forEach((p, idx) => {
    const lines = doc.splitTextToSize(p, cW - 8)
    const blockH = lines.length * 4.5 + 8

    if (y + blockH > 282) { doc.addPage(); y = mg + 8 }

    doc.setFillColor(...hex(idx % 2 === 0 ? C.lightGray : C.white))
    doc.setDrawColor(...hex(C.border))
    doc.setLineWidth(0.3)
    doc.roundedRect(mg, y, cW, blockH, 2, 2, 'FD')
    // Numeración
    doc.setFillColor(...hex(C.headerBg))
    doc.circle(mg + 5, y + blockH/2, 3.5, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.5)
    doc.text((idx+1).toString(), mg + 5, y + blockH/2 + 2.3, { align: 'center' })
    // Texto
    doc.setTextColor(...hex('#2D3748'))
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(lines, mg + 12, y + 6)
    y += blockH + 4
  })

  // Puntos positivos (si los hay)
  if (analysis.positives.length > 0) {
    if (y + 6 + analysis.positives.length * 7 > 282) { doc.addPage(); y = mg + 8 }
    y += 4
    doc.setTextColor(...hex(C.green))
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('Fortalezas identificadas:', mg, y)
    y += 6
    analysis.positives.forEach(pos => {
      if (y > 280) { doc.addPage(); y = mg + 8 }
      doc.setFillColor(...hex(C.green))
      doc.circle(mg + 2.5, y - 1, 1.5, 'F')
      doc.setTextColor(...hex(C.dark))
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(8)
      doc.text(pos, mg + 7, y)
      y += 6
    })
    y += 2
  }

  // Recomendaciones
  if (analysis.recommendations.length > 0) {
    if (y + 14 > 282) { doc.addPage(); y = mg + 8 }
    y = sectionTitle(doc, 'Recomendaciones de Accion', y, mg, cW)

    analysis.recommendations.forEach((rec, i) => {
      const lines = doc.splitTextToSize(rec, cW - 18)
      const recH  = lines.length * 4.5 + 8
      if (y + recH > 282) { doc.addPage(); y = mg + 8 }

      doc.setFillColor(...hex('#FFFBEA'))
      doc.setDrawColor(...hex(C.gold))
      doc.setLineWidth(0.4)
      doc.roundedRect(mg, y, cW, recH, 2, 2, 'FD')
      // Número en dorado
      doc.setFillColor(...hex(C.gold))
      doc.roundedRect(mg + 2, y + recH/2 - 4, 8, 8, 1.5, 1.5, 'F')
      doc.setTextColor(255, 255, 255)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.text((i+1).toString(), mg + 6, y + recH/2 + 2.5, { align: 'center' })
      // Texto
      doc.setTextColor(...hex('#2D2000'))
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7.8)
      doc.text(lines, mg + 14, y + 6)
      y += recH + 4
    })
  }

  // ── Nota de cierre ──
  if (y + 14 > 282) { doc.addPage(); y = mg + 8 }
  y += 6
  doc.setTextColor(...hex(C.gray))
  doc.setFont('helvetica', 'italic')
  doc.setFontSize(6.5)
  const nota = 'Este reporte fue generado automaticamente por El Regreso Control en base a datos en tiempo real. ' +
    'El analisis utiliza logica basada en los KPIs del sistema. Para decisiones criticas, complementar con contexto del equipo.'
  const notaLines = doc.splitTextToSize(nota, cW - 8)
  doc.text(notaLines, mg + 4, y)

  // ── Footer en todas las páginas ──
  const pages = doc.getNumberOfPages()
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p)
    doc.setDrawColor(...hex(C.border))
    doc.setLineWidth(0.3)
    doc.line(mg, 283, W - mg, 283)
    doc.setFillColor(...hex(C.gold))
    doc.rect(mg, 283, 1.5, 8, 'F')
    doc.setTextColor(...hex(C.gray))
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.5)
    doc.text('Cerveceria El Regreso · Sistema Operativo Ejecutivo · Confidencial', mg + 4, 287)
    doc.text(`${p} / ${pages}  ·  ${dateStr}`, W - mg, 287, { align: 'right' })
  }

  return doc.output('datauristring').split(',')[1]
}
