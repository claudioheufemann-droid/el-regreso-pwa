'use client'
import { useState, useEffect } from 'react'

export function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(false)
  useEffect(() => {
    // Histéresis: una vez en modo desktop, hace falta bajar bastante más de
    // 1024px para volver a mobile (y viceversa). Sin esto, una ventana cuyo
    // ancho ronda justo el breakpoint puede "parpadear" entre ambos modos
    // con el mínimo resize — y como varias pantallas (ej. Nueva Tarea)
    // renderizan una versión distinta del componente para cada modo, ese
    // parpadeo desmonta la que estaba abierta y se pierde todo lo escrito.
    // Debounce de 150ms además evita reaccionar a resizes intermedios.
    let timeout: ReturnType<typeof setTimeout>
    const check = () => {
      setIsDesktop(prev => {
        const w = window.innerWidth
        return prev ? w >= 960 : w >= 1024
      })
    }
    check()
    const onResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(check, 150)
    }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timeout) }
  }, [])
  return isDesktop
}
