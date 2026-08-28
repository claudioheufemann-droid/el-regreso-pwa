'use client'

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react'

interface GlobalSearchContextValue {
  open: boolean
  openSearch: () => void
  closeSearch: () => void
}

const GlobalSearchContext = createContext<GlobalSearchContextValue | null>(null)

/**
 * Estado del buscador global — un solo modal montado en Providers, pero el
 * botón que lo abre vive en AppHeader (y en el Hub), que se renderiza una
 * vez por página, lejos en el árbol. Un Context evita mandar la función
 * `openSearch` a mano por cada page.tsx del proyecto.
 */
export function GlobalSearchProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const openSearch = useCallback(() => setOpen(true), [])
  const closeSearch = useCallback(() => setOpen(false), [])
  return (
    <GlobalSearchContext.Provider value={{ open, openSearch, closeSearch }}>
      {children}
    </GlobalSearchContext.Provider>
  )
}

export function useGlobalSearch() {
  const ctx = useContext(GlobalSearchContext)
  if (!ctx) throw new Error('useGlobalSearch debe usarse dentro de GlobalSearchProvider')
  return ctx
}
