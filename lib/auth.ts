import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from './supabase/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export interface AppUser {
  id: string
  nombre: string
  email: string
  isAdmin: boolean
  iniciales: string
  macroArea: string | null   // null = admin global (ve todo)
  avatarUrl: string | null
  region: string | null      // null = sin scope geográfico (admin); ej: 'Los Ríos'
  /** Acceso al módulo Rentabilidad (costos/márgenes internos) — separado de isAdmin, solo Claudio/Benja/Douglas. */
  puedeVerMargenes: boolean
  /** Acceso al módulo Control Comercial (analítica gerencial) — separado de puedeVerMargenes: da acceso al módulo, no a los costos dentro de él. Solo Gerente General/Comercial + Analista Control de Gestión. */
  puedeVerControlComercial: boolean
  /** Acceso a su propia remuneración variable (contrato). Ver lib/comisiones.ts. */
  veComisionGerente: boolean
  /**
   * Nombres con que este usuario aparece en el ERP (ventas.vendedor_actual /
   * misiones.vendedor). Vacío = no es vendedor de terreno.
   *
   * Existe porque el nombre de login y el del ERP casi nunca coinciden
   * ('Claudio H.' vs 'Claudio Heufemann', 'Yadro Favijancic' vs
   * '...Fabijancic'), y comparar por nombre hacía que las misiones nunca se
   * cerraran ni se segmentaran por vendedor.
   */
  vendedoresErp: string[]
  /**
   * "Ver como vendedor" (31-ago-2026): un admin puede simular la interfaz de
   * un vendedor puntual para QA/soporte, sin dejar de ser admin de fondo.
   * Mientras está activo, `isAdmin` de arriba se apaga y nombre/región/
   * vendedoresErp pasan a ser los del vendedor elegido — así el resto de la
   * app (nav, scoping de datos) se comporta exactamente como para él/ella,
   * sin tener que tocar cada página una por una. `id` NUNCA cambia (sigue
   * siendo el del admin real) para que ninguna acción quede mal atribuida.
   * `impersonando` es el nombre del vendedor simulado, o null en vista normal.
   */
  impersonando: string | null
  /** Admin real de la cuenta, sin importar si está impersonando ahora mismo.
   *  Único campo que debe usar el control de "Ver como vendedor" para
   *  decidir si mostrarse — `isAdmin` de arriba no sirve para eso, se apaga
   *  a propósito mientras se está impersonando. */
  esAdminReal: boolean
}

type VistaComo = {
  nombre: string; iniciales: string; macroArea: string | null
  avatarUrl: string | null; region: string | null; vendedoresErp: string[]
}

// Lookup del vendedor a impersonar con service-role (bypassa RLS a propósito):
// `users` exige auth.role()='authenticated' para SELECT, y en el modo demo
// actual (LOGIN_DESACTIVADO_TEMPORAL) no hay sesión real de Supabase — con el
// cliente de sesión esta consulta volvería vacía en silencio, igual que el
// bug ya documentado en lib/push.ts. Ya está gateado por esAdminReal antes de
// llamarse, así que bypassear RLS acá es seguro.
async function resolverImpersonacion(vendedorId: string | undefined): Promise<VistaComo | null> {
  if (!vendedorId) return null
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return null
  const admin = createSupabaseClient(url, key)
  const { data: target } = await admin
    .from('users')
    .select('nombre, iniciales, macro_area, avatar_url, region, vendedores_erp')
    .eq('id', vendedorId)
    .eq('is_admin', false)
    .maybeSingle()
  if (!target) return null
  return {
    nombre: target.nombre, iniciales: target.iniciales ?? '',
    macroArea: target.macro_area ?? null, avatarUrl: target.avatar_url ?? null,
    region: target.region ?? null, vendedoresErp: target.vendedores_erp ?? [],
  }
}

