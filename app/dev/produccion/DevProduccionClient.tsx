'use client'

import { useCallback, useRef, useState } from 'react'
import GanttProduccion, { type BloqueGantt } from '@/app/produccion/GanttProduccion'
import ConfigProductosGantt from '@/app/produccion/ConfigProductosGantt'
import NecesidadMensual from '@/app/produccion/NecesidadMensual'
import MenuLateral, { type TabId } from '@/app/produccion/MenuLateral'
import ModalAgregarProducto from '@/app/produccion/ModalAgregarProducto'
import PopoverCoccion, { type LoteCalendario } from '@/app/produccion/PopoverCoccion'
import PopoverEditarTanque, { type DatosTanqueEditar } from '@/app/produccion/PopoverEditarTanque'
import { useArrastreCalendario, type DestinoArrastre } from '@/app/produccion/useArrastreCalendario'
import {
  FERMENTADORES, CONFIG, SERIES, STOCK_SEGURIDAD, PLAN, HOY,
  ESCENARIOS, bloquesDe, COBERTURA, NECESIDAD, HASTA_MES, type Escenario,
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

const sumarDias = (iso: string, n: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)
export default function DevProduccionClient() {
  const [escenario, setEscenario] = useState<Escenario>('normal')
  const [bloques, setBloques] = useState<BloqueGantt[]>(() => bloquesDe('normal'))
  const [config, setConfig] = useState(CONFIG)
  const [configAbierta, setConfigAbierta] = useState(false)
  const [agregarProductoAbierto, setAgregarProductoAbierto] = useState(false)
  const [editarTanque, setEditarTanque] = useState<DatosTanqueEditar | null>(null)
  const [ajustesTanque, setAjustesTanque] = useState<{ tanque: string; codigoLote: string }[]>([])
  const [recienMovido, setRecienMovido] = useState<string | null>(null)
  const [registro, setRegistro] = useState<string[]>([])
  const [tab, setTab] = useState<TabId>('calendario')
  /** Detalle de una cocción sugerida. En la app lo abre ProduccionClient; acá
   *  se monta igual porque si no, el botón de confirmar no se puede probar en
   *  ningún lado — y es la acción que crea un lote en base. */
  const [detalle, setDetalle] = useState<{ lote: LoteCalendario; rect: DOMRect } | null>(null)

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
    <div className="prod-root flex h-[100dvh] w-full overflow-hidden bg-gray-50">
      {/* El menú va acá y no dentro del contenedor centrado porque en la app
          real es una columna de alto completo: verlo flotando en una caja no
          probaría nada del riel. */}
      <MenuLateral
        activeTab={tab}
        onCambiarTab={setTab}
        alertasPorTab={{ calendario: 3, seguridad: 12, insumos: 1 }}
        ultimaCorrida="2026-09-20T08:00:00Z"
        nombreUsuario="Benjamín Alarcón"
        inicialesUsuario="BA"
      />

      {/* MISMA estructura que la app: un scroller PLANO con flex-1, y el flex
          column adentro. Si el scroller mismo es el flex column, sus hijos
          heredan flex-shrink y el Gantt se aplasta a 75 px — pasó acá, y en
          un banco que no copia la estructura real ese bug no se habría visto
          nunca (o peor, se habría "arreglado" en el componente). */}
      <div className="min-w-0 flex-1 overflow-auto p-5">
        <div className="flex flex-col gap-5">

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
          necesidad={NECESIDAD}
          hastaMes={HASTA_MES}
          bloqueRecienMovido={recienMovido}
          onAbrirConfig={() => setConfigAbierta(true)}
          onAgregarProducto={() => setAgregarProductoAbierto(true)}
          onAbrirBloque={(b, rect) => {
            if (!rect) return
            if (b.tipo === 'en_tanque') {
              if (!b.codigoLote || !b.fermentador) return
              setEditarTanque({
                tanque: b.fermentador, codigoLote: b.codigoLote,
                producto: b.producto, categoria: b.categoria,
                inicioISO: b.inicioISO, embarrilladoISO: sumarDias(b.inicioISO, b.dias),
                rect,
              })
              return
            }
            // Sólo las sugerencias tienen proyección detrás, igual que en la
            // app: un lote confirmado ya está en el plan.
            if (b.tipo !== 'sugerido') return
            setDetalle({
              rect,
              lote: {
                id: b.id, producto: b.producto, loteNro: b.loteNro ?? 1, loteDe: 1,
                categoria: b.categoria, litros: b.litros,
                tanque: b.fermentador ?? '—',
                capacidadTanque: FERMENTADORES.find(f => f.nombre === b.fermentador)?.capacidadLitros ?? b.litros,
                tanqueManual: false, enCurso: false, leadTimeSemanas: 4,
                fechaInicio: b.inicioISO,
                fechaListo: sumarDias(b.inicioISO, b.dias),
                fechaEmbarriladoReal: null,
                cubreHasta: sumarDias(b.inicioISO, b.dias + 30),
                llegaATiempo: !b.motivo,
                fechaAgotamiento: sumarDias(b.inicioISO, b.dias - 3),
                diasTarde: 0, fechaObjetivo: b.inicioISO,
                movidoManual: false, conAlarma: !!b.motivo,
              },
            })
          }}
          onQuitarBloque={b => {
            setBloques(bs => bs.filter(x => x.id !== b.id))
            setRegistro(r => [`QUITAR → ${b.producto} · ${b.litros} L · ${b.fermentador ?? 'sin tanque'}`, ...r].slice(0, 8))
          }}
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

        <ModalAgregarProducto
          abierto={agregarProductoAbierto}
          config={config}
          guardando={false}
          error={null}
          onGuardar={datos => {
            setBloques(bs => [...bs, {
              id: `nuevo-${Date.now()}`, tipo: 'confirmado', producto: datos.producto,
              categoria: datos.categoria, litros: datos.litrosPlanificados,
              inicioISO: datos.fechaPlanificada,
              dias: config.find(c => c.producto === datos.producto)?.diasFermentacion
                ?? (datos.categoria === 'cerveza' ? 24 : 12),
              fermentador: null,
            }])
            setRegistro(r => [`AGREGAR → ${datos.producto} · ${datos.litrosPlanificados} L · ${datos.fechaPlanificada} (sin asignar)`, ...r].slice(0, 8))
            setAgregarProductoAbierto(false)
          }}
          onCerrar={() => setAgregarProductoAbierto(false)}
        />

        {editarTanque && (
          <PopoverEditarTanque
            datos={editarTanque}
            tieneAjuste={ajustesTanque.some(a => a.tanque === editarTanque.tanque && a.codigoLote === editarTanque.codigoLote)}
            guardando={false}
            error={null}
            onGuardar={fechas => {
              // En el banco no hay API: se aplica directo al bloque, igual
              // que haría el estado optimista de la app real.
              setBloques(bs => bs.map(b => (b.id === `erp:${editarTanque.tanque}`
                ? {
                    ...b,
                    inicioISO: fechas.fechaInicioManual,
                    dias: fechas.fechaEmbarriladoManual
                      ? Math.max(1, Math.round((Date.parse(fechas.fechaEmbarriladoManual) - Date.parse(fechas.fechaInicioManual)) / 86_400_000))
                      : b.dias,
                    motivo: 'Fecha corregida a mano para este lote.',
                  }
                : b)))
              setAjustesTanque(a => [...a.filter(x => !(x.tanque === editarTanque.tanque && x.codigoLote === editarTanque.codigoLote)), { tanque: editarTanque.tanque, codigoLote: editarTanque.codigoLote }])
              setRegistro(r => [`AJUSTAR FECHA → ${editarTanque.producto} · ${fechas.fechaInicioManual} → ${fechas.fechaEmbarriladoManual ?? '—'}`, ...r].slice(0, 8))
              setEditarTanque(null)
            }}
            onRestablecer={() => {
              setAjustesTanque(a => a.filter(x => !(x.tanque === editarTanque.tanque && x.codigoLote === editarTanque.codigoLote)))
              setRegistro(r => [`RESTABLECER FECHA → ${editarTanque.producto}`, ...r].slice(0, 8))
              setEditarTanque(null)
            }}
            onCerrar={() => setEditarTanque(null)}
          />
        )}
        </div>
      </div>

      {/* Detalle de la cocción sugerida, con el botón de confirmar. Acá no
          toca la base: sólo deja la línea en el registro, que es lo que hay
          que poder verificar — que el clic llegue con el tanque y la fecha
          correctos. */}
      {detalle && (
        <PopoverCoccion
          lote={detalle.lote}
          rect={detalle.rect}
          modo="fijado"
          hoyISO={HOY}
          marcado={false}
          tanques={FERMENTADORES.map(f => ({
            tanque: f.nombre, categoria: f.categoria, capacidadLitros: f.capacidadLitros,
          }))}
          fNum={n => Math.round(n).toLocaleString('es-CL')}
          onAlternar={() => setRegistro(r => [`presupuesto → ${detalle.lote.producto}`, ...r].slice(0, 8))}
          onAnclarTanque={t => setRegistro(r => [`anclar tanque → ${t}`, ...r].slice(0, 8))}
          onMoverFecha={f => setRegistro(r => [`mover fecha → ${f}`, ...r].slice(0, 8))}
          onConfirmar={() => {
            setRegistro(r => [
              `CONFIRMAR → ${detalle.lote.producto} · ${detalle.lote.litros} L · ${detalle.lote.tanque} · ${detalle.lote.fechaInicio}`,
              ...r,
            ].slice(0, 8))
            setDetalle(null)
          }}
          onCerrar={() => setDetalle(null)}
        />
      )}

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
