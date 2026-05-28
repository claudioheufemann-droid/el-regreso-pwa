import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createSupabaseClient(url, key)
}

// GET: lista de rutas con conteo y clientes
export async function GET() {
  const supabase = getAdminClient()

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre_fantasia, vendedor, localidad, localidad_entrega, ruta_despacho, telefono')
    .order('nombre_fantasia')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Agrupar por ruta
  const rutaMap = new Map<string, typeof data>()
  const sinRuta: typeof data = []

  for (const c of (data ?? [])) {
    if (!c.ruta_despacho) {
      sinRuta.push(c)
    } else {
      if (!rutaMap.has(c.ruta_despacho)) rutaMap.set(c.ruta_despacho, [])
      rutaMap.get(c.ruta_despacho)!.push(c)
    }
  }

  const rutas = [...rutaMap.entries()]
    .sort((a, b) => {
      const na = parseInt(a[0]), nb = parseInt(b[0])
      if (!isNaN(na) && !isNaN(nb)) return na - nb
      if (!isNaN(na)) return -1
      if (!isNaN(nb)) return 1
      return a[0].localeCompare(b[0])
    })
    .map(([nombre, clientes]) => ({ nombre, count: clientes.length, clientes }))

  return NextResponse.json({
    rutas,
    sinRuta: { nombre: null, count: sinRuta.length, clientes: sinRuta },
    totalClientes: (data ?? []).length,
  })
}

// PATCH: renombrar una ruta (actualiza ruta_despacho en todos los clientes)
export async function PATCH(req: Request) {
  const { old_ruta, new_ruta } = await req.json()

  if (!old_ruta || !new_ruta) {
    return NextResponse.json({ error: 'Faltan parámetros old_ruta y new_ruta' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { error, count } = await supabase
    .from('clientes')
    .update({ ruta_despacho: new_ruta.trim() })
    .eq('ruta_despacho', old_ruta)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: count })
}

// PUT: asignar clientes a una ruta (puede ser null para quitar la ruta)
export async function PUT(req: Request) {
  const { cliente_ids, ruta } = await req.json()

  if (!Array.isArray(cliente_ids) || cliente_ids.length === 0) {
    return NextResponse.json({ error: 'Faltan cliente_ids' }, { status: 400 })
  }

  const supabase = getAdminClient()
  const { error, count } = await supabase
    .from('clientes')
    .update({ ruta_despacho: ruta ?? null })
    .in('id', cliente_ids)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, updated: count })
}

// DELETE: eliminar una ruta (pone ruta_despacho en null para todos sus clientes)
export async function DELETE(req: Request) {
  const { ruta } = await req.json()

  if (!ruta) return NextResponse.json({ error: 'Falta parámetro ruta' }, { status: 400 })

  const supabase = getAdminClient()
  const { error, count } = await supabase
    .from('clientes')
    .update({ ruta_despacho: null })
    .eq('ruta_despacho', ruta)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, cleared: count })
}
