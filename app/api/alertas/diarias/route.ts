import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { VENDEDORES, CLIENTES_EXCLUIR } from '@/lib/types'
import {
  getDiasHabiles,
  getDiasHabilesTranscurridos,
  getMetaEsperadaAFecha,
  calcularCumplimiento,
  getEstadoSemaforo,
  getMensajePredictivo,
  SEMAFORO_LABELS,
  SEMAFORO_COLORS,
  type AnalyticsVendedor,
} from '@/lib/metas-engine'

export const dynamic = 'force-dynamic'

const SEMAFORO_EMOJI: Record<string, string> = {
  verde: '🟢',
  amarillo: '🟡',
  rojo: '🔴',
}

function buildEmailHTML(analytics: AnalyticsVendedor[], fecha: string): string {
  const fechaFmt = new Date(fecha + 'T12:00:00').toLocaleDateString('es-CL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })

  const vendedorBlocks = analytics.map(a => {
    const semMes = SEMAFORO_EMOJI[a.semaforoMes]
    const semSem = SEMAFORO_EMOJI[a.semaforoSemana]
    const colorMes = SEMAFORO_COLORS[a.semaforoMes]
    const colorSem = SEMAFORO_COLORS[a.semaforoSemana]

    const canalRows = a.porCanal
      .filter(c => c.metaMensual > 0)
      .map(c => `
        <tr>
          <td style="padding:6px 8px;color:#aaa;font-size:13px;">${c.canal}</td>
          <td style="padding:6px 8px;text-align:right;color:#fff;font-size:13px;">${c.realizadoMes.toFixed(0)} L</td>
          <td style="padding:6px 8px;text-align:right;color:#aaa;font-size:13px;">${c.metaMensual.toFixed(0)} L</td>
          <td style="padding:6px 8px;text-align:right;font-size:13px;color:${SEMAFORO_COLORS[c.semaforoMes]};">${c.pctMes.toFixed(1)}%</td>
        </tr>
      `).join('')

    const mensajeMes = a.mensajeMes
      ? `<div style="margin-top:12px;padding:10px 14px;background:#1C1500;border-left:3px solid #D4AF37;border-radius:4px;font-size:12px;color:#D4AF37;">${a.mensajeMes}</div>`
      : ''

    const mensajeSem = a.mensajeSemana
      ? `<div style="margin-top:8px;padding:10px 14px;background:#1C1500;border-left:3px solid #D4AF37;border-radius:4px;font-size:12px;color:#D4AF37;">${a.mensajeSemana}</div>`
      : ''

    return `
      <div style="background:#131313;border:1px solid rgba(212,175,55,0.15);border-radius:16px;margin-bottom:20px;overflow:hidden;">
        <div style="background:linear-gradient(135deg,#110D00,#1C1500);padding:16px 20px;border-bottom:1px solid rgba(212,175,55,0.15);">
          <h2 style="margin:0;font-size:18px;font-weight:800;color:#D4AF37;">${a.vendedor}</h2>
          <p style="margin:2px 0 0;font-size:12px;color:#7A7268;">${a.semanaLabel || 'Semana activa'}</p>
        </div>
        <div style="padding:20px;">
          <table style="width:100%;border-collapse:collapse;margin-bottom:12px;">
            <tr>
              <td style="padding:8px;background:#1C1C1C;border-radius:8px 0 0 8px;text-align:center;">
                <div style="font-size:11px;color:#7A7268;margin-bottom:4px;">MES ${semMes}</div>
                <div style="font-size:22px;font-weight:900;color:${colorMes};">${a.pctCumplimientoMes.toFixed(1)}%</div>
                <div style="font-size:11px;color:#aaa;">${a.realizadoMes.toFixed(0)} / ${a.metaMensual.toFixed(0)} L</div>
                <div style="font-size:11px;color:#7A7268;">${SEMAFORO_LABELS[a.semaforoMes]}</div>
              </td>
              <td style="width:8px;"></td>
              <td style="padding:8px;background:#1C1C1C;border-radius:0 8px 8px 0;text-align:center;">
                <div style="font-size:11px;color:#7A7268;margin-bottom:4px;">SEMANA ${semSem}</div>
                <div style="font-size:22px;font-weight:900;color:${colorSem};">${a.pctCumplimientoSemana.toFixed(1)}%</div>
                <div style="font-size:11px;color:#aaa;">${a.realizadoSemana.toFixed(0)} / ${a.metaSemanal.toFixed(0)} L</div>
                <div style="font-size:11px;color:#7A7268;">${SEMAFORO_LABELS[a.semaforoSemana]}</div>
              </td>
            </tr>
          </table>
          ${mensajeMes}
          ${mensajeSem}
          ${canalRows ? `
            <table style="width:100%;border-collapse:collapse;margin-top:16px;">
              <tr style="border-bottom:1px solid rgba(255,255,255,0.06);">
                <th style="padding:6px 8px;text-align:left;font-size:11px;color:#7A7268;font-weight:600;">CANAL</th>
                <th style="padding:6px 8px;text-align:right;font-size:11px;color:#7A7268;font-weight:600;">REAL</th>
                <th style="padding:6px 8px;text-align:right;font-size:11px;color:#7A7268;font-weight:600;">META</th>
                <th style="padding:6px 8px;text-align:right;font-size:11px;color:#7A7268;font-weight:600;">%C</th>
              </tr>
              ${canalRows}
            </table>
          ` : ''}
        </div>
      </div>
    `
  }).join('')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#080808;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px 16px;">
    <div style="text-align:center;margin-bottom:28px;">
      <div style="display:inline-block;background:#D4AF37;width:48px;height:48px;border-radius:12px;line-height:48px;font-size:24px;margin-bottom:12px;">🍺</div>
      <h1 style="margin:0;font-size:22px;font-weight:900;color:#F4EEDF;">Reporte Diario de Metas</h1>
      <p style="margin:4px 0 0;font-size:13px;color:#7A7268;text-transform:capitalize;">${fechaFmt}</p>
    </div>
    ${vendedorBlocks}
    <div style="text-align:center;margin-top:28px;padding-top:20px;border-top:1px solid rgba(255,255,255,0.06);">
      <p style="font-size:11px;color:#7A7268;margin:0;">Cervecería El Regreso · Valdivia, Chile</p>
    </div>
  </div>
</body>
</html>`
}

export async function GET(req: NextRequest) {
  const secret = req.headers.get('authorization')
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Fetch admin emails from DB
  const { data: adminUsers } = await supabase
    .from('users')
    .select('email')
    .eq('is_admin', true)
  const adminEmails = (adminUsers ?? []).map(u => u.email).filter(Boolean) as string[]

  const { data: ultima } = await supabase
    .from('ventas')
    .select('fecha_pedido')
    .in('vendedor_actual', VENDEDORES)
    .order('fecha_pedido', { ascending: false })
    .limit(1)
    .single()

  const fechaRef = ultima?.fecha_pedido
    ? new Date(ultima.fecha_pedido + 'T12:00:00')
    : new Date()
  const fechaStr = fechaRef.toISOString().split('T')[0]

  const [{ data: metasSemanales }, { data: metasMensuales }] = await Promise.all([
    supabase.from('metas').select('*').eq('tipo', 'semanal').lte('fecha_inicio', fechaStr).gte('fecha_fin', fechaStr),
    supabase.from('metas').select('*').eq('tipo', 'mensual').lte('fecha_inicio', fechaStr).gte('fecha_fin', fechaStr),
  ])

  if (!metasSemanales?.length && !metasMensuales?.length) {
    return NextResponse.json({ ok: false, reason: 'sin_metas' })
  }

  const semanaActiva = metasSemanales?.[0]
    ? { inicio: metasSemanales[0].fecha_inicio, fin: metasSemanales[0].fecha_fin }
    : null
  const mesActivo = metasMensuales?.[0]
    ? { inicio: metasMensuales[0].fecha_inicio, fin: metasMensuales[0].fecha_fin }
    : null

  const clientes_ex = CLIENTES_EXCLUIR
  const [{ data: ventasMes }, { data: ventasSemana }] = await Promise.all([
    mesActivo
      ? supabase.from('ventas').select('vendedor_actual, categoria_negocio, litros')
          .in('vendedor_actual', VENDEDORES)
          .gte('fecha_pedido', mesActivo.inicio).lte('fecha_pedido', fechaStr)
          .not('nombre_fantasia', 'in', `(${clientes_ex.map(c => `"${c}"`).join(',')})`)
      : Promise.resolve({ data: [] }),
    semanaActiva
      ? supabase.from('ventas').select('vendedor_actual, categoria_negocio, litros')
          .in('vendedor_actual', VENDEDORES)
          .gte('fecha_pedido', semanaActiva.inicio).lte('fecha_pedido', fechaStr)
          .not('nombre_fantasia', 'in', `(${clientes_ex.map(c => `"${c}"`).join(',')})`)
      : Promise.resolve({ data: [] }),
  ])

  const analytics: AnalyticsVendedor[] = VENDEDORES.map(vendedor => {
    const mSem = (metasSemanales ?? []).filter(m => m.vendedor === vendedor)
    const mMes = (metasMensuales ?? []).filter(m => m.vendedor === vendedor)
    const metaSemanalTotal = mSem.reduce((s, m) => s + (m.meta_litros ?? 0), 0)
    const metaMensualTotal = mMes.reduce((s, m) => s + (m.meta_litros ?? 0), 0)

    const vMes = (ventasMes ?? []).filter(v => v.vendedor_actual === vendedor)
    const vSem = (ventasSemana ?? []).filter(v => v.vendedor_actual === vendedor)
    const realizadoMes = vMes.reduce((s, v) => s + (v.litros ?? 0), 0)
    const realizadoSemana = vSem.reduce((s, v) => s + (v.litros ?? 0), 0)

    const dhMes = mesActivo ? getDiasHabiles(new Date(mesActivo.inicio), new Date(mesActivo.fin + 'T23:59:59')) : []
    const dhSem = semanaActiva ? getDiasHabiles(new Date(semanaActiva.inicio), new Date(semanaActiva.fin + 'T23:59:59')) : []

    const diasHabilesMes = dhMes.length
    const diasHabilesSemana = dhSem.length
    const diasTranscurridosMes = getDiasHabilesTranscurridos(dhMes, fechaRef)
    const diasTranscurridosSemana = getDiasHabilesTranscurridos(dhSem, fechaRef)
    const diasRestantesMes = diasHabilesMes - diasTranscurridosMes
    const diasRestantesSemana = diasHabilesSemana - diasTranscurridosSemana

    const metaEsperadaMes = getMetaEsperadaAFecha(metaMensualTotal, dhMes, fechaRef)
    const metaEsperadaSemana = getMetaEsperadaAFecha(metaSemanalTotal, dhSem, fechaRef)
    const faltanteMes = Math.max(0, metaMensualTotal - realizadoMes)
    const faltanteSemana = Math.max(0, metaSemanalTotal - realizadoSemana)

    const allCanales = [...new Set([...mMes.map(m => m.categoria_negocio), ...mSem.map(m => m.categoria_negocio)])]
    const porCanal = allCanales.map(canal => {
      const metaMes = mMes.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
      const metaSem = mSem.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
      const realMes = vMes.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
      const realSem = vSem.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
      const metaEspMes = getMetaEsperadaAFecha(metaMes, dhMes, fechaRef)
      const metaEspSem = getMetaEsperadaAFecha(metaSem, dhSem, fechaRef)
      return {
        canal,
        metaMensual: metaMes, metaSemanal: metaSem,
        realizadoMes: realMes, realizadoSemana: realSem,
        metaEsperadaMes: metaEspMes, metaEsperadaSemana: metaEspSem,
        pctMes: calcularCumplimiento(realMes, metaMes),
        pctSemana: calcularCumplimiento(realSem, metaSem),
        semaforoMes: getEstadoSemaforo(realMes, metaEspMes),
        semaforoSemana: getEstadoSemaforo(realSem, metaEspSem),
      }
    }).sort((a, b) => b.metaMensual - a.metaMensual)

    const semNum = mSem[0]?.semana_numero ?? 0
    const semanaLabel = semanaActiva
      ? `S${semNum} · ${semanaActiva.inicio.slice(8)} – ${semanaActiva.fin.slice(8)} ${mesActivo?.inicio.slice(5, 7) === '05' ? 'May' : mesActivo?.inicio.slice(5, 7) === '06' ? 'Jun' : 'Jul'}`
      : ''

    return {
      vendedor, fecha: fechaStr,
      metaMensual: metaMensualTotal, realizadoMes, metaEsperadaMes,
      pctCumplimientoMes: calcularCumplimiento(realizadoMes, metaMensualTotal),
      semaforoMes: getEstadoSemaforo(realizadoMes, metaEsperadaMes),
      diasHabilesMes, diasTranscurridosMes, diasRestantesMes, faltanteMes,
      promedioNecesarioDiarioMes: diasRestantesMes > 0 ? faltanteMes / diasRestantesMes : 0,
      mensajeMes: getMensajePredictivo(faltanteMes, diasRestantesMes),
      semanaLabel,
      metaSemanal: metaSemanalTotal, realizadoSemana, metaEsperadaSemana,
      pctCumplimientoSemana: calcularCumplimiento(realizadoSemana, metaSemanalTotal),
      semaforoSemana: getEstadoSemaforo(realizadoSemana, metaEsperadaSemana),
      diasHabilesSemana, diasTranscurridosSemana, diasRestantesSemana, faltanteSemana,
      promedioNecesarioDiarioSemana: diasRestantesSemana > 0 ? faltanteSemana / diasRestantesSemana : 0,
      mensajeSemana: getMensajePredictivo(faltanteSemana, diasRestantesSemana),
      porCanal,
    }
  })

  const html = buildEmailHTML(analytics, fechaStr)

  const resendRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Ventas El Regreso <alertas@elregresobeer.com>',
      to: adminEmails,
      subject: `Reporte de Metas · ${fechaStr}`,
      html,
    }),
  })

  if (!resendRes.ok) {
    const err = await resendRes.text()
    return NextResponse.json({ ok: false, error: err }, { status: 500 })
  }

  return NextResponse.json({ ok: true, fecha: fechaStr, vendedores: VENDEDORES })
}
