'use client'

import { useMemo, useState } from 'react'
import { Target, Calendar, CheckCircle, Clock } from 'lucide-react'
import { Periodo } from '@/lib/types'
import {
  getDiasHabiles,
  getDiasHabilesTranscurridos,
  getMetaEsperadaAFecha,
  calcularCumplimiento,
  getEstadoSemaforo,
  getMensajePredictivo,
  SEMAFORO_COLORS,
  SEMAFORO_BG,
  SEMAFORO_LABELS,
  CANAL_COLORS,
  type EstadoSemaforo,
  type AnalyticsCanal,
  type AnalyticsVendedor,
} from '@/lib/metas-engine'

type Vista = 'diario' | 'semanal' | 'mensual'

interface VentaRow {
  vendedor_actual: string
  litros: number
  categoria_negocio: string | null
  fecha_pedido: string
}

interface MetaRow {
  id: number
  periodo_id: number | null
  vendedor: string
  tipo: string
  semana_numero: number | null
  fecha_inicio: string
  fecha_fin: string
  categoria_negocio: string
  meta_litros: number
}

interface CanalDiario {
  canal: string
  realHoy: number
  metaDiaria: number
  semaforo: EstadoSemaforo
  color: string
}

interface AnalyticsExtended extends AnalyticsVendedor {
  realizadoHoy: number
  metaDiaria: number
  semaforoDiario: EstadoSemaforo
  porCanalHoy: CanalDiario[]
}

interface Props {
  metasSemanales: MetaRow[]
  metasMensuales: MetaRow[]
  ventasMes: VentaRow[]
  ventasSemana: VentaRow[]
  fechaRef: string
  mesInicio: string
  mesFin: string
  semanaInicio: string
  semanaFin: string
  periodo: Periodo | null
  vendedores: string[]
}

function fmt(n: number) { return n.toFixed(1) }

