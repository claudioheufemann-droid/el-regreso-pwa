import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

async function getSupabase() {
  const cookieStore = await cookies()
  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })
}

// GET /api/ventas/actualizaciones — historial de sincronizaciones del ERP.
// No existe una tabla de log de sync: cada corrida del cron borra e inserta
// de nuevo las filas de `ventas` para las fechas que trae el archivo (ver
// app/api/upload-ventas/route.ts), así que `created_at` de esas filas ES el
// momento real en que corrió esa sincronización. Se reconstruye el
// historial agrupando timestamps de created_at que caen dentro de la misma
// ventana de sync (< 3 min de diferencia) en un solo evento.
export async function GET() {
  const supabase = await getSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const desde = new Date(Date.now() - 7 * 86400000).toISOString()
  const { data, error } = await supabase
    .from('ventas')
    .select('created_at')
    .gte('created_at', desde)
    .order('created_at', { ascending: false })
    .limit(20000)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json([])

  const VENTANA_MS = 3 * 60000
  const eventos: { hora: string; filas: number }[] = []
  let grupoInicio: string | null = null
  let grupoCount = 0

  for (const row of data) {
    if (!grupoInicio) {
      grupoInicio = row.created_at
      grupoCount = 1
      continue
    }
    const diff = new Date(grupoInicio).getTime() - new Date(row.created_at).getTime()
    if (diff <= VENTANA_MS) {
      grupoCount++
    } else {
      eventos.push({ hora: grupoInicio, filas: grupoCount })
      grupoInicio = row.created_at
      grupoCount = 1
    }
  }
  if (grupoInicio) eventos.push({ hora: grupoInicio, filas: grupoCount })

  return NextResponse.json(eventos.slice(0, 30))
}
