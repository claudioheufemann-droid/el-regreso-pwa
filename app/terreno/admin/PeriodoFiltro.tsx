'use client'

import { useRouter, usePathname } from 'next/navigation'
import { Download } from 'lucide-react'
import { C, TAP } from '../theme'
import type { TipoPeriodo } from '@/lib/terreno/tiempoChile'

const OPCIONES: { k: TipoPeriodo; l: string }[] = [
  { k: 'dia', l: 'Día' }, { k: 'semana', l: 'Semana' }, { k: 'mes', l: 'Mes' },
]

interface Props {
  tipo: TipoPeriodo
  fecha: string
  rangoTexto: string
  /** Otros parámetros a conservar en la URL (ej. vendedorId en /rutas) — pasados explícitos
   *  en vez de leídos con useSearchParams, para no forzar un boundary de Suspense en la página. */
  extraParams?: Record<string, string>
  onExportar?: () => void
}

/** Fila de filtro Día/Semana/Mes + fecha, reutilizada por todas las páginas del panel admin. */
export default function PeriodoFiltro({ tipo, fecha, rangoTexto, extraParams, onExportar }: Props) {
  const router = useRouter()
  const pathname = usePathname()

  function actualizar(patch: Record<string, string>) {
    const params = new URLSearchParams({ tipo, fecha, ...extraParams, ...patch })
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ display: 'flex', gap: 4, background: '#EEF1F4', borderRadius: 11, padding: 3 }}>
        {OPCIONES.map(o => {
          const on = tipo === o.k
          return (
            <button
              key={o.k}
              onClick={() => actualizar({ tipo: o.k })}
              style={{
                minHeight: 36, padding: '0 14px', borderRadius: 9, border: 'none', cursor: 'pointer',
                background: on ? C.card : 'transparent', color: on ? C.verdeLlegada : C.muted,
                fontSize: 13, fontWeight: on ? 800 : 600,
                boxShadow: on ? '0 1px 2px rgba(15,23,42,.1)' : 'none',
              }}
            >
              {o.l}
            </button>
          )
        })}
      </div>

      <input
        type="date"
        value={fecha}
        onChange={e => actualizar({ fecha: e.target.value })}
        style={{
          minHeight: 36, padding: '0 12px', borderRadius: 10, border: `1px solid ${C.line}`,
          background: C.card, fontSize: 13, color: C.text, fontWeight: 600, outline: 'none',
        }}
      />

      <span style={{ fontSize: 12.5, color: C.muted }}>{rangoTexto}</span>

      {onExportar && (
        <button
          onClick={onExportar}
          style={{
            marginLeft: 'auto', minHeight: TAP - 6, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
            border: `1px solid ${C.line}`, background: C.card, color: C.text,
            fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 7,
          }}
        >
          <Download size={15} /> Exportar
        </button>
      )}
    </div>
  )
}
