import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

// POST: marcar misión como completada
export async function POST(req: Request) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { nombre_fantasia, semana, nota } = await req.json()

  const { error } = await supabase
    .from('contactos_realizados')
    .upsert(
      { vendedor: user.nombre, nombre_fantasia, semana, nota: nota ?? null, completado_at: new Date().toISOString() },
      { onConflict: 'vendedor,nombre_fantasia,semana' }
    )

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE: desmarcar misión
export async function DELETE(req: Request) {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { nombre_fantasia, semana } = await req.json()

  const { error } = await supabase
    .from('contactos_realizados')
    .delete()
    .eq('vendedor', user.nombre)
    .eq('nombre_fantasia', nombre_fantasia)
    .eq('semana', semana)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
