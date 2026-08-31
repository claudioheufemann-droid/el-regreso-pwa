import { createClient } from '@supabase/supabase-js'

/**
 * Cliente service-role — bypassa RLS a propósito. SOLO para lecturas de
 * solo-lectura que el código que las llama ya controla por su cuenta (isAdmin,
 * scope de cartera por vendedor, etc.) — nunca usar para decidir permisos.
 *
 * Por qué existe: varias tablas (deudores, users, stock_productos) tienen RLS
 * que exige `auth.role() = 'authenticated'`. En el modo demo actual
 * (LOGIN_DESACTIVADO_TEMPORAL en lib/auth.ts) no hay sesión real de Supabase,
 * así que el cliente de sesión normal (@/lib/supabase/server) queda como
 * `anon` y esas consultas vuelven vacías EN SILENCIO — nunca lanzan error,
 * simplemente no traen filas. Pasó con deudores (ver /ventas/deudores y
 * /ventas/clientes: ningún cliente mostraba su deuda, en NINGUNA sección,
 * aunque la tabla sí tenía datos) — mismo patrón de bug ya documentado en
 * lib/push.ts para push_subscriptions/users.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Supabase admin: faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY')
  return createClient(url, key)
}
