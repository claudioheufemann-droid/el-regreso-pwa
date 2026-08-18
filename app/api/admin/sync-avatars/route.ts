import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

function gravatarUrl(email: string): string {
  const hash = createHash('md5').update(email.trim().toLowerCase()).digest('hex')
  return `https://www.gravatar.com/avatar/${hash}?s=400&d=404`
}

/** GET /api/admin/sync-avatars — sincroniza fotos de Gravatar para todos los usuarios */
export async function GET() {
  const supabase = await createClient()

  // Verificar admin
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  const { data: profile } = await supabase.from('users').select('is_admin').eq('email', user.email!).single()
  if (!profile?.is_admin) return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })

  const { data: users } = await supabase
    .from('users')
    .select('id, email, nombre, avatar_url')
    .order('nombre')

  const results: { nombre: string; email: string; status: string }[] = []

  for (const u of users ?? []) {
    try {
      // Intentar Gravatar
      const gUrl = gravatarUrl(u.email)
      const res = await fetch(gUrl, { signal: AbortSignal.timeout(5000) })

      if (res.ok && res.headers.get('content-type')?.startsWith('image')) {
        const bytes = await res.arrayBuffer()
        const path = `${u.id}.jpg`

        const { error: uploadErr } = await supabase.storage
          .from('avatars')
          .upload(path, bytes, { upsert: true, contentType: 'image/jpeg' })

        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
          await supabase.from('users').update({ avatar_url: `${publicUrl}?t=${Date.now()}` }).eq('id', u.id)
          results.push({ nombre: u.nombre, email: u.email, status: 'sincronizado' })
          continue
        }
      }
      results.push({ nombre: u.nombre, email: u.email, status: 'sin_gravatar' })
    } catch {
      results.push({ nombre: u.nombre, email: u.email, status: 'error' })
    }
  }

  const sincronizados = results.filter(r => r.status === 'sincronizado').length
  return NextResponse.json({ sincronizados, total: results.length, results })
}
