import { cookies } from 'next/headers'
import { getServerUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { provinciasDeRegion } from '@/lib/regiones'
import { TEMPORADA, normalizarPeriodo, type FilaVista } from './metas-temporada/tipos'
import type { MetaPeriodo } from './hoyTypes'
import { VENDEDORES_CONTRATO_TERCERA } from '@/lib/comisionesVendedor'
import { getHoyData } from './hoyData'
import { escalarModoDemo } from '@/lib/ventas/modoDemo'
import VentasHoyClient from './VentasHoyClient'

export const dynamic = 'force-dynamic'

const esFecha = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s)

export default async function VentasHoyPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string }>
}) {
  const { desde, hasta } = await searchParams
  const appUser = await getServerUser()

  // Scope geográfico: las ventas están consolidadas por nombre de vendedor, así
  // que el recorte del vendedor se hace por PROVINCIA (su región). Admin ve todo.
  const scopeRegion = appUser?.isAdmin ? null : (appUser?.region ?? null)
  const provincias = provinciasDeRegion(scopeRegion)
  const provinciasScope = provincias.length ? provincias : null

  // Rango elegido a mano. Se ignora si viene mal formado o invertido, para que
  // una URL manipulada no rompa la vista.
  const custom = esFecha(desde) && esFecha(hasta) && desde <= hasta ? { desde, hasta } : null

  const data = await getHoyData(
    provinciasScope,
    appUser
      ? { nombre: appUser.nombre, iniciales: appUser.iniciales, avatarUrl: appUser.avatarUrl }
      : null,
    custom,
  )

  // Remuneración variable propia: sólo la ve quien tenga el permiso, no los
  // admins en general (ver app/api/ventas/comision/route.ts).
  const contratoTercera = (VENDEDORES_CONTRATO_TERCERA as readonly string[])
  const veComisionVendedor = !!appUser?.vendedoresErp.some(v => contratoTercera.includes(v))

  const impersonadoId = appUser?.impersonando ? (await cookies()).get('impersonar_vendedor')?.value : undefined
  const metaPeriodo = appUser ? await metaDelPeriodoEnCurso(impersonadoId) : null

  return (
    <VentasHoyClient
      data={escalarModoDemo(data, appUser?.demoFactorLitros)}
      veComision={!!appUser?.veComisionGerente}
      veComisionVendedor={veComisionVendedor}
      metaPeriodo={metaPeriodo}
    />
  )
}

/**
 * Meta del período 24→23 en curso según el plan de temporada (la misma vista
 * que /ventas/metas-temporada). Pedido de Claudio (26-oct-2026): Nicol no
 * encontraba sus metas desde la pantalla Ventas en el celular — ahora la
 * pantalla muestra la del período y lleva a Metas con un toque.
 * Cliente de SESIÓN: la RLS acota (vendedor = la suya, admin = el equipo).
 */
async function metaDelPeriodoEnCurso(impersonadoId?: string): Promise<MetaPeriodo | null> {
  const supabase = await createClient()
  const hoy = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date())
  let q = supabase.from('plan_metas_periodo_avance').select('*')
    .eq('temporada', TEMPORADA).lte('fecha_inicio', hoy).gte('fecha_fin', hoy)
  if (impersonadoId) q = q.eq('user_id', impersonadoId)
  const { data, error } = await q
  if (error || !data?.length) return null
  const filas = data.map(r => normalizarPeriodo(r as FilaVista))
  const metaNeto = filas.reduce((s, f) => s + f.metaNeto, 0)
  if (metaNeto <= 0) return null
  return {
    nombre: filas[0].nombre,
    desde: filas[0].fechaInicio,
    hasta: filas[0].fechaFin,
    metaNeto,
    realNeto: filas.reduce((s, f) => s + f.realNeto, 0),
    vendedores: filas.length,
  }
}
