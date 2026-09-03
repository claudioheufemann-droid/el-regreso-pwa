'use client'

import { useEffect, useState } from 'react'
import AppHeader from '@/components/ui/AppHeader'
import { StatTile, formatCLP, formatLitros, formatNumero } from '@/components/control-comercial/KpiCard'

interface EstadoCliente { nombre_fantasia: string; dias_sin_compra: number; ciclo_promedio_dias: number | null; estado: string; territorio: string }
interface ClienteNuevo { nombre_fantasia: string; primera_compra: string; litros: number; monto: number; territorio: string }
interface Reactivado { nombre_fantasia: string; fecha_reactivacion: string; dias_inactivo: number; litros: number; territorio: string }
interface ClientePerdido { nombre_fantasia: string; ultima_compra: string; dias_sin_compra: number; territorio: string }
interface CrossRow { clasificacion: string; cantidad: number }
interface Oportunidad { nombre_fantasia: string; litros_cerveza: number; territorio: string }
interface ClientesResponse {
  periodo: { nombre: string; inicio: string; fin: string }
  estadoResumen: Record<string, number>
  estados: EstadoCliente[]
  nuevos: ClienteNuevo[]
  consolidacion: { nuevos: number; consolidados: number; tasa_pct: number } | null
  reactivados: Reactivado[]
  perdidosPeriodo: ClientePerdido[]
  crossSelling: CrossRow[]
  oportunidadKombucha: Oportunidad[]
}

const ESTADO_LABEL: Record<string, { label: string; color: string; emoji: string }> = {
  activo: { label: 'Activo', color: 'var(--green)', emoji: '🟢' },
  riesgo: { label: 'En riesgo', color: 'var(--gold)', emoji: '🟡' },
  inactivo: { label: 'Inactivo', color: '#F97316', emoji: '🟠' },
  perdido: { label: 'Perdido', color: 'var(--red)', emoji: '🔴' },
}

