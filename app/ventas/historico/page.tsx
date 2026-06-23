import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import HistoricoClient from './HistoricoClient'

export const dynamic = 'force-dynamic'

// Canales con volumen real — el resto (Cliente Directo X, Empleado, etc.) es ruido
const CANALES = ['Bar', 'Restaurante', 'Botillería', 'Almacén', 'Minimarket', 'Supermercado', 'Cafetería', 'Distribuidor', 'Actividades Turísticas']
const LINEAS  = ['Cerveza', 'Kombucha']

export default async function HistoricoPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  // Datos iniciales sin filtro (todo) — los filtros refetch en el cliente.
  const { data: mensual } = await supabase.rpc('ventas_historico_mensual', { p_canal: null, p_linea: null })

  const anios = [...new Set(((mensual ?? []) as { anio: number }[]).map(r => r.anio))].sort((a, b) => b - a)
  const anioActual = anios[0] ?? new Date().getFullYear()

  const { data: pareto } = await supabase.rpc('ventas_pareto', { p_anio: anioActual, p_canal: null, p_linea: null })

  return (
    <HistoricoClient
      mensualInicial={(mensual ?? []) as never[]}
      paretoInicial={(pareto ?? []) as never[]}
      canales={CANALES}
      lineas={LINEAS}
      anioActual={anioActual}
      isAdmin={user.isAdmin}
    />
  )
}
