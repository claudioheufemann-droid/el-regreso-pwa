'use client'

import { useCallback, useRef, useState } from 'react'
import GanttProduccion, { type BloqueGantt } from '@/app/produccion/GanttProduccion'
import ConfigProductosGantt from '@/app/produccion/ConfigProductosGantt'
import NecesidadMensual from '@/app/produccion/NecesidadMensual'
import { useArrastreCalendario, type DestinoArrastre } from '@/app/produccion/useArrastreCalendario'
import {
  FERMENTADORES, CONFIG, SERIES, STOCK_SEGURIDAD, PLAN, HOY,
  ESCENARIOS, bloquesDe, COBERTURA, type Escenario,
} from './fixtures'

/**
 * Banco de pruebas. Monta los componentes reales de Producción con datos
 * armados y un selector de escenarios, para poder mirar los estados que con
 * datos de verdad no se pueden provocar cuando uno quiere.
 *
 * El arrastre es el hook de verdad (no una maqueta): mover un bloque acá
 * cambia el estado local y dispara el mismo aterrizaje que en producción, así
 * que sirve para probar el gesto, no sólo el dibujo.
 */
export default function DevProduccionClient() {
  const [escenario, setEscenario] = useState<Escenario>('normal')
  const [bloques, setBloques] = useState<BloqueGantt[]>(() => bloquesDe('normal'))
  const [config, setConfig] = useState(CONFIG)
  const [configAbierta, setConfigAbierta] = useState(false)
  const [recienMovido, setRecienMovido] = useState<string | null>(null)
  const [registro, setRegistro] = useState<string[]>([])

  const cambiarEscenario = useCallback((e: Escenario) => {
    setEscenario(e)
    setBloques(bloquesDe(e))
    setRegistro(r => [`escenario → ${e}`, ...r].slice(0, 8))
  }, [])

  // Igual que en producción: la categoría en curso viaja por ref porque el
  // listener del arrastre es global y no puede leerla del closure.
  const cargaCategoria = useRef<'cerveza' | 'kombucha' | null>(null)

  const puedeSoltarEnCelda = useCallback((destino: DestinoArrastre) => {
    if (destino.fecha < HOY) return false
    if (!destino.fermentador) return true
    const t = FERMENTADORES.find(f => f.nombre === destino.fermentador)
    return !t || !cargaCategoria.current || t.categoria === cargaCategoria.current
  }, [])

  const alSoltarEnCelda = useCallback((carga: { producto: string }, destino: DestinoArrastre) => {
    setBloques(bs => bs.map(b => (b.producto === carga.producto
      ? { ...b, inicioISO: destino.fecha, fermentador: destino.fermentador }
      : b)))
    const movido = bloques.find(b => b.producto === carga.producto)
    if (movido) {
      setRecienMovido(movido.id)
      setTimeout(() => setRecienMovido(a => (a === movido.id ? null : a)), 800)
    }
    setRegistro(r => [
      `soltado ${carga.producto} → ${destino.fecha} / ${destino.fermentador ?? 'sin tanque'}`,
      ...r,
    ].slice(0, 8))
  }, [bloques])

  const { arrastre, propsOrigen } = useArrastreCalendario({
    onSoltar: alSoltarEnCelda,
    puedeSoltarEn: puedeSoltarEnCelda,
  })

  const pista = ESCENARIOS.find(e => e.id === escenario)?.pista

  return (
    <div className="prod-root min-h-screen bg-gray-50">
      <div className="mx-auto flex max-w-[1600px] flex-col gap-5 p-5">

        {/* Barra del banco de pruebas — deliberadamente fea y distinta del
            módulo real, para que nadie confunda esta pantalla con la app. */}
        <div className="flex flex-col gap-3 rounded-xl border-2 border-dashed border-fuchsia-400 bg-fuchsia-50 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded bg-fuchsia-600 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-white">
              Banco de pruebas
            </span>
            <span className="text-[12px] text-fuchsia-900">
              Datos inventados. No toca la base. Sólo existe en desarrollo.
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {ESCENARIOS.map(e => (
              <button key={e.id} type="button" onClick={() => cambiarEscenario(e.id)}
                className={`prod-press rounded-lg border px-3 py-1.5 text-[11px] font-bold transition ${
                  escenario === e.id
                    ? 'border-fuchsia-600 bg-fuchsia-600 text-white'
                    : 'border-fuchsia-300 bg-white text-fuchsia-800 hover:bg-fuchsia-100'
                }`}>{e.label}</button>
            ))}
          </div>

          {pista && <p className="text-[12px] font-medium text-fuchsia-900">Qué mirar: {pista}</p>}

          {registro.length > 0 && (
            <div className="flex flex-col gap-0.5 rounded-lg bg-white/70 p-2 font-mono text-[10.5px] text-fuchsia-900">
              {registro.map((l, i) => <div key={i}>{l}</div>)}
            </div>
          )}
        </div>

        <GanttProduccion
          fermentadores={FERMENTADORES}
          bloques={bloques}
          config={config}
          arrastre={arrastre}
          propsOrigen={(carga, habilitado) => {
            const base = propsOrigen(carga, habilitado) as Record<string, unknown>
            const onPointerDown = base.onPointerDown as ((e: React.PointerEvent) => void) | undefined
            return {
              ...base,
              onPointerDown: (e: React.PointerEvent) => {
                cargaCategoria.current = carga.categoria
                onPointerDown?.(e)
              },
            }
          }}
          cobertura={COBERTURA}
          bloqueRecienMovido={recienMovido}
          onAbrirConfig={() => setConfigAbierta(true)}
        />

        <NecesidadMensual
          series={SERIES}
          stockSeguridad={STOCK_SEGURIDAD}
          plan={PLAN}
          tanques={FERMENTADORES.map(f => ({
            tanque: f.nombre, categoria: f.categoria, capacidadLitros: f.capacidadLitros,
          }))}
          config={config}
          onConfirmar={async lotes => {
            setRegistro(r => [
              `confirmar → ${lotes.length} cocciones: ${lotes.map(l => `${l.litros}L`).join(', ')}`,
              ...r,
            ].slice(0, 8))
          }}
        />

        <ConfigProductosGantt
          abierto={configAbierta}
          config={config}
          onCerrar={() => setConfigAbierta(false)}
          onGuardado={fila => setConfig(c => c.map(x => (x.producto === fila.producto ? fila : x)))}
        />
      </div>

      {/* Ghost del arrastre: en producción lo pinta ProduccionClient, así que
          acá va una versión mínima — sin él, arrastrar no muestra nada y
          parecería que el gesto no funciona. */}
      {arrastre && !arrastre.pendiente && (
        <div className="pointer-events-none fixed z-[90] rounded-md bg-gray-900 px-2 py-1 text-[11px] font-bold text-white shadow-lg"
          style={{ left: arrastre.x + 12, top: arrastre.y + 12 }}>
          {arrastre.carga.producto}
          {arrastre.destino && (
            <span className="text-white/60">
              {' → '}{arrastre.destino.fecha}
              {arrastre.destino.fermentador ? ` · ${arrastre.destino.fermentador}` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
