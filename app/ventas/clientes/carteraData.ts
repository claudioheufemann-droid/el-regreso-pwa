import { unstable_cache } from 'next/cache'
import { createServerClient } from '@supabase/ssr'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'
import { esClienteExcluido, vendedorCanonico } from '@/lib/types'
import { formatLocalidad } from '@/lib/format'
import { CARTERAS, ACTIVO_DIAS, type ClienteCartera, type CarteraKey } from './carteraTipos'

// Cliente sin cookies → apto para unstable_cache (mismo patrón que lib/misionesCache.ts).
function anon() {
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => [], setAll: () => {} },
  })
}

type ResumenRow = {
  nombre_fantasia: string; primera_compra: string; ultima_compra: string
  dias_con_compra: number; pedidos: number; litros: number; monto: number
  litros_12m: number; monto_12m: number
  ultimo_vendedor: string | null; localidad: string | null; provincia: string | null
}
type ClienteRow = {
  id: number; nombre_fantasia: string | null; razon_social: string | null
  categoria: string | null; vendedor: string | null
  localidad: string | null; localidad_entrega: string | null; provincia: string | null
  telefono: string | null
}

// PostgREST corta en 1.000 filas por respuesta: clientes ya pasa de eso
// (1.022 al 30-oct-2026) y el resumen está cerca, así que ambos se paginan.
async function paginar<T>(fetchPage: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
  const out: T[] = []
  for (let off = 0; ; off += 1000) {
    const { data } = await fetchPage(off, off + 999)
    if (!data?.length) break
    out.push(...data)
    if (data.length < 1000) break
  }
  return out
}

// Historial completo por cliente — escanea ~60.000 líneas de `ventas`
// (~1-2 s), así que se comparte entre usuarios con TTL de 10 min.
const getResumenCached = unstable_cache(
  () => paginar<ResumenRow>((a, b) => anon().rpc('cartera_clientes_resumen').order('nombre_fantasia').range(a, b)),
  ['cartera-clientes-resumen'],
  { tags: ['ventas'], revalidate: 600 },
)

const getClientesCached = unstable_cache(
  () => paginar<ClienteRow>((a, b) => anon().from('clientes')
    .select('id, nombre_fantasia, razon_social, categoria, vendedor, localidad, localidad_entrega, provincia, telefono')
    .order('id').range(a, b)),
  ['cartera-clientes-maestro'],
  { tags: ['ventas'], revalidate: 600 },
)

export const CARTERA_DE_VENDEDOR = new Map<string, CarteraKey>(CARTERAS.map(c => [c.vendedor, c.key]))

/** Cartera = vendedor asignado en el maestro; si ese no es una cartera vigente
 *  (Inactivo, Incobrable, ex-vendedores, vacío), el vendedor de su última compra. */
function carteraDe(asignado: string | null, ultimoVendedor: string | null): CarteraKey {
  return CARTERA_DE_VENDEDOR.get(vendedorCanonico(asignado))
    ?? CARTERA_DE_VENDEDOR.get(vendedorCanonico(ultimoVendedor))
    ?? 'otros'
}

function diasEntre(desde: string, hasta: Date): number {
  return Math.floor((hasta.getTime() - new Date(desde + 'T12:00:00').getTime()) / 86400000)
}

/** Todos los clientes de la empresa con su historial resumido y su cartera. */
export async function getCartera(): Promise<ClienteCartera[]> {
  const [resumen, maestro] = await Promise.all([getResumenCached(), getClientesCached()])

  const hoy = new Date()
  const porNombre = new Map(resumen.map(r => [r.nombre_fantasia, r]))
  const vistos = new Set<string>()
  const clientes: ClienteCartera[] = []

  const armar = (c: ClienteRow | null, r: ResumenRow | null, nombre: string): ClienteCartera => {
    const diasSinComprar = r ? diasEntre(r.ultima_compra, hoy) : null
    const ciclo = r && r.dias_con_compra >= 2
      ? Math.round(diasEntre(r.primera_compra, new Date(r.ultima_compra + 'T12:00:00')) / (r.dias_con_compra - 1))
      : null
    return {
      id: c?.id ?? null,
      nombre,
      razonSocial: c?.razon_social ?? null,
      categoria: c?.categoria ?? null,
      localidad: formatLocalidad(c?.localidad_entrega || c?.localidad || r?.localidad || '') || null,
      provincia: c?.provincia || r?.provincia || null,
      telefono: c?.telefono ?? null,
      cartera: carteraDe(c?.vendedor ?? null, r?.ultimo_vendedor ?? null),
      vendedorErp: c?.vendedor || r?.ultimo_vendedor || null,
      estado: !r ? 'sin_compras' : (diasSinComprar ?? 0) <= ACTIVO_DIAS ? 'activo' : 'inactivo',
      primeraCompra: r?.primera_compra ?? null,
      ultimaCompra: r?.ultima_compra ?? null,
      diasSinComprar,
      cicloDias: ciclo,
      compras: r?.dias_con_compra ?? 0,
      litros: Number(r?.litros ?? 0),
      monto: Number(r?.monto ?? 0),
      litros12m: Number(r?.litros_12m ?? 0),
      monto12m: Number(r?.monto_12m ?? 0),
    }
  }

  for (const c of maestro) {
    const nombre = c.nombre_fantasia?.trim()
    if (!nombre || esClienteExcluido(nombre) || vistos.has(nombre)) continue
    vistos.add(nombre)
    clientes.push(armar(c, porNombre.get(nombre) ?? null, nombre))
  }
  // Clientes con ventas que no están en el maestro (el ERP los renombró o
  // nunca se cargaron): igual son clientes de la empresa y deben aparecer.
  for (const r of resumen) {
    if (vistos.has(r.nombre_fantasia) || esClienteExcluido(r.nombre_fantasia)) continue
    vistos.add(r.nombre_fantasia)
    clientes.push(armar(null, r, r.nombre_fantasia))
  }

  unificarComunas(clientes)
  return clientes
}

// Errores de tipeo frecuentes del ERP (clave ya sin tildes ni mayúsculas).
const COMUNA_ALIAS: Record<string, string> = { villarica: 'villarrica' }
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const claveComuna = (s: string) => {
  const k = sinTildes(s).toLowerCase().trim()
  return COMUNA_ALIAS[k] ?? k
}

/** El ERP trae la misma comuna escrita de varias formas ("Pucon"/"Pucón",
 *  "Villarica"/"Villarrica"): sin esto "Dónde vendemos" la contaba partida.
 *  Se queda con la grafía más usada; a igualdad, la que lleva tilde. */
function unificarComunas(clientes: ClienteCartera[]) {
  const variantes = new Map<string, Map<string, number>>()
  for (const c of clientes) {
    if (!c.localidad) continue
    const k = claveComuna(c.localidad)
    const m = variantes.get(k) ?? new Map<string, number>()
    m.set(c.localidad, (m.get(c.localidad) ?? 0) + 1)
    variantes.set(k, m)
  }
  const tieneTilde = (s: string) => s !== sinTildes(s)
  const canonica = new Map<string, string>()
  for (const [k, m] of variantes) {
    const [mejor] = [...m.entries()].sort((a, b) =>
      b[1] - a[1] || Number(tieneTilde(b[0])) - Number(tieneTilde(a[0])))
    canonica.set(k, mejor[0])
  }
  for (const c of clientes) if (c.localidad) c.localidad = canonica.get(claveComuna(c.localidad)) ?? c.localidad
}
