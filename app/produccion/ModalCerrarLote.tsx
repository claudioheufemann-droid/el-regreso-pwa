'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle2, X } from 'lucide-react'
import ProductImage from '@/components/ui/ProductImage'
import type { LotePlan } from './page'
import { fNum, hoyLocalISO } from './compartido'

/**
 * Cerrar un lote: registra cuántos litros salieron de verdad y cuándo se
 * terminó. Es lo que permite, en Planta y en Hoy, comparar lo planificado con
 * lo cocinado (antes ningún lote se cerraba: 0 completados al 4-oct-2026).
 */
export default function ModalCerrarLote({ lote, guardando, onCancelar, onConfirmar }: {
  lote: LotePlan
  guardando: boolean
  onCancelar: () => void
  onConfirmar: (datos: { litrosReales: number; fechaFinReal: string; fechaInicioReal?: string }) => void
}) {
  const [litros, setLitros] = useState(String(Math.round(lote.litrosPlanificados)))
  const [fin, setFin] = useState(hoyLocalISO())
  const [inicio, setInicio] = useState(lote.fechaInicioReal ?? lote.fechaPlanificada)
  const n = Number(litros)
  const valido = Number.isFinite(n) && n >= 0 && fin.length === 10 && inicio.length === 10 && inicio <= fin
  const diferencia = valido && lote.litrosPlanificados > 0 ? (n - lote.litrosPlanificados) / lote.litrosPlanificados : null

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="prod-root fixed inset-0 z-[9999] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="cerrar-lote-titulo">
      <div className="prod-scrim absolute inset-0 bg-black/55" onClick={onCancelar} />
      <div className="prod-card prod-modal relative w-full max-w-md rounded-b-none p-5 sm:rounded-b-[14px]">
        <div className="flex items-start gap-3">
          <ProductImage nombre={lote.producto} categoria={lote.categoria} size={40} radius={10} />
          <div className="min-w-0 flex-1">
            <p className="prod-eyebrow">Cerrar lote</p>
            <h2 id="cerrar-lote-titulo" className="text-lg font-extrabold text-(--p-text)">{lote.producto}</h2>
            <p className="text-xs text-(--p-text-3)">Planificado: {fNum(lote.litrosPlanificados)} L para el {new Date(lote.fechaPlanificada + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })}</p>
          </div>
          <button type="button" onClick={onCancelar} aria-label="Cerrar" className="rounded-lg p-1.5 text-(--p-text-3) hover:bg-(--p-hover)"><X size={18} /></button>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <label className="col-span-2 flex flex-col gap-1.5">
            <span className="prod-eyebrow">Litros que salieron</span>
            <input
              id="cerrar-lote-litros" type="number" inputMode="numeric" min={0} value={litros} onChange={e => setLitros(e.target.value)}
              className="rounded-xl border border-(--p-line) bg-(--p-card-2) px-3 py-2.5 text-lg font-bold tabular-nums text-(--p-text) focus:border-(--p-accent) focus:outline-none"
            />
            {diferencia != null && Math.abs(diferencia) >= 0.005 && (
              <span className={`text-xs font-semibold ${diferencia < -0.05 ? 'text-(--p-warn)' : 'text-(--p-text-3)'}`}>
                {diferencia > 0 ? '+' : '−'}{Math.abs(diferencia * 100).toFixed(0)}% respecto de lo planificado
              </span>
            )}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="prod-eyebrow">Se cocinó el</span>
            <input id="cerrar-lote-inicio" type="date" value={inicio} max={fin} onChange={e => setInicio(e.target.value)}
              className="rounded-xl border border-(--p-line) bg-(--p-card-2) px-3 py-2 text-sm font-semibold text-(--p-text) focus:border-(--p-accent) focus:outline-none" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="prod-eyebrow">Se terminó el</span>
            <input id="cerrar-lote-fin" type="date" value={fin} min={inicio} onChange={e => setFin(e.target.value)}
              className="rounded-xl border border-(--p-line) bg-(--p-card-2) px-3 py-2 text-sm font-semibold text-(--p-text) focus:border-(--p-accent) focus:outline-none" />
          </label>
        </div>

        <div className="mt-5 flex gap-2">
          <button type="button" onClick={onCancelar} className="prod-press flex-1 rounded-xl border border-(--p-line) px-4 py-2.5 text-sm font-bold text-(--p-text-2) hover:bg-(--p-hover)">Cancelar</button>
          <button
            type="button" disabled={!valido || guardando}
            onClick={() => onConfirmar({ litrosReales: n, fechaFinReal: fin, fechaInicioReal: inicio })}
            className="prod-press prod-primario flex flex-[2] items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold"
          >
            <CheckCircle2 size={16} />
            {guardando ? 'Guardando…' : 'Marcar como terminado'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
