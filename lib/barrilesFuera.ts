/**
 * lib/barrilesFuera.ts — Barriles fuera (sin devolver) por cartera, para el
 * KPI "Barriles" de Deudores (/ventas/deudores y Administración › Cobranza).
 *
 * Fuente: `barriles_clientes` = informe "Barriles en Cliente" del ERP, una
 * fila por barril. Es el mismo número que muestra /ventas/barriles y
 * Control Comercial › Barriles.
 *
 * Por qué NO se suma `deudores.barriles_adeudados`: el informe Deudores del
 * ERP sólo trae clientes con saldo > 0. Un cliente que pagó todo pero sigue
 * con barriles no aparece ahí, y el total salía bajo (25-sep-2026: Deudores
 * decía 181 y Barriles 307 — 79 barriles en 37 clientes sin deuda, más los de
 * incobrables/CERVECERÍA/Douglas que Deudores no cuenta). Cliente por cliente
 * ambos informes coinciden; la diferencia era sólo quién entra en la lista.
 *
 * La cartera se toma de `clientes.vendedor` vigente (no del vendedor que traía
 * la fila del barril), mismo criterio que /ventas/barriles.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { vendedorCanonico } from '@/lib/types'

export interface BarrilesFuera {
  /** Todos los barriles fuera, sin importar cartera. */
  total: number
  /** Por vendedor canónico (vendedorCanonico de clientes.vendedor). */
  porCartera: Record<string, number>
}

export async function barrilesFueraPorCartera(supabase: SupabaseClient): Promise<BarrilesFuera> {
  const { data: barriles } = await supabase.from('barriles_clientes').select('nombre_fantasia').range(0, 9999)
  const filas = (barriles ?? []) as { nombre_fantasia: string }[]

  const nombres = [...new Set(filas.map(b => b.nombre_fantasia).filter(Boolean))]
  const { data: clientes } = nombres.length
    ? await supabase.from('clientes').select('nombre_fantasia, vendedor').in('nombre_fantasia', nombres)
    : { data: [] }
  const carteraPorCliente = new Map(
    ((clientes ?? []) as { nombre_fantasia: string; vendedor: string | null }[])
      .map(c => [c.nombre_fantasia, vendedorCanonico(c.vendedor) || '__sin_vendedor__']),
  )

  const porCartera: Record<string, number> = {}
  for (const b of filas) {
    const key = carteraPorCliente.get(b.nombre_fantasia) ?? '__sin_vendedor__'
    porCartera[key] = (porCartera[key] ?? 0) + 1
  }
  return { total: filas.length, porCartera }
}