// Memoizado por request: layout + página comparten una sola validación de auth
export const getServerUser = cache(async (): Promise<AppUser | null> => {
  try {
    const supabase = await createClient()

    // getUser() valida el JWT contra el servidor de Auth de Supabase con una
    // llamada de red — en cada carga de CADA layout de módulo (Ventas,
    // Gestión, Flota, Terreno, Logística todos llaman getServerUser()). Si
    // esa llamada falla o tarda por cualquier motivo transitorio, antes se
    // trataba como "no hay sesión" y el layout redirigía a /login — que un
    // instante después rebotaba de vuelta al inicio al releer la cookie (sí
    // válida). Un reintento inmediato absorbe la enorme mayoría de esos
    // blips sin debilitar la validación (sigue siendo getUser(), no
    // getSession() — acá sí importa que el JWT quede revalidado).
    let user = (await supabase.auth.getUser()).data.user
    if (!user) user = (await supabase.auth.getUser()).data.user

    const cookieStore = await cookies()
    const impersonarId = cookieStore.get('impersonar_vendedor')?.value

    // 🔓 TEMPORAL (pedido de Claudio, 2026-08-26): login desactivado para
    // dejar la app abierta durante una prueba. Poner en `false` cuando
    // Claudio avise que hay que restaurar el login.
    const LOGIN_DESACTIVADO_TEMPORAL = true
    if (!user && LOGIN_DESACTIVADO_TEMPORAL) {
      const vistaComo = await resolverImpersonacion(impersonarId)
      return {
        id: 'demo',
        nombre: vistaComo?.nombre ?? 'Invitado',
        email: '',
        isAdmin: vistaComo ? false : true,
        iniciales: vistaComo?.iniciales ?? 'IN',
        macroArea: vistaComo?.macroArea ?? null,
        avatarUrl: vistaComo?.avatarUrl ?? null,
        region: vistaComo?.region ?? null,
        vendedoresErp: vistaComo?.vendedoresErp ?? [],
        puedeVerMargenes: false,
        puedeVerControlComercial: false,
        veComisionGerente: false,
        esAdminReal: true,
        impersonando: vistaComo?.nombre ?? null,
      }
    }
    if (!user) return null

    // Primary lookup: by auth UUID
    let { data: profile } = await supabase
      .from('users')
      .select('id, nombre, iniciales, is_admin, email, macro_area, avatar_url, region, vendedores_erp, puede_ver_margenes, puede_ver_control_comercial, ve_comision_gerente')
      .eq('id', user.id)
      .maybeSingle()

    // Fallback: by email — cubre login con Google en una cuenta que ya
    // existía por email/password. Supabase crea un auth.users nuevo con OTRO
    // uuid (google e email/password son identidades separadas), así que acá
    // NO matchea por id. El profile.id de abajo sigue siendo el id estable
    // de siempre — es el que hay que devolver, no user.id (ver nota abajo).
    if (!profile && user.email) {
      const res = await supabase
        .from('users')
        .select('id, nombre, iniciales, is_admin, email, macro_area, avatar_url, region, vendedores_erp, puede_ver_margenes, puede_ver_control_comercial, ve_comision_gerente')
        .eq('email', user.email)
        .maybeSingle()
      profile = res.data
    }

    if (!profile) return null

    const esAdminReal = !!profile.is_admin
    const vistaComo = esAdminReal ? await resolverImpersonacion(impersonarId) : null

    return {
      // profile.id (no user.id): en el caso de fallback por email, user.id
      // es el uuid de la identidad de Google recién creada, DISTINTO del id
      // real en public.users — usarlo acá rompería toda FK que dependa de
      // este id (tasks.responsable_id, despachos.creado_por, etc.) para
      // cualquiera de los usuarios ya existentes que inicie sesión con
      // Google por primera vez. Tampoco cambia mientras se impersona un
      // vendedor, por la misma razón: nunca atribuir una acción al vendedor
      // simulado.
      id: profile.id,
      nombre: vistaComo?.nombre ?? profile.nombre,
      email: profile.email ?? user.email ?? '',
      isAdmin: vistaComo ? false : esAdminReal,
      iniciales: vistaComo?.iniciales ?? profile.iniciales ?? '',
      macroArea: vistaComo?.macroArea ?? profile.macro_area ?? null,
      avatarUrl: vistaComo?.avatarUrl ?? profile.avatar_url ?? null,
      region: vistaComo?.region ?? profile.region ?? null,
      vendedoresErp: vistaComo?.vendedoresErp ?? profile.vendedores_erp ?? [],
      puedeVerMargenes: vistaComo ? false : !!profile.puede_ver_margenes,
      puedeVerControlComercial: vistaComo ? false : !!profile.puede_ver_control_comercial,
      veComisionGerente: vistaComo ? false : !!profile.ve_comision_gerente,
      esAdminReal,
      impersonando: vistaComo?.nombre ?? null,
    }
  } catch {
    return null
  }
})
