import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

const CHILE_BOUNDS = { minLat: -56.0, maxLat: -17.5, minLng: -75.7, maxLng: -66.4 }

// PATCH /api/clientes/ubicacion
// Body: { nombre_fantasia, lat, lng }
// Corrección manual de coordenadas — usado cuando el geocodificador
// automático pone el pin en el lugar equivocado (precisión limitada
// cerca de costas/ríos en direcciones rurales).
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { nombre_fantasia, lat, lng } = await req.json()

  if (!nombre_fantasia || typeof lat !== 'number' || typeof lng !== 'number') {
    return NextResponse.json({ error: 'nombre_fantasia, lat y lng requeridos' }, { status: 400 })
  }
  if (lat < CHILE_BOUNDS.minLat || lat > CHILE_BOUNDS.maxLat || lng < CHILE_BOUNDS.minLng || lng > CHILE_BOUNDS.maxLng) {
    return NextResponse.json({ error: 'Coordenadas fuera de Chile' }, { status: 400 })
  }

  const { error } = await supabase
    .from('clientes')
    .update({ lat, lng })
    .eq('nombre_fantasia', nombre_fantasia)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
