'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

/**
 * Arrastre del calendario de cocciones, con Pointer Events en vez del
 * drag & drop nativo de HTML5.
 *
 * El motivo del cambio: la API nativa (`draggable` + `onDragStart`/`onDrop`)
 * simplemente NO existe en pantalla táctil — ni iOS ni Android emiten eventos
 * de drag. Pointer Events unifica mouse, lápiz y dedo en el mismo camino.
 *
 * Dos gestos distintos a propósito, porque el dedo y el mouse compiten por
 * cosas distintas:
 *   · Mouse/lápiz: arranca apenas se mueve más de UMBRAL_MOUSE px con el
 *     botón apretado. Inmediato, como espera cualquiera en escritorio.
 *   · Dedo: hay que mantener apretado MS_LONG_PRESS antes de "levantar" la
 *     cocción; si no, sería imposible hacer scroll sobre el calendario.
 *
 * RENDIMIENTO (rediseño 5-oct-2026). Antes cada pixel del puntero hacía un
 * setState en el hook del módulo, y eso redibujaba TODO Producción (≈1.100
 * celdas del Gantt más las tablas de la pestaña) en cada movimiento. Ahora:
 *   1. El estado vive en un almacén propio (`StoreArrastre`): sólo lo leen
 *      el Gantt y el fantasma (`useEstadoArrastre`), nunca el módulo entero.
 *   2. Ese estado cambia sólo cuando cambia la CELDA bajo el puntero, no en
 *      cada pixel.
 *   3. El fantasma se mueve escribiendo `transform` directo en el elemento
 *      (`fantasmaRef`), sin pasar por React.
 *   4. Cerca del borde de un contenedor marcado con `data-autoscroll`, la
 *      grilla se desplaza sola, así se puede llevar una cocción a una fecha
 *      que no está en pantalla.
 *
 * El destino se resuelve con `document.elementFromPoint` sobre el puntero:
 * durante un arrastre el navegador no dispara enter/leave sobre las celdas.
 */

const UMBRAL_MOUSE = 5
const UMBRAL_CANCELA_TOUCH = 10
const MS_LONG_PRESS = 320
/** Ancho de la franja del borde donde se activa el auto-desplazamiento. */
const BORDE_AUTOSCROLL = 56
/** Velocidad máxima del auto-desplazamiento, en px por cuadro. */
const VELOCIDAD_AUTOSCROLL = 22

/** Qué se está arrastrando. Una cocción ya planificada se MUEVE de día; una
 *  sugerencia todavía no existe como lote y al soltarla se CREA. */
export type CargaArrastre =
  | {
      tipo: 'coccion'
      /** id real de la fila en plan_produccion. */
      id: string
      producto: string
      loteNro: number
      categoria: 'cerveza' | 'kombucha'
      litros: number
      /** Id del bloque en el Gantt y su duración, para apagar SÓLO ese bloque
       *  y dibujar su contorno en el destino. */
      idBloque?: string
      dias?: number
    }
  | {
      tipo: 'sugerencia'
      producto: string
      categoria: 'cerveza' | 'kombucha'
      litros: number
      necesidadCubrir?: number | null
      cubreHasta?: string | null
      motivo?: string | null
      idBloque?: string
      dias?: number
    }

/** Dónde se está por soltar: qué día y, en el Gantt, qué fermentador. */
export interface DestinoArrastre {
  fecha: string
  fermentador: string | null
}

export interface EstadoArrastre {
  carga: CargaArrastre
  /** Posición del puntero cuando cambió el destino por última vez (entre
   *  medio, el fantasma se mueve sin React). */
  x: number
  y: number
  /** Celda bajo el puntero ahora mismo, si es soltable. */
  destino: DestinoArrastre | null
  pendiente: boolean
}

/** Almacén mínimo del arrastre: se lee con `useEstadoArrastre`. */
export interface StoreArrastre {
  obtener: () => EstadoArrastre | null
  suscribir: (alCambiar: () => void) => () => void
}

function crearStore() {
  let estado: EstadoArrastre | null = null
  const oyentes = new Set<() => void>()
  return {
    obtener: () => estado,
    suscribir: (f: () => void) => { oyentes.add(f); return () => { oyentes.delete(f) } },
    fijar: (e: EstadoArrastre | null) => { estado = e; oyentes.forEach(f => f()) },
  }
}

/** Lee el estado del arrastre. Sólo el componente que lo usa se redibuja. */
export function useEstadoArrastre(store: StoreArrastre): EstadoArrastre | null {
  return useSyncExternalStore(store.suscribir, store.obtener, () => null)
}

