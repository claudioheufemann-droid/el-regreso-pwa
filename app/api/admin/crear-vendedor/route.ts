/**
 * POST /api/admin/crear-vendedor  (solo admin)
 * Crea la cuenta de un vendedor: auth user + identidad + perfil con región.
 * Reemplaza la plantilla SQL — el gerente da de alta vendedores desde la UI.
 */
import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { getServerUser } from '@/lib/auth'
import { esRegionValida } from '@/lib/regiones'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // 1. Solo admin
  const me = await getServerUser()
  if (!me?.isAdmin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Servidor mal configurado' }, { status: 500 })

  // 2. Validar entrada
  const body = await req.json().catch(() => ({}))
  const nombre   = String(body.nombre ?? '').trim()
  const email    = String(body.email ?? '').trim().toLowerCase()
  const password = String(body.password ?? '').trim()
  const region   = String(body.region ?? '').trim()

  if (!nombre)                return NextResponse.json({ error: 'Falta el nombre' }, { status: 400 })
  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Email inválido' }, { status: 400 })
  if (password.length < 6)    return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
  if (!esRegionValida(region)) return NextResponse.json({ error: 'Región inválida' }, { status: 400 })

  const admin = createServiceClient(url, key)

  // 3. ¿Ya existe ese email en el perfil?
  const { data: existente } = await admin.from('users').select('id').eq('email', email).maybeSingle()
  if (existente) return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 409 })

  // 4. Crear usuario de autenticación (email confirmado, sin email de verificación)
  const { data: created, error: authErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true,
  })
  if (authErr || !created?.user) {
    return NextResponse.json({ error: authErr?.message ?? 'No se pudo crear la cuenta' }, { status: 400 })
  }
  const id = created.user.id

  // 5. Perfil de vendedor con región
  const iniciales = nombre.split(/\s+/).slice(0, 2).map(s => s[0]?.toUpperCase() ?? '').join('')
  const { error: profErr } = await admin.from('users').insert({
    id, auth_id: id, nombre, iniciales,
    rol: 'Vendedor', area: 'Marketing', email,
    is_admin: false, macro_area: 'comercial',
    region, must_change_password: true,
  })

  if (profErr) {
    // rollback: si falla el perfil, borrar la cuenta auth para no dejar huérfanos
    await admin.auth.admin.deleteUser(id).catch(() => {})
    return NextResponse.json({ error: profErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, id, nombre, region })
}
