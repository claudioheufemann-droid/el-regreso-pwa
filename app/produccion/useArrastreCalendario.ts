'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Arrastre del calendario de cocciones, con Pointer Events en vez del
 * drag & drop nativo de HTML5.
 *
 * El motivo del cambio: la API nativa (`draggable` + `onDragStart`/`onDrop`)
 * simplemente NO existe en pantalla táctil — ni iOS ni Android emiten eventos
 * de drag, así que en el teléfono la única forma de mover una cocción era
 * "usá un computador", que es lo que decía el pie del calendario. Pointer
 * Events unifica mouse, lápiz y dedo en el mismo camino de código, así que
 * arreglar el táctil y mejorar el feedback visual es el mismo trabajo.
 *
 * Dos gestos distintos a propósito, porque el dedo y el mouse compiten por
 * cosas distintas:
 *   · Mouse/lápiz: arranca apenas se mueve más de UMBRAL_MOUSE px con el
 *     botón apretado. Inmediato, como espera cualquiera en escritorio.
 *   · Dedo: hay que mantener apretado MS_LONG_PRESS antes de "levantar" la
 *     cocción. Sin esa espera sería imposible hacer scroll vertical sobre el
 *     calendario: el primer movimiento del dedo sobre un chip se robaría el
 *     gesto y la página quedaría trabada. Si el dedo se mueve antes de que
 *     termine el long-press, se cancela y el scroll sigue su curso normal.
 *
 * El destino se resuelve con `document.elementFromPoint` sobre el puntero y
 * no con `onPointerEnter` en cada celda: durante un arrastre el navegador no
 * dispara enter/leave sobre elementos que están debajo del dedo, y además
 * así el mismo código sirve para el ghost flotante que vive en un portal.
 */

const UMBRAL_MOUSE = 5
const UMBRAL_CANCELA_TOUCH = 10
const MS_LONG_PRESS = 320

/** Qué se está arrastrando. Una cocción ya planificada se MUEVE de día; una
 *  sugerencia todavía no existe como lote y al soltarla se CREA. */
export type CargaArrastre =
  | {
      tipo: 'coccion'
      producto: string
      loteNro: number
      categoria: 'cerveza' | 'kombucha'
      litros: number
    }
  | {
      tipo: 'sugerencia'
      producto: string
      categoria: 'cerveza' | 'kombucha'
      litros: number
      necesidadCubrir?: number | null
      cubreHasta?: string | null
      motivo?: string | null
    }

export interface EstadoArrastre {
  carga: CargaArrastre
  /** Coordenadas de pantalla del puntero, para pintar el ghost. */
  x: number
  y: number
  /** Día (yyyy-mm-dd) que está bajo el puntero ahora mismo, si es soltable. */
  diaDestino: string | null
  /** true mientras el gesto todavía no superó el umbral / long-press: sirve
   *  para no pintar nada hasta que el arrastre es real. */
  pendiente: boolean
}

interface Opciones {
  /** Se llama al soltar sobre un día válido. */
  onSoltar: (carga: CargaArrastre, fechaISO: string) => void
  /** Un día es destino válido sólo si esto devuelve true (p. ej. no permitir
   *  el pasado). Se consulta en cada movimiento para pintar el resaltado. */
  puedeSoltarEn: (fechaISO: string) => boolean
}

