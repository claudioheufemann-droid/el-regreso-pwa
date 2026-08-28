'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Wallet, Calendar, ChevronDown } from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import NotificationsBell from '@/components/ui/NotificationsBell'
import SettingsPanel from '@/components/ui/SettingsPanel'
import MiComision from '../MiComision'
import MiComisionVendedor from '@/app/terreno/MiComisionVendedor'

/**
 * /ventas/comisiones — remuneración variable del equipo comercial, en un
 * solo lugar. Sólo para quien tenga acceso al módulo (Claudio, Douglas,
 * Benjamín, Mariel — ver `puedeVerComisionesEquipo` en lib/comisiones.ts):
 * es plata de personas, no un KPI de equipo. Quien entra ve TODO — ya no hay
 * acceso parcial dentro del módulo.
 *
 * Cada tarjeta se sigue calculando y sirviendo por su propio endpoint con
 * su propio control de acceso — esta pantalla sólo las reúne, no duplica
 * ningún cálculo. El selector de período de acá arriba sólo cambia qué
 * `desde`/`hasta` se les pasa; no hay estado de servidor que recargar.
 */

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0',
  blue: '#2563EB', blueSoft: '#EFF6FF',
}

export interface PeriodoLigero {
  id: number
  nombre: string
  inicio: string
  fin: string
  activo: boolean
}

interface PeriodoSel {
  desde: string
  hasta: string
  nombre: string
}

