import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase/config'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => { try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {} },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  // Fetch all comment task_ids (lightweight — just the FK)
  const { data, error } = await supabase
    .from('task_comments')
    .select('task_id')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Aggregate: { [taskId]: count }
  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    counts[row.task_id] = (counts[row.task_id] ?? 0) + 1
  }

  return NextResponse.json(counts)
}