export function useArrastreCalendario({ onSoltar, puedeSoltarEn }: Opciones) {
  const [arrastre, setArrastre] = useState<EstadoArrastre | null>(null)

  /** Todo el estado vivo del gesto en un ref: los listeners globales se
   *  registran una sola vez y leen de acá, así no hay que re-suscribirlos en
   *  cada movimiento (que es lo que haría perder eventos a mitad del gesto). */
  const gesto = useRef<{
    carga: CargaArrastre
    x0: number
    y0: number
    pointerId: number
    esTactil: boolean
    activo: boolean
    timerLongPress: ReturnType<typeof setTimeout> | null
  } | null>(null)

  // Los callbacks del caller cambian en cada render (se definen inline en el
  // JSX); guardarlos en un ref deja que los listeners globales sean estables.
  const onSoltarRef = useRef(onSoltar)
  const puedeSoltarRef = useRef(puedeSoltarEn)
  useEffect(() => { onSoltarRef.current = onSoltar; puedeSoltarRef.current = puedeSoltarEn })

  const diaBajoPuntero = useCallback((x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y)
    const celda = el?.closest<HTMLElement>('[data-dia-calendario]')
    const fecha = celda?.dataset.diaCalendario
    if (!fecha) return null
    return puedeSoltarRef.current(fecha) ? fecha : null
  }, [])

  const terminar = useCallback((soltar: boolean, x?: number, y?: number) => {
    const g = gesto.current
    if (g?.timerLongPress) clearTimeout(g.timerLongPress)
    if (soltar && g?.activo && x != null && y != null) {
      const destino = diaBajoPuntero(x, y)
      if (destino) onSoltarRef.current(g.carga, destino)
    }
    gesto.current = null
    setArrastre(null)
  }, [diaBajoPuntero])

  // Listeners globales: se registran una vez y viven mientras el hook exista.
  // Van en `document` y no en el elemento arrastrado porque el puntero sale de
  // ese elemento apenas empieza a moverse.
  useEffect(() => {
    const mover = (ev: PointerEvent) => {
      const g = gesto.current
      if (!g || ev.pointerId !== g.pointerId) return
      const dx = ev.clientX - g.x0
      const dy = ev.clientY - g.y0
      const dist = Math.hypot(dx, dy)

      if (!g.activo) {
        if (g.esTactil) {
          // Se movió antes de que el long-press lo levantara: era scroll.
          if (dist > UMBRAL_CANCELA_TOUCH) terminar(false)
          return
        }
        if (dist < UMBRAL_MOUSE) return
        g.activo = true
      }

      // Con el arrastre activo el dedo ya no debe hacer scroll: el gesto es
      // nuestro. `preventDefault` sólo funciona acá porque el listener está
      // registrado con { passive: false }.
      if (ev.cancelable) ev.preventDefault()
      setArrastre({
        carga: g.carga,
        x: ev.clientX,
        y: ev.clientY,
        diaDestino: diaBajoPuntero(ev.clientX, ev.clientY),
        pendiente: false,
      })
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
  }, [diaBajoPuntero, terminar])

  /** Props para el elemento que se puede arrastrar. */
  const propsOrigen = useCallback((carga: CargaArrastre, habilitado = true) => {
    if (!habilitado) return {}
    return {
      onPointerDown: (ev: React.PointerEvent) => {
        // Sólo botón principal: con el derecho se abre el menú contextual y
        // el gesto quedaría colgado esperando un pointerup que nunca llega.
        if (ev.button !== 0) return
        const esTactil = ev.pointerType === 'touch'
        const x0 = ev.clientX
        const y0 = ev.clientY
        gesto.current = {
          carga, x0, y0,
          pointerId: ev.pointerId,
          esTactil,
          activo: false,
          timerLongPress: null,
        }
        if (esTactil) {
          // El dedo tiene que insistir para levantar la cocción; hasta que el
          // timer no corre, este gesto todavía puede ser un scroll.
          gesto.current.timerLongPress = setTimeout(() => {
            const g = gesto.current
            if (!g) return
            g.activo = true
            // Vibración corta: en táctil no hay cursor que avise que el
            // elemento "se levantó", el háptico es el único feedback posible.
            navigator.vibrate?.(12)
            setArrastre({ carga: g.carga, x: x0, y: y0, diaDestino: null, pendiente: false })
          }, MS_LONG_PRESS)
        }
      },
    }
  }, [])

  /** Props para cada celda-día que puede recibir una cocción. El atributo
   *  `data-dia-calendario` es lo que `elementFromPoint` busca al soltar. */
  const propsDestino = useCallback((fechaISO: string) => ({
    'data-dia-calendario': fechaISO,
  }), [])

  const cancelarArrastre = useCallback(() => terminar(false), [terminar])

  return { arrastre, propsOrigen, propsDestino, cancelarArrastre }
}
