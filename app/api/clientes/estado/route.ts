import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

// PATCH /api/clientes/estado
// Body: { nombre_fantasia, estado, nota? }
export async function PATCH(req: Request) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { nombre_fantasia, estado, nota } = await req.json()

  if (!nombre_fantasia || !estado) {
    return NextResponse.json({ error: 'nombre_fantasia y estado requeridos' }, { status: 400 })
  }
  if (!['activo', 'inactivo', 'estacional'].includes(estado)) {
    return NextResponse.json({ error: 'Estado inválido' }, { status: 400 })
  }

  const { error } = await supabase
    .from('clientes_estado')
    .upsert({
      nombre_fantasia,
      estado,
      nota: nota ?? null,
      updated_at: new Date().toISOString(),
      updated_by: user.nombre,
    }, { onConflict: 'nombre_fantasia' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