function fmtFecha(d: string) {
  const [, m, day] = d.split('-')
  const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${parseInt(day)} ${M[parseInt(m)-1]}`
}

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()
}

function SemaforoDot({ estado }: { estado: EstadoSemaforo }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{
        width: 10, height: 10, borderRadius: '50%',
        background: SEMAFORO_COLORS[estado],
        boxShadow: `0 0 6px ${SEMAFORO_COLORS[estado]}88`,
      }} />
      <span style={{ fontSize: 11, fontWeight: 700, color: SEMAFORO_COLORS[estado], letterSpacing: '0.5px' }}>
        {SEMAFORO_LABELS[estado].toUpperCase()}
      </span>
    </div>
  )
}

function BarraDual({ meta, realizado, esperado, semaforo }: {
  meta: number; realizado: number; esperado: number; semaforo: EstadoSemaforo
}) {
  const pctReal = meta > 0 ? Math.min(100, (realizado / meta) * 100) : 0
  const pctEsp  = meta > 0 ? Math.min(100, (esperado / meta) * 100) : 0

  return (
    <div style={{ position: 'relative', height: 10, borderRadius: 10, background: 'rgba(255,255,255,0.06)' }}>
      <div className="animate-progress" style={{
        position: 'absolute', top: 0, left: 0, height: '100%', borderRadius: 10,
        width: `${pctReal}%`, background: SEMAFORO_COLORS[semaforo],
      }} />
      {pctEsp > 0 && pctEsp <= 100 && (
        <div style={{
          position: 'absolute', top: -3, left: `${pctEsp}%`,
          width: 2, height: 16, background: 'rgba(255,255,255,0.55)',
          borderRadius: 2, transform: 'translateX(-50%)',
        }} />
      )}
    </div>
  )
}

function CanalRow({ c, vista, canalDiario }: { c: AnalyticsCanal; vista: Vista; canalDiario?: CanalDiario }) {
  const color = CANAL_COLORS[c.canal] ?? '#6B7280'

  if (vista === 'diario') {
    if (!canalDiario || canalDiario.metaDiaria <= 0) return null
    const pct = calcularCumplimiento(canalDiario.realHoy, canalDiario.metaDiaria)
    return (
      <div style={{
        padding: '11px 14px', borderRadius: 12, background: 'var(--surface2)',
        borderLeft: `3px solid ${SEMAFORO_COLORS[canalDiario.semaforo]}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{c.canal}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(canalDiario.realHoy)} / {fmt(canalDiario.metaDiaria)} L</span>
            <span style={{
              fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100,
              background: SEMAFORO_BG[canalDiario.semaforo], color: SEMAFORO_COLORS[canalDiario.semaforo],
              border: `1px solid ${SEMAFORO_COLORS[canalDiario.semaforo]}40`,
            }}>{pct.toFixed(0)}%</span>
          </div>
        </div>
        <BarraDual meta={canalDiario.metaDiaria} realizado={canalDiario.realHoy} esperado={canalDiario.metaDiaria} semaforo={canalDiario.semaforo} />
      </div>
    )
  }

  const meta     = vista === 'mensual' ? c.metaMensual     : c.metaSemanal
  const real     = vista === 'mensual' ? c.realizadoMes    : c.realizadoSemana
  const esperado = vista === 'mensual' ? c.metaEsperadaMes : c.metaEsperadaSemana
  const pct      = vista === 'mensual' ? c.pctMes          : c.pctSemana
  const semaforo = vista === 'mensual' ? c.semaforoMes     : c.semaforoSemana
  if (meta <= 0) return null

  return (
    <div style={{
      padding: '11px 14px', borderRadius: 12, background: 'var(--surface2)',
      borderLeft: `3px solid ${SEMAFORO_COLORS[semaforo]}`,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <div style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--cream)' }}>{c.canal}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>{fmt(real)} / {fmt(meta)} L</span>
          <span style={{
            fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 100,
            background: SEMAFORO_BG[semaforo], color: SEMAFORO_COLORS[semaforo],
            border: `1px solid ${SEMAFORO_COLORS[semaforo]}40`,
          }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <BarraDual meta={meta} realizado={real} esperado={esperado} semaforo={semaforo} />
    </div>
  )
}

function VendedorCard({ analytics, vista }: { analytics: AnalyticsExtended; vista: Vista }) {
  const isDiario  = vista === 'diario'
  const esMensual = vista === 'mensual'

  const meta      = isDiario  ? analytics.metaDiaria
                  : esMensual ? analytics.metaMensual           : analytics.metaSemanal
  const real      = isDiario  ? analytics.realizadoHoy
                  : esMensual ? analytics.realizadoMes          : analytics.realizadoSemana
  const esperado  = isDiario  ? analytics.metaDiaria
                  : esMensual ? analytics.metaEsperadaMes       : analytics.metaEsperadaSemana
  const pct       = isDiario  ? calcularCumplimiento(analytics.realizadoHoy, analytics.metaDiaria)
                  : esMensual ? analytics.pctCumplimientoMes    : analytics.pctCumplimientoSemana
  const semaforo  = isDiario  ? analytics.semaforoDiario
                  : esMensual ? analytics.semaforoMes           : analytics.semaforoSemana
  const faltante  = esMensual ? analytics.faltanteMes           : analytics.faltanteSemana
  const diasRest  = esMensual ? analytics.diasRestantesMes      : analytics.diasRestantesSemana
  const diasTrans = esMensual ? analytics.diasTranscurridosMes  : analytics.diasTranscurridosSemana
  const diasTotal = esMensual ? analytics.diasHabilesMes        : analytics.diasHabilesSemana
  const promNec   = esMensual ? analytics.promedioNecesarioDiarioMes : analytics.promedioNecesarioDiarioSemana
  const metaCumplida = real >= meta && meta > 0

  return (
    <div className="card-hover animate-fade-in" style={{
      background: 'var(--surface)',
      border: `1px solid ${metaCumplida ? 'rgba(74,122,58,0.4)' : 'var(--border)'}`,
      borderRadius: 20, overflow: 'hidden',
    }}>
      <div style={{ height: 4, background: SEMAFORO_COLORS[semaforo] }} />

      <div style={{ padding: '18px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%',
            background: SEMAFORO_COLORS[semaforo],
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, fontWeight: 900, color: '#080808', flexShrink: 0,
          }}>{getInitials(analytics.vendedor)}</div>
          <div>
            <h2 style={{ fontWeight: 800, color: 'var(--cream)', fontSize: 16, letterSpacing: '-0.3px' }}>
              {analytics.vendedor}
            </h2>
            <SemaforoDot estado={semaforo} />
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 30, fontWeight: 900, color: SEMAFORO_COLORS[semaforo], letterSpacing: '-1px', lineHeight: 1 }}>
            {pct.toFixed(0)}%
          </p>
          <p style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600 }}>cumplimiento</p>
        </div>
      </div>

      <div style={{ padding: '0 20px 14px' }}>
        <BarraDual meta={meta} realizado={real} esperado={esperado} semaforo={semaforo} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            Real: <strong style={{ color: 'var(--cream)' }}>{fmt(real)} L</strong>
          </span>
          <span style={{ fontSize: 10, color: 'var(--muted)' }}>
            Meta: <strong style={{ color: 'var(--cream)' }}>{fmt(meta)} L</strong>
          </span>
          {!isDiario && (
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>
              Esperado: <strong style={{ color: 'var(--cream)' }}>{fmt(esperado)} L</strong>
            </span>
          )}
        </div>
      </div>

      <div style={{ padding: '0 20px 14px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
        {[
          { label: 'Meta', value: `${fmt(meta)} L` },
          { label: 'Realizado', value: `${fmt(real)} L` },
          { label: metaCumplida ? '✓ Logrado' : 'Faltante', value: metaCumplida ? `+${fmt(real - meta)} L` : `${fmt(Math.max(0, meta - real))} L` },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: 'var(--surface2)', borderRadius: 12, padding: '10px 12px', textAlign: 'center' }}>
            <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 4 }}>
              {label}
            </p>
            <p style={{ fontSize: 14, fontWeight: 800, color: metaCumplida && label.startsWith('✓') ? '#4A7A3A' : 'var(--cream)', letterSpacing: '-0.3px' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      {!isDiario && (
        <div style={{ padding: '0 20px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 10, color: 'var(--muted)' }}>Días hábiles transcurridos</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--cream)' }}>{diasTrans} / {diasTotal}</span>
          </div>
          <div style={{ height: 4, borderRadius: 4, background: 'rgba(255,255,255,0.06)' }}>
            <div style={{
              height: '100%', borderRadius: 4,
              width: diasTotal > 0 ? `${(diasTrans / diasTotal) * 100}%` : '0%',
              background: 'rgba(255,255,255,0.18)',
            }} />
          </div>
        </div>
      )}

      {!isDiario && !metaCumplida && diasRest > 0 && (
        <div style={{
          margin: '0 20px 14px', padding: '10px 14px', borderRadius: 12,
          background: SEMAFORO_BG[semaforo], border: `1px solid ${SEMAFORO_COLORS[semaforo]}30`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
            <Clock size={13} color={SEMAFORO_COLORS[semaforo]} />
            <span style={{ fontSize: 10, fontWeight: 700, color: SEMAFORO_COLORS[semaforo], textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Proyección
            </span>
          </div>
          <p style={{ fontSize: 12, color: 'var(--cream)' }}>
            Necesitas promediar{' '}
            <span style={{ fontWeight: 800, color: SEMAFORO_COLORS[semaforo] }}>{fmt(promNec)} L/día</span>
            {' '}en los {diasRest} días hábiles restantes
          </p>
        </div>
      )}

      {metaCumplida && (
        <div style={{
          margin: '0 20px 14px', padding: '10px 14px', borderRadius: 12,
          background: 'rgba(74,122,58,0.1)', border: '1px solid rgba(74,122,58,0.3)',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <CheckCircle size={15} color="#4A7A3A" />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#4A7A3A' }}>¡Meta cumplida!</span>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Excedente: +{fmt(real - meta)} L</span>
        </div>
      )}

      <div style={{ padding: '0 20px 20px' }}>
        <p style={{ fontSize: 9, fontWeight: 700, color: 'var(--muted)', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: 10 }}>
          Por canal · {vista}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {isDiario
            ? analytics.porCanalHoy.map(cd => (
                <CanalRow
                  key={cd.canal}
                  c={analytics.porCanal.find(c => c.canal === cd.canal) ?? { canal: cd.canal } as AnalyticsCanal}
                  vista={vista}
                  canalDiario={cd}
                />
              ))
            : analytics.porCanal.map(c => (
                <CanalRow key={c.canal} c={c} vista={vista} />
              ))
          }
        </div>
      </div>
    </div>
  )
}

export default function MetasClient({
  metasSemanales, metasMensuales, ventasMes, ventasSemana,
  fechaRef, mesInicio, mesFin, semanaInicio, semanaFin,
  periodo, vendedores,
}: Props) {
  const [vista, setVista] = useState<Vista>('semanal')

  const analytics = useMemo<AnalyticsExtended[]>(() => {
    const fechaD = new Date(fechaRef + 'T12:00:00')

    return vendedores.map(vendedor => {
      const mSem = metasSemanales.filter(m => m.vendedor === vendedor)
      const mMes = metasMensuales.filter(m => m.vendedor === vendedor)
      const vMes = ventasMes.filter(v => v.vendedor_actual === vendedor)
      const vSem = ventasSemana.filter(v => v.vendedor_actual === vendedor)
      const vHoy = vMes.filter(v => v.fecha_pedido === fechaRef)

      const metaSemTotal = mSem.reduce((s, m) => s + (m.meta_litros ?? 0), 0)
      const metaMesTotal = mMes.reduce((s, m) => s + (m.meta_litros ?? 0), 0)
      const realMes = vMes.reduce((s, v) => s + (v.litros ?? 0), 0)
      const realSem = vSem.reduce((s, v) => s + (v.litros ?? 0), 0)
      const realizadoHoy = vHoy.reduce((s, v) => s + (v.litros ?? 0), 0)

      const dhMes = getDiasHabiles(new Date(mesInicio), new Date(mesFin + 'T23:59:59'))
      const dhSem = getDiasHabiles(new Date(semanaInicio), new Date(semanaFin + 'T23:59:59'))

      const dhMesTotal = dhMes.length
      const dhSemTotal = dhSem.length
      const dhMesTrans = getDiasHabilesTranscurridos(dhMes, fechaD)
      const dhSemTrans = getDiasHabilesTranscurridos(dhSem, fechaD)

      const espMes = getMetaEsperadaAFecha(metaMesTotal, dhMes, fechaD)
      const espSem = getMetaEsperadaAFecha(metaSemTotal, dhSem, fechaD)
      const faltMes = Math.max(0, metaMesTotal - realMes)
      const faltSem = Math.max(0, metaSemTotal - realSem)

      const metaDiaria = dhSemTotal > 0
        ? metaSemTotal / dhSemTotal
        : dhMesTotal > 0 ? metaMesTotal / dhMesTotal : 0

      const semaforoDiario = getEstadoSemaforo(realizadoHoy, metaDiaria)

      const allCanales = [...new Set([
        ...mMes.map(m => m.categoria_negocio),
        ...mSem.map(m => m.categoria_negocio),
      ])]

      const porCanalHoy: CanalDiario[] = allCanales.map(canal => {
        const metaS = mSem.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
        const metaDiariaCanal = dhSemTotal > 0 ? metaS / dhSemTotal : 0
        const rH = vHoy.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
        return {
          canal,
          realHoy: rH,
          metaDiaria: metaDiariaCanal,
          semaforo: getEstadoSemaforo(rH, metaDiariaCanal),
          color: CANAL_COLORS[canal] ?? '#6B7280',
        }
      }).filter(c => c.metaDiaria > 0).sort((a, b) => b.metaDiaria - a.metaDiaria)

      const porCanal: AnalyticsCanal[] = allCanales.map(canal => {
        const metaM = mMes.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
        const metaS = mSem.find(m => m.categoria_negocio === canal)?.meta_litros ?? 0
        const rM = vMes.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
        const rS = vSem.filter(v => v.categoria_negocio === canal).reduce((s, v) => s + (v.litros ?? 0), 0)
        const eM = getMetaEsperadaAFecha(metaM, dhMes, fechaD)
        const eS = getMetaEsperadaAFecha(metaS, dhSem, fechaD)
        return {
          canal,
          metaMensual: metaM, metaSemanal: metaS,
          realizadoMes: rM, realizadoSemana: rS,
          metaEsperadaMes: eM, metaEsperadaSemana: eS,
          pctMes: calcularCumplimiento(rM, metaM),
          pctSemana: calcularCumplimiento(rS, metaS),
          semaforoMes: getEstadoSemaforo(rM, eM),
          semaforoSemana: getEstadoSemaforo(rS, eS),
        }
      }).sort((a, b) => b.metaMensual - a.metaMensual)

      const semNum = mSem[0]?.semana_numero ?? 0
      const semLabel = semanaInicio ? `S${semNum} · ${fmtFecha(semanaInicio)} – ${fmtFecha(semanaFin)}` : ''

      return {
        vendedor, fecha: fechaRef,
        metaMensual: metaMesTotal, realizadoMes: realMes, metaEsperadaMes: espMes,
        pctCumplimientoMes: calcularCumplimiento(realMes, metaMesTotal),
        semaforoMes: getEstadoSemaforo(realMes, espMes),
        diasHabilesMes: dhMesTotal, diasTranscurridosMes: dhMesTrans, diasRestantesMes: dhMesTotal - dhMesTrans,
        faltanteMes: faltMes,
        promedioNecesarioDiarioMes: (dhMesTotal - dhMesTrans) > 0 ? faltMes / (dhMesTotal - dhMesTrans) : 0,
        mensajeMes: getMensajePredictivo(faltMes, dhMesTotal - dhMesTrans),
        semanaLabel: semLabel,
        metaSemanal: metaSemTotal, realizadoSemana: realSem, metaEsperadaSemana: espSem,
        pctCumplimientoSemana: calcularCumplimiento(realSem, metaSemTotal),
        semaforoSemana: getEstadoSemaforo(realSem, espSem),
        diasHabilesSemana: dhSemTotal, diasTranscurridosSemana: dhSemTrans, diasRestantesSemana: dhSemTotal - dhSemTrans,
        faltanteSemana: faltSem,
        promedioNecesarioDiarioSemana: (dhSemTotal - dhSemTrans) > 0 ? faltSem / (dhSemTotal - dhSemTrans) : 0,
        mensajeSemana: getMensajePredictivo(faltSem, dhSemTotal - dhSemTrans),
        porCanal,
        realizadoHoy,
        metaDiaria,
        semaforoDiario,
        porCanalHoy,
      }
    })
  }, [metasSemanales, metasMensuales, ventasMes, ventasSemana, fechaRef, mesInicio, mesFin, semanaInicio, semanaFin, vendedores])

  const sinMetas = analytics.every(a => a.metaMensual === 0 && a.metaSemanal === 0)

  const totalReal = analytics.reduce((s, a) =>
    s + (vista === 'mensual' ? a.realizadoMes : vista === 'diario' ? a.realizadoHoy : a.realizadoSemana), 0)
  const totalMeta = analytics.reduce((s, a) =>
    s + (vista === 'mensual' ? a.metaMensual : vista === 'diario' ? a.metaDiaria : a.metaSemanal), 0)
  const totalEsp = analytics.reduce((s, a) =>
    s + (vista === 'mensual' ? a.metaEsperadaMes : vista === 'diario' ? a.metaDiaria : a.metaEsperadaSemana), 0)
  const pctEquipo = calcularCumplimiento(totalReal, totalMeta)
  const semEquipo = getEstadoSemaforo(totalReal, totalEsp)

  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const mesNombre = mesInicio
    ? `${meses[parseInt(mesInicio.split('-')[1]) - 1]} ${mesInicio.split('-')[0]}`
    : ''
  const semanaLabel = analytics[0]?.semanaLabel ?? ''
  const diaLabel = fmtFecha(fechaRef)

  const equipoLabel = vista === 'diario' ? `Día · ${diaLabel}`
    : vista === 'semanal' ? `Equipo · ${semanaLabel}`
    : `Equipo · ${mesNombre}`

  const tabs: { key: Vista; label: string }[] = [
    { key: 'diario',  label: `Día · ${diaLabel}` },
    { key: 'semanal', label: `Semana · ${semanaLabel}` },
    { key: 'mensual', label: `Mes · ${mesNombre}` },
  ]

  return (
    <div style={{ padding: '40px 48px 60px' }} className="px-4 pt-8 lg:px-12 lg:pt-10">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 32, fontWeight: 900, color: 'var(--cream)', letterSpacing: '-1px', lineHeight: 1.1 }}>
          Metas Comerciales
        </h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <Calendar size={13} color="var(--muted)" />
          <span style={{ fontSize: 13, color: 'var(--muted)' }}>
            Trimestre Mayo–Julio 2026 · Escenario optimista · Días hábiles L-V
          </span>
        </div>
      </div>

      {sinMetas ? (
        <div style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 20,
          padding: '48px 24px', textAlign: 'center',
        }}>
          <Target size={36} style={{ color: 'var(--muted)', margin: '0 auto 12px' }} />
          <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--cream)', marginBottom: 6 }}>
            Sin metas cargadas para la fecha actual
          </p>
          <p style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 16 }}>
            Ejecuta el script de importación desde la raíz del proyecto:
          </p>
          <code style={{
            display: 'inline-block', padding: '8px 16px', borderRadius: 8,
            background: 'var(--surface2)', color: 'var(--gold)', fontSize: 13, fontFamily: 'monospace',
          }}>
            node scripts/import-metas-trimestre.mjs
          </code>
        </div>
      ) : (
        <>
          {/* KPI equipo */}
          <div style={{
            background: 'linear-gradient(135deg, #110D00 0%, #1C1500 100%)',
            border: `1px solid ${SEMAFORO_COLORS[semEquipo]}40`,
            borderRadius: 20, padding: '20px 28px', marginBottom: 24,
            display: 'flex', alignItems: 'center', gap: 40, flexWrap: 'wrap',
          }}>
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, color: 'rgba(212,175,55,0.6)', letterSpacing: '1.8px', textTransform: 'uppercase', marginBottom: 6 }}>
                {equipoLabel}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 40, fontWeight: 900, color: SEMAFORO_COLORS[semEquipo], letterSpacing: '-1.5px', lineHeight: 1 }}>
                  {pctEquipo.toFixed(0)}%
                </span>
                <span style={{ fontSize: 14, color: 'var(--muted)' }}>cumplimiento</span>
              </div>
            </div>
            <div style={{ width: 1, height: 48, background: 'var(--border)', flexShrink: 0 }} />
            {[
              { label: 'Realizado', value: `${fmt(totalReal)} L` },
              { label: 'Meta', value: `${fmt(totalMeta)} L` },
              ...(vista !== 'diario' ? [{ label: 'Esperado', value: `${fmt(totalEsp)} L` }] : []),
            ].map(({ label, value }) => (
              <div key={label}>
                <p style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 4 }}>{label}</p>
                <p style={{ fontSize: 20, fontWeight: 800, color: 'var(--cream)', letterSpacing: '-0.5px' }}>{value}</p>
              </div>
            ))}
            <div style={{ marginLeft: 'auto' }}>
              <SemaforoDot estado={semEquipo} />
            </div>
          </div>

          {/* Tabs + leyenda */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div style={{ display: 'flex', borderRadius: 12, padding: 4, background: 'var(--surface)', gap: 2 }}>
              {tabs.map(tab => (
                <button key={tab.key}
                  onClick={() => setVista(tab.key)}
                  style={{
                    padding: '8px 18px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                    border: 'none', cursor: 'pointer', whiteSpace: 'nowrap',
                    background: vista === tab.key ? 'var(--gold)' : 'transparent',
                    color: vista === tab.key ? '#080808' : 'var(--muted)',
                    transition: 'all 0.15s',
                  }}
                >{tab.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              {(['verde', 'amarillo', 'rojo'] as EstadoSemaforo[]).map(e => (
                <div key={e} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: SEMAFORO_COLORS[e] }} />
                  <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {SEMAFORO_LABELS[e]} ({e === 'verde' ? '≥95%' : e === 'amarillo' ? '75–95%' : '<75%'} vs esperado)
                  </span>
                </div>
              ))}
            </div>
          </div>

          {vista !== 'diario' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 18, height: 7, borderRadius: 4, background: SEMAFORO_COLORS.verde }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Realizado</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 2, height: 14, borderRadius: 2, background: 'rgba(255,255,255,0.5)' }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>Meta esperada a la fecha</span>
              </div>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24 }}>
            {analytics.map(a => (
              <VendedorCard key={a.vendedor} analytics={a} vista={vista} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
