import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Estado de las sincronizaciones automáticas (Clientes/Deudores/Stock/Barriles)
// para mostrar en el admin dentro de la app, sin tener que ir a GitHub Actions
// a revisar. Lee `erp_sync_log`, que escriben los endpoints /api/*/upload en
// cada corrida (automática vía el workflow de GitHub, o manual desde acá).
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) {
    return NextResponse.json({ error: 'Supabase no configurado' }, { status: 500 })
  }
  const supabase = createClient(url, key)

  const [ultimoClientes, ultimoDeudores, ultimoStock, ultimoBarriles, totalClientes, totalDeudores, totalStock, totalBarriles] = await Promise.all([
    supabase.from('erp_sync_log').select('*').eq('fuente', 'clientes').order('creado_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('erp_sync_log').select('*').eq('fuente', 'deudores').order('creado_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('erp_sync_log').select('*').eq('fuente', 'stock').order('creado_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('erp_sync_log').select('*').eq('fuente', 'barriles').order('creado_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('clientes').select('*', { count: 'exact', head: true }),
    supabase.from('deudores').select('*', { count: 'exact', head: true }),
    supabase.from('stock_productos').select('*', { count: 'exact', head: true }),
    supabase.from('barriles_clientes').select('*', { count: 'exact', head: true }),
  ])

  return NextResponse.json({
    clientes: { ultimaCorrida: ultimoClientes.data ?? null, total: totalClientes.count ?? 0 },
    deudores: { ultimaCorrida: ultimoDeudores.data ?? null, total: totalDeudores.count ?? 0 },
    stock: { ultimaCorrida: ultimoStock.data ?? null, total: totalStock.count ?? 0 },
    barriles: { ultimaCorrida: ultimoBarriles.data ?? null, total: totalBarriles.count ?? 0 },
  })
}
