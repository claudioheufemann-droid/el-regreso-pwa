'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, Wallet } from 'lucide-react'
import type { AppUser } from '@/lib/auth'
import NotificationsBell from '@/components/ui/NotificationsBell'
import SettingsPanel from '@/components/ui/SettingsPanel'
import MiComision from '../MiComision'
import MiComisionVendedor from '@/app/terreno/MiComisionVendedor'

/**
 * /ventas/comisiones — remuneración variable del equipo comercial, en un
 * solo lugar. Sólo para quien tenga `puede_ver_margenes` (Claudio, Benja,
 * Douglas): es plata de personas, no un KPI de equipo (mismo criterio de
 * acceso que Rentabilidad).
 *
 * Cada tarjeta se sigue calculando y sirviendo por su propio endpoint con
 * su propio control de acceso (MiComision → ve_comision_gerente,
 * MiComisionVendedor → puede_ver_margenes cuando se le pasa `vendedor`) —
 * esta pantalla sólo las reúne, no duplica ningún cálculo.
 */

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0',
}

export default function ComisionesClient({ user, periodo, veTarjetaClaudio }: {
  user: AppUser
  periodo: { desde: string; hasta: string; nombre: string }
  /** Si puede ver la tarjeta de Claudio (cláusula NOVENA) — hoy, Claudio y Douglas. Benjamín no. */
  veTarjetaClaudio: boolean
}) {
  const router = useRouter()
  const [showSettings, setShowSettings] = useState(false)

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
            <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>Remuneración variable del equipo · {periodo.nombre}</p>
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Claudio — cláusula NOVENA, 1% del equipo. Hoy sólo él y Douglas
              pueden verla (ver puedeVerComisionGerenteEquipo); Benjamín ve
              el módulo pero no esta tarjeta en particular. */}
          {veTarjetaClaudio && (
            <MiComision desde={periodo.desde} hasta={periodo.hasta} nombrePeriodo={periodo.nombre} />
          )}

          {/* Marcelo y Yadro — cláusula TERCERA. `vendedor` explícito porque
              quien mira no es el vendedor: el endpoint exige puede_ver_margenes
              para aceptar ese parámetro (ver comision-vendedor/route.ts). */}
          <MiComisionVendedor
            desde={periodo.desde} hasta={periodo.hasta} nombrePeriodo={periodo.nombre}
            vendedor="Marcelo Diaz" nombreMostrar="Marcelo"
          />
          <MiComisionVendedor
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
