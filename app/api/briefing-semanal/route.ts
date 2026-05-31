import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'

// GET — retorna los clientes prioritarios de esta semana para el vendedor actual
// Usado por el popup del lunes en el dashboard
export async function GET() {
  const supabase = await createClient()
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_pending_call_alerts', {
    p_vendedor: user.isAdmin ? null : user.nombre,
    p_nivel_minimo: 'proximo',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const clientes = (data ?? []) as {
    nombre_fantasia: string
    vendedor_actual: string
    score: number
    segmento: string
    alert_level: string
    dias_sin_compra: number
    ciclo_promedio_dias: number
    siguiente_compra_estimada: string | null
  }[]

  // Ordenar: criticos primero, luego vencidos, luego proximos; dentro de cada grupo por score desc
  const priority = { critico: 0, vencido: 1, proximo: 2 }
  clientes.sort((a, b) => {
    const pa = priority[a.alert_level as keyof typeof priority] ?? 3
    const pb = priority[b.alert_level as keyof typeof priority] ?? 3
    if (pa !== pb) return pa - pb
    return (b.score ?? 0) - (a.score ?? 0)
  })

  return NextResponse.json({
    clientes,
    total: clientes.length,
    criticos: clientes.filter(c => c.alert_level === 'critico').length,
    vencidos: clientes.filter(c => c.alert_level === 'vencido').length,
    proximos: clientes.filter(c => c.alert_level === 'proximo').length,
  })
}