export default function ClientesClient() {
  const [data, setData] = useState<ClientesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    fetch('/api/control-comercial/clientes')
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? 'Error al cargar Clientes')
        return r.json()
      })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [])

  const totalEstados = Object.values(data?.estadoResumen ?? {}).reduce((a, b) => a + b, 0) || 1
  const totalCross = (data?.crossSelling ?? []).reduce((a, b) => a + b.cantidad, 0) || 1
  const perdidosPeriodo = data?.perdidosPeriodo.length ?? 0
  const nuevos = data?.nuevos.length ?? 0
  const reactivados = data?.reactivados.length ?? 0
  const crecimientoNeto = nuevos + reactivados - perdidosPeriodo

  return (
    <div style={{ padding: '0 16px 24px', maxWidth: 1080, width: '100%', margin: '0 auto' }}>
      <AppHeader eyebrow={data?.periodo.nombre ?? 'Control Comercial'} title="Clientes" />

      {loading && <div style={{ height: 300, borderRadius: 16, background: 'var(--surface)', border: '1px solid var(--border)', opacity: 0.5 }} />}
      {!loading && error && <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>{error}</p>}

      {!loading && !error && data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
            <StatTile titulo="Clientes nuevos" valor={formatNumero(nuevos)} subtitulo={data.periodo.nombre} />
            <StatTile
              titulo="Tasa de consolidación"
              valor={data.consolidacion ? `${data.consolidacion.tasa_pct.toFixed(0)}%` : '—'}
              subtitulo={data.consolidacion ? `${data.consolidacion.consolidados} de ${data.consolidacion.nuevos} recompraron en 60d` : undefined}
            />
            <StatTile titulo="Reactivados" valor={formatNumero(reactivados)} tono="ok" />
            <StatTile titulo="Perdidos este período" valor={formatNumero(perdidosPeriodo)} subtitulo="Cruzaron 90+ días recién" tono="critico" />
            <StatTile
              titulo="Crecimiento neto de cartera"
              valor={`${crecimientoNeto >= 0 ? '+' : ''}${crecimientoNeto}`}
              subtitulo="Nuevos + Reactivados − Perdidos"
              tono={crecimientoNeto >= 0 ? 'ok' : 'critico'}
            />
          </div>

          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18, marginBottom: 20 }}>
            <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 2 }}>Estado de la cartera — foto de hoy</h2>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>Acumulado histórico completo, no acotado a {data.periodo.nombre}.</p>
            <div style={{ height: 22, borderRadius: 8, overflow: 'hidden', display: 'flex', marginBottom: 12 }}>
              {(['activo', 'riesgo', 'inactivo', 'perdido'] as const).map(k => {
                const val = data.estadoResumen[k] ?? 0
                const pct = (val / totalEstados) * 100
                return pct > 0 ? <div key={k} title={`${ESTADO_LABEL[k].label}: ${val}`} style={{ width: `${pct}%`, background: ESTADO_LABEL[k].color }} /> : null
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
              {(['activo', 'riesgo', 'inactivo', 'perdido'] as const).map(k => (
                <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--muted)', fontWeight: 600 }}>
                  {ESTADO_LABEL[k].emoji} {ESTADO_LABEL[k].label}: <span style={{ color: 'var(--cream)', fontWeight: 800 }}>{data.estadoResumen[k] ?? 0}</span>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--muted)', marginTop: 12, lineHeight: 1.5 }}>
              Con historial suficiente (3+ pedidos) usa la frecuencia real del cliente (1,5x = riesgo, 2x = inactivo). Sin historial, fallback fijo (45/60/89 días). 90+ días sin comprar = perdido siempre.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Cerveza × Kombucha</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.crossSelling.map(c => (
                  <div key={c.clasificacion} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5 }}>
                      <span style={{ fontWeight: 700, color: 'var(--cream)' }}>{c.clasificacion}</span>
                      <span style={{ color: 'var(--muted)', fontWeight: 600 }}>{c.cantidad}</span>
                    </div>
                    <div style={{ height: 6, borderRadius: 4, background: 'var(--surface2)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${(c.cantidad / totalCross) * 100}%`, borderRadius: 4, background: 'var(--gold)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Oportunidad Kombucha</h2>
              {data.oportunidadKombucha.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin oportunidades detectadas.</p>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                    {data.oportunidadKombucha.length} clientes activos solo compran cerveza — mayor volumen primero.
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
                    {data.oportunidadKombucha.map(o => (
                      <div key={o.nombre_fantasia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0' }}>
                        <span style={{ color: 'var(--cream)', fontWeight: 600 }}>{o.nombre_fantasia}</span>
                        <span style={{ color: 'var(--muted)' }}>{formatLitros(o.litros_cerveza)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Clientes nuevos — {data.periodo.nombre}</h2>
              {data.nuevos.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin clientes nuevos en el período.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {data.nuevos.map(n => (
                    <div key={n.nombre_fantasia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div>
                        <p style={{ color: 'var(--cream)', fontWeight: 600 }}>{n.nombre_fantasia}</p>
                        <p style={{ color: 'var(--muted)', fontSize: 11 }}>{n.territorio}</p>
                      </div>
                      <span style={{ color: 'var(--muted)' }}>{formatCLP(n.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Reactivados — {data.periodo.nombre}</h2>
              {data.reactivados.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Sin reactivaciones en el período.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {data.reactivados.map(r => (
                    <div key={r.nombre_fantasia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div>
                        <p style={{ color: 'var(--cream)', fontWeight: 600 }}>{r.nombre_fantasia}</p>
                        <p style={{ color: 'var(--muted)', fontSize: 11 }}>{r.territorio} · llevaba {r.dias_inactivo}d</p>
                      </div>
                      <span style={{ color: 'var(--green)', fontWeight: 700 }}>{formatLitros(r.litros)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 18 }}>
              <h2 style={{ fontSize: 15, fontWeight: 800, color: 'var(--cream)', marginBottom: 14 }}>Perdidos — {data.periodo.nombre}</h2>
              {data.perdidosPeriodo.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--muted)' }}>Nadie cruzó 90 días sin comprar en el período.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 260, overflowY: 'auto' }}>
                  {data.perdidosPeriodo.map(p => (
                    <div key={p.nombre_fantasia} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '4px 0', borderBottom: '1px solid var(--border-subtle)' }}>
                      <div>
                        <p style={{ color: 'var(--cream)', fontWeight: 600 }}>{p.nombre_fantasia}</p>
                        <p style={{ color: 'var(--muted)', fontSize: 11 }}>{p.territorio}</p>
                      </div>
                      <span style={{ color: 'var(--red)', fontWeight: 700 }}>{p.dias_sin_compra}d</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
