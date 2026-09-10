'use client'

// Generador de PDF para "Generar Reporte" de Control Comercial (spec §34-36).
// Client-side con jsPDF + jspdf-autotable, mismo stack que el resto de la app
// (lib/generate-pdf.ts) — no reinventa librería nueva.

import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

const C = {
  dark: '#111111',
  gray: '#555555',
  lightGray: '#F4F5F6',
  border: '#CCCCCC',
  gold: '#7A5C00',
  green: '#145E2E',
  red: '#C41A1A',
  white: '#FFFFFF',
}

function hex(h: string): [number, number, number] {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
}

export interface ReporteSnapshot {
  periodoNombre: string
  tipo: 'ejecutivo' | 'completo'
  kpis: { titulo: string; valor: string; variacion?: string }[]
  resumenTexto: string
  ventasPorTerritorio: { territorio: string; monto: string; litros: string }[]
  clientes?: { nuevos: number; consolidacionPct: number; reactivados: number; perdidos: number; crecimientoNeto: number }
  cobranza?: { deudaVencida: string; deudaMas90: string; recuperado: string; regularizadas: number }
  barriles?: { total: number; criticos: number; recuperados: number }
  equipo?: { territorio: string; ventaClp: string; crecimiento: string; clientesActivos: number; deudaVencida: string }[]
  insights: { texto: string; tipo: 'oportunidad' | 'alerta' }[]
}

export function generarReportePDF(s: ReporteSnapshot): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()
  const H = doc.internal.pageSize.getHeight()

  // ── Portada ──
  doc.setFillColor(...hex('#0A0A0A'))
  doc.rect(0, 0, W, H, 'F')
  doc.setTextColor(...hex('#D4AF37'))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.text('EL REGRESO', W / 2, H / 2 - 20, { align: 'center' })
  doc.setFontSize(26)
  doc.text('CONTROL COMERCIAL', W / 2, H / 2 - 8, { align: 'center' })
  doc.setTextColor(...hex('#E8DFC8'))
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(13)
  doc.text(s.periodoNombre, W / 2, H / 2 + 6, { align: 'center' })
  doc.setFontSize(9)
  doc.setTextColor(...hex('#7A7268'))
  doc.text(`Informe ${s.tipo === 'ejecutivo' ? 'Ejecutivo' : 'Completo'} · Generado el ${new Date().toLocaleDateString('es-CL')}`, W / 2, H / 2 + 14, { align: 'center' })

  // ── Resumen ejecutivo ──
  doc.addPage()
  let y = 20
  y = sectionTitle(doc, 'Resumen Ejecutivo', y, W)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(...hex(C.gray))
  const lineas = doc.splitTextToSize(s.resumenTexto, W - 30)
  doc.text(lineas, 15, y)
  y += lineas.length * 5 + 10

  autoTable(doc, {
    startY: y,
    head: [['KPI', 'Valor', 'Variación']],
    body: s.kpis.map(k => [k.titulo, k.valor, k.variacion ?? '—']),
    theme: 'grid',
    headStyles: { fillColor: hex('#1A1A2E'), textColor: hex(C.white), fontSize: 9 },
    bodyStyles: { fontSize: 9, textColor: hex(C.dark) },
    margin: { left: 15, right: 15 },
  })

  // ── Ventas por territorio ──
  doc.addPage()
  y = 20
  y = sectionTitle(doc, 'Ventas por territorio y canal', y, W)
  autoTable(doc, {
    startY: y,
    head: [['Territorio', 'Venta $', 'Litros']],
    body: s.ventasPorTerritorio.map(t => [t.territorio, t.monto, t.litros]),
    theme: 'striped',
    headStyles: { fillColor: hex('#1A1A2E'), fontSize: 9 },
    bodyStyles: { fontSize: 9 },
    margin: { left: 15, right: 15 },
  })

  if (s.tipo === 'completo') {
    // ── Clientes ──
    if (s.clientes) {
      doc.addPage()
      y = 20
      y = sectionTitle(doc, 'Clientes', y, W)
      autoTable(doc, {
        startY: y,
        body: [
          ['Clientes nuevos', String(s.clientes.nuevos)],
          ['Tasa de consolidación', `${s.clientes.consolidacionPct.toFixed(0)}%`],
          ['Reactivados', String(s.clientes.reactivados)],
          ['Perdidos (90+ días)', String(s.clientes.perdidos)],
          ['Crecimiento neto de cartera', String(s.clientes.crecimientoNeto)],
        ],
        theme: 'plain',
        bodyStyles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold' } },
        margin: { left: 15, right: 15 },
      })
    }

    // ── Cobranza ──
    if (s.cobranza) {
      const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 14
      y = finalY > H - 60 ? (doc.addPage(), 20) : finalY
      y = sectionTitle(doc, 'Cobranza', y, W)
      autoTable(doc, {
        startY: y,
        body: [
          ['Deuda vencida actual', s.cobranza.deudaVencida],
          ['Deuda +90 días', s.cobranza.deudaMas90],
          ['Recuperado en el período', s.cobranza.recuperado],
          ['Cuentas regularizadas', String(s.cobranza.regularizadas)],
        ],
        theme: 'plain',
        bodyStyles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold' } },
        margin: { left: 15, right: 15 },
      })
    }

    // ── Barriles ──
    if (s.barriles) {
      doc.addPage()
      y = 20
      y = sectionTitle(doc, 'Barriles', y, W)
      autoTable(doc, {
        startY: y,
        body: [
          ['Barriles pendientes', String(s.barriles.total)],
          ['Críticos (+90 días)', String(s.barriles.criticos)],
          ['Recuperados en el período', String(s.barriles.recuperados)],
        ],
        theme: 'plain',
        bodyStyles: { fontSize: 10 },
        columnStyles: { 0: { fontStyle: 'bold' } },
        margin: { left: 15, right: 15 },
      })
    }

    // ── Equipo ──
    if (s.equipo && s.equipo.length > 0) {
      doc.addPage()
      y = 20
      y = sectionTitle(doc, 'Equipo', y, W)
      autoTable(doc, {
        startY: y,
        head: [['Territorio', 'Venta $', 'Crec. YoY', 'Clientes activos', 'Deuda vencida']],
        body: s.equipo.map(e => [e.territorio, e.ventaClp, e.crecimiento, String(e.clientesActivos), e.deudaVencida]),
        theme: 'striped',
        headStyles: { fillColor: hex('#1A1A2E'), fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        margin: { left: 15, right: 15 },
      })
    }
  }

  // ── Oportunidades y riesgos ──
  if (s.insights.length > 0) {
    doc.addPage()
    y = 20
    y = sectionTitle(doc, 'Oportunidades y riesgos', y, W)
    doc.setFontSize(10)
    for (const ins of s.insights) {
      doc.setTextColor(...hex(ins.tipo === 'oportunidad' ? C.green : C.red))
      doc.setFont('helvetica', 'bold')
      doc.text(ins.tipo === 'oportunidad' ? '↑' : '⚠', 15, y)
      doc.setTextColor(...hex(C.dark))
      doc.setFont('helvetica', 'normal')
      const lineas2 = doc.splitTextToSize(ins.texto, W - 32)
      doc.text(lineas2, 21, y)
      y += lineas2.length * 5 + 3
    }
  }

  return doc.output('datauristring').split(',')[1]
}

function sectionTitle(doc: jsPDF, title: string, y: number, W: number): number {
  doc.setFillColor(...hex('#1A1A2E'))
  doc.rect(15, y - 6, W - 30, 9, 'F')
  doc.setTextColor(...hex(C.white))
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text(title, 18, y)
  return y + 12
}