function fFechaCorta(iso: string): string {
  const [, m, d] = iso.split('-')
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${Number(d)} ${MESES[Number(m) - 1]}`
}

export default function ComisionesClient({ user, periodoInicial, periodosDisponibles }: {
  user: AppUser
  periodoInicial: PeriodoSel
  /** Todos los períodos de venta 24→23 que existen hasta hoy, para el selector. */
  periodosDisponibles: PeriodoLigero[]
}) {
  const router = useRouter()
  const [showSettings, setShowSettings] = useState(false)
  const [showPeriodos, setShowPeriodos] = useState(false)
  const [periodo, setPeriodo] = useState<PeriodoSel>(periodoInicial)

  const idxActivo = periodosDisponibles.findIndex(p => p.activo)
  const idxAnterior = idxActivo >= 0 ? idxActivo + 1 : -1

  function elegir(p: PeriodoLigero) {
    setPeriodo({ desde: p.inicio, hasta: p.fin, nombre: p.nombre })
    setShowPeriodos(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/ventas')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 100, padding: '7px 14px 7px 10px', marginBottom: 14,
            color: '#2563EB', fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 36,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color="#2563EB" />
          Volver
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>SOLO USO INTERNO</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Wallet size={22} color="#F59E0B" />
              Comisiones
            </h1>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>Remuneración variable del equipo</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
            <NotificationsBell inline variant="light" />
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Cuenta"
              style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${C.line}`, background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 }}
            >
              {user.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.avatarUrl} alt={user.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (user.iniciales || '··')}
            </button>
          </div>
        </div>

        {/* Selector de período — mismo mecanismo que /ventas: períodos de venta
            24→23. Acá no hace falta recargar la página: cada tarjeta pide sus
            propios datos al servidor cuando cambia `desde`/`hasta`. */}
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <button
            onClick={() => setShowPeriodos(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%',
              background: C.card, border: `1px solid ${showPeriodos ? C.blue : C.line}`,
              borderRadius: 12, padding: '9px 12px', cursor: 'pointer', textAlign: 'left',
            }}
          >
            <Calendar size={15} color={C.faint} style={{ flexShrink: 0 }} />
            <span style={{ minWidth: 0, overflow: 'hidden' }}>
              <span style={{ display: 'block', fontSize: 13, color: C.text, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {periodo.nombre}
              </span>
              <span style={{ display: 'block', fontSize: 11, color: C.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fFechaCorta(periodo.desde)} – {fFechaCorta(periodo.hasta)}
              </span>
            </span>
            <ChevronDown size={15} color={C.faint} style={{ marginLeft: 'auto', flexShrink: 0, transform: showPeriodos ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
          </button>

          {showPeriodos && (
            <>
              <div onClick={() => setShowPeriodos(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
              <div style={{
                position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 41,
                background: C.card, border: `1px solid ${C.line}`, borderRadius: 12,
                boxShadow: '0 8px 28px rgba(15,23,42,.14)', overflow: 'hidden',
              }}>
                <p style={{ fontSize: 10, fontWeight: 700, color: C.faint, letterSpacing: '.06em', padding: '9px 12px 5px' }}>
                  PERÍODO DE VENTA (24 → 23)
                </p>
                {(idxActivo >= 0 || idxAnterior >= 0) && (
                  <div style={{ display: 'flex', gap: 6, padding: '0 12px 9px' }}>
                    {idxActivo >= 0 && (
                      <button
                        onClick={() => elegir(periodosDisponibles[idxActivo])}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: 9, cursor: 'pointer',
                          border: `1px solid ${periodo.desde === periodosDisponibles[idxActivo].inicio ? C.blue : C.line}`,
                          background: periodo.desde === periodosDisponibles[idxActivo].inicio ? C.blue : C.card,
                          color: periodo.desde === periodosDisponibles[idxActivo].inicio ? '#fff' : C.text,
                          fontSize: 12, fontWeight: 700,
                        }}
                      >
                        Período actual
                      </button>
                    )}
                    {idxAnterior >= 0 && periodosDisponibles[idxAnterior] && (
                      <button
                        onClick={() => elegir(periodosDisponibles[idxAnterior])}
                        style={{
                          flex: 1, padding: '8px 6px', borderRadius: 9, cursor: 'pointer',
                          border: `1px solid ${periodo.desde === periodosDisponibles[idxAnterior].inicio ? C.blue : C.line}`,
                          background: periodo.desde === periodosDisponibles[idxAnterior].inicio ? C.blue : C.card,
                          color: periodo.desde === periodosDisponibles[idxAnterior].inicio ? '#fff' : C.text,
                          fontSize: 12, fontWeight: 700,
                        }}
                      >
                        Período anterior
                      </button>
                    )}
                  </div>
                )}
                <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {periodosDisponibles.map(p => {
                    const on = periodo.desde === p.inicio && periodo.hasta === p.fin
                    return (
                      <button
                        key={p.id}
                        onClick={() => elegir(p)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
                          background: on ? C.blueSoft : 'transparent', border: 'none',
                          borderTop: `1px solid ${C.line}`, padding: '10px 12px', cursor: 'pointer',
                        }}
                      >
                        <span style={{ minWidth: 0, flex: 1 }}>
                          <span style={{ display: 'block', fontSize: 13, fontWeight: on ? 700 : 500, color: on ? C.blue : C.text }}>
                            {p.nombre}{p.activo ? ' · en curso' : ''}
                          </span>
                          <span style={{ display: 'block', fontSize: 11, color: C.muted }}>
                            {fFechaCorta(p.inicio)} – {fFechaCorta(p.fin)}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                  {periodosDisponibles.length === 0 && (
                    <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 20 }}>Sin períodos.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Claudio — cláusula NOVENA, 1% del equipo. */}
          <MiComision
            key={`gerente_${periodo.desde}_${periodo.hasta}`}
            desde={periodo.desde} hasta={periodo.hasta} nombrePeriodo={periodo.nombre}
          />

          {/* Marcelo y Yadro — cláusula TERCERA. `vendedor` explícito porque
              quien mira no es el vendedor: el endpoint exige acceso de equipo
              para aceptar ese parámetro (ver comision-vendedor/route.ts). */}
          <MiComisionVendedor
            key={`marcelo_${periodo.desde}_${periodo.hasta}`}
            desde={periodo.desde} hasta={periodo.hasta} nombrePeriodo={periodo.nombre}
            vendedor="Marcelo Diaz" nombreMostrar="Marcelo"
          />
          <MiComisionVendedor
            key={`yadro_${periodo.desde}_${periodo.hasta}`}
            desde={periodo.desde} hasta={periodo.hasta} nombrePeriodo={periodo.nombre}
            vendedor="Yadro Fabijancic" nombreMostrar="Yadro"
          />
        </div>
      </div>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          userName={user.nombre}
          userEmail={user.email}
          avatarUrl={user.avatarUrl ?? undefined}
        />
      )}
    </div>
  )
}