const mismoDestino = (a: DestinoArrastre | null, b: DestinoArrastre | null) =>
  a === b || (!!a && !!b && a.fecha === b.fecha && a.fermentador === b.fermentador)

/** Posiciona el fantasma: sigue al puntero, centrado y un poco arriba. */
export const transformFantasma = (x: number, y: number) => `translate3d(${x}px, ${y}px, 0) translate(-50%, -130%)`

interface Opciones {
  /** Se llama al soltar sobre una celda válida. */
  onSoltar: (carga: CargaArrastre, destino: DestinoArrastre) => void
  /** Una celda es destino válido sólo si esto devuelve true. */
  puedeSoltarEn: (destino: DestinoArrastre) => boolean
}

export function useArrastreCalendario({ onSoltar, puedeSoltarEn }: Opciones) {
  const [store] = useState(crearStore)
  /** Elemento del fantasma: se mueve escribiendo transform, sin render. */
  const fantasmaRef = useRef<HTMLDivElement | null>(null)

  const gesto = useRef<{
    carga: CargaArrastre
    x0: number
    y0: number
    x: number
    y: number
    pointerId: number
    esTactil: boolean
    activo: boolean
    destino: DestinoArrastre | null
    timerLongPress: ReturnType<typeof setTimeout> | null
    raf: number | null
  } | null>(null)

  const onSoltarRef = useRef(onSoltar)
  const puedeSoltarRef = useRef(puedeSoltarEn)
  useEffect(() => { onSoltarRef.current = onSoltar; puedeSoltarRef.current = puedeSoltarEn })

  const celdaBajoPuntero = useCallback((x: number, y: number): DestinoArrastre | null => {
    const el = document.elementFromPoint(x, y)
    const celda = el?.closest<HTMLElement>('[data-dia-calendario]')
    const fecha = celda?.dataset.diaCalendario
    if (!fecha) return null
    const destino: DestinoArrastre = { fecha, fermentador: celda?.dataset.fermentador ?? null }
    return puedeSoltarRef.current(destino) ? destino : null
  }, [])

  /** Recalcula la celda bajo el puntero y avisa SÓLO si cambió. */
  const actualizarDestino = useCallback((forzar = false) => {
    const g = gesto.current
    if (!g || !g.activo) return
    const destino = celdaBajoPuntero(g.x, g.y)
    if (!forzar && mismoDestino(destino, g.destino)) return
    g.destino = destino
    store.fijar({ carga: g.carga, x: g.x, y: g.y, destino, pendiente: false })
  }, [celdaBajoPuntero, store])

  /** Auto-desplazamiento: mientras el puntero esté en la franja del borde de
   *  un contenedor `data-autoscroll`, lo desplaza un poco en cada cuadro (más
   *  rápido cuanto más cerca del borde) y recalcula el destino. */
  const bucleRef = useRef<() => void>(() => {})
  const bucleAutoscroll = useCallback(() => {
    const g = gesto.current
    if (!g || !g.activo) return
    let movio = false
    document.querySelectorAll<HTMLElement>('[data-autoscroll]').forEach(el => {
      const r = el.getBoundingClientRect()
      const ejes = el.dataset.autoscroll ?? 'xy'
      const margenIzq = Number(el.dataset.autoscrollIzq ?? 0)
      const velocidad = (dist: number) => Math.ceil(((BORDE_AUTOSCROLL - dist) / BORDE_AUTOSCROLL) * VELOCIDAD_AUTOSCROLL)
      if (ejes.includes('x') && g.y >= r.top && g.y <= r.bottom) {
        const izq = r.left + margenIzq
        if (g.x < izq + BORDE_AUTOSCROLL && g.x > izq - 8 && el.scrollLeft > 0) { el.scrollLeft -= velocidad(Math.max(0, g.x - izq)); movio = true }
        else if (g.x > r.right - BORDE_AUTOSCROLL && g.x < r.right + 8 && el.scrollLeft + el.clientWidth < el.scrollWidth) { el.scrollLeft += velocidad(Math.max(0, r.right - g.x)); movio = true }
      }
      if (ejes.includes('y') && g.x >= r.left && g.x <= r.right) {
        if (g.y < r.top + BORDE_AUTOSCROLL && el.scrollTop > 0) { el.scrollTop -= velocidad(Math.max(0, g.y - r.top)); movio = true }
        else if (g.y > r.bottom - BORDE_AUTOSCROLL && el.scrollTop + el.clientHeight < el.scrollHeight) { el.scrollTop += velocidad(Math.max(0, r.bottom - g.y)); movio = true }
      }
    })
    if (movio) actualizarDestino()
    g.raf = requestAnimationFrame(() => bucleRef.current())
  }, [actualizarDestino])
  useEffect(() => { bucleRef.current = bucleAutoscroll }, [bucleAutoscroll])

  const terminar = useCallback((soltar: boolean, x?: number, y?: number) => {
    const g = gesto.current
    if (g?.timerLongPress) clearTimeout(g.timerLongPress)
    if (g?.raf != null) cancelAnimationFrame(g.raf)
    if (soltar && g?.activo && x != null && y != null) {
      const destino = celdaBajoPuntero(x, y)
      if (destino) onSoltarRef.current(g.carga, destino)
    }
    gesto.current = null
    store.fijar(null)
  }, [celdaBajoPuntero, store])

  const activar = useCallback(() => {
    const g = gesto.current
    if (!g) return
    g.activo = true
    store.fijar({ carga: g.carga, x: g.x, y: g.y, destino: null, pendiente: false })
    g.raf = requestAnimationFrame(() => bucleRef.current())
    actualizarDestino(true)
  }, [store, actualizarDestino])

  useEffect(() => {
    const mover = (ev: PointerEvent) => {
      const g = gesto.current
      if (!g || ev.pointerId !== g.pointerId) return
      g.x = ev.clientX
      g.y = ev.clientY
      const dist = Math.hypot(ev.clientX - g.x0, ev.clientY - g.y0)

      if (!g.activo) {
        if (g.esTactil) {
          // Se movió antes de que el long-press lo levantara: era scroll.
          if (dist > UMBRAL_CANCELA_TOUCH) terminar(false)
          return
        }
        if (dist < UMBRAL_MOUSE) return
        activar()
      }

      // Con el arrastre activo el gesto es nuestro: nada de scroll del dedo.
      if (ev.cancelable) ev.preventDefault()
      // El fantasma va pegado al puntero sin pasar por React.
      if (fantasmaRef.current) fantasmaRef.current.style.transform = transformFantasma(ev.clientX, ev.clientY)
      actualizarDestino()
    }

    const soltar = (ev: PointerEvent) => {
      const g = gesto.current
      if (!g || ev.pointerId !== g.pointerId) return
      terminar(true, ev.clientX, ev.clientY)
    }

    const cancelar = (ev: PointerEvent) => {
      const g = gesto.current
      if (!g || ev.pointerId !== g.pointerId) return
      terminar(false)
    }

    const teclaEscape = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && gesto.current) terminar(false)
    }

    document.addEventListener('pointermove', mover, { passive: false })
    document.addEventListener('pointerup', soltar)
    document.addEventListener('pointercancel', cancelar)
    document.addEventListener('keydown', teclaEscape)
    return () => {
      document.removeEventListener('pointermove', mover)
      document.removeEventListener('pointerup', soltar)
      document.removeEventListener('pointercancel', cancelar)
      document.removeEventListener('keydown', teclaEscape)
    }
  }, [activar, actualizarDestino, terminar])

  /** Props para el elemento que se puede arrastrar. */
  const propsOrigen = useCallback((carga: CargaArrastre, habilitado = true) => {
    if (!habilitado) return {}
    return {
      onPointerDown: (ev: React.PointerEvent) => {
        // Sólo botón principal: con el derecho se abre el menú contextual.
        if (ev.button !== 0) return
        const esTactil = ev.pointerType === 'touch'
        gesto.current = {
          carga, x0: ev.clientX, y0: ev.clientY, x: ev.clientX, y: ev.clientY,
          pointerId: ev.pointerId, esTactil, activo: false, destino: null, timerLongPress: null, raf: null,
        }
        if (esTactil) {
          gesto.current.timerLongPress = setTimeout(() => {
            if (!gesto.current) return
            // Vibración corta: en táctil no hay cursor que avise que el
            // elemento "se levantó"; el háptico es el único feedback posible.
            navigator.vibrate?.(12)
            activar()
          }, MS_LONG_PRESS)
        }
      },
    }
  }, [activar])

  /** Props para cada celda-día que puede recibir una cocción. */
  const propsDestino = useCallback((fechaISO: string) => ({
    'data-dia-calendario': fechaISO,
  }), [])

  const cancelarArrastre = useCallback(() => terminar(false), [terminar])

  return { store: store as StoreArrastre, fantasmaRef, propsOrigen, propsDestino, cancelarArrastre }
}
