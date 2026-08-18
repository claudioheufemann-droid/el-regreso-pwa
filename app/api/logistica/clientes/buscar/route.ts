import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} },
  })
}

// GET /api/logistica/clientes/buscar?q=texto — búsqueda predictiva para
// agregar una parada nueva a un despacho (cliente maestro o creado en terreno).
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json([])

  const supabase = await getSupabase()
  const like = `%${q}%`

  const [clientes, clientesTerreno] = await Promise.all([
    supabase.from('clientes').select('id, nombre_fantasia, direccion, direccion_entrega, telefono, rut')
      .or(`nombre_fantasia.ilike.${like},rut.ilike.${like},direccion.ilike.${like}`)
      .limit(8),
    supabase.from('clientes_terreno').select('id, nombre_fantasia, direccion, telefono')
      .ilike('nombre_fantasia', like)
      .limit(8),
  ])

  const resultados = [
    ...(clientes.data ?? []).map(c => ({
      tipo: 'clientes' as const, id: c.id, nombre: c.nombre_fantasia,
      direccion: c.direccion_entrega ?? c.direccion, telefono: c.telefono,
    })),
    ...(clientesTerreno.data ?? []).map(c => ({
      tipo: 'clientes_terreno' as const, id: c.id, nombre: c.nombre_fantasia,
      direccion: c.direccion, telefono: c.telefono,
    })),
  ]

  return NextResponse.json(resultados.slice(0, 10))
}
