'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { AppUser } from '@/lib/auth'
import { puedeVerComisionesEquipo } from '@/lib/comisiones'

export type { AppUser }
export type UserRole = 'admin' | 'user'

interface UserContextType {
  user: AppUser | null
  isAdmin: boolean
  region: string | null      // scope geográfico del vendedor (null = sin scope)
  puedeVerMargenes: boolean  // acceso a Rentabilidad (costos/márgenes internos)
  /** Acceso al módulo /ventas/comisiones (Claudio/Douglas/Benjamín/Mariel) —
   *  aparte de puedeVerMargenes, ver lib/comisiones.ts. */
  veComisiones: boolean
  /** Acceso al módulo /produccion (forecast) — admins + equipo de Producción
   *  (macroArea='produccion', el mismo grupo que ve el kanban en
   *  /gestion/produccion). */
  puedeVerProduccion: boolean
  /** Admin real de la cuenta, sin importar si está "viendo como vendedor"
   *  ahora mismo — ver AppUser.esAdminReal en lib/auth.ts. */
  esAdminReal: boolean
  /** Nombre del vendedor simulado, o null en vista normal. */
  impersonando: string | null
  logout: () => Promise<void>
}

const UserContext = createContext<UserContextType>({
  user: null,
  isAdmin: false,
  region: null,
  puedeVerMargenes: false,
  veComisiones: false,
  puedeVerProduccion: false,
  esAdminReal: false,
  impersonando: null,
  logout: async () => {},
})

export function UserProvider({
  children,
  initialUser,
}: {
  children: ReactNode
  initialUser: AppUser | null
}) {
  const router = useRouter()

  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <UserContext.Provider
      value={{
        user: initialUser,
        isAdmin: initialUser?.isAdmin ?? false,
        region: initialUser?.region ?? null,
        puedeVerMargenes: initialUser?.puedeVerMargenes ?? false,
        // Mientras se impersona un vendedor, email sigue siendo el del admin
        // real (a propósito — password/reauth no puede apuntar a otro
        // usuario), así que puedeVerComisionesEquipo() lo seguiría
        // reconociendo. Se apaga acá explícitamente para que la vista sea
        // fiel a la del vendedor simulado.
        veComisiones: initialUser && !initialUser.impersonando ? puedeVerComisionesEquipo(initialUser) : false,
        puedeVerProduccion: !!initialUser && (initialUser.isAdmin || initialUser.macroArea === 'produccion'),
        esAdminReal: initialUser?.esAdminReal ?? false,
        impersonando: initialUser?.impersonando ?? null,
        logout,
      }}
    >
      {children}
    </UserContext.Provider>
  )
}

export function useUser() {
  return useContext(UserContext)
}
