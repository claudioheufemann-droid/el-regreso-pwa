import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import CotizacionesClient from './CotizacionesClient'

export const dynamic = 'force-dynamic'

export interface CotizacionRow {
  id: string
  numero: number
  creado_por_nombre: string
  cliente_nombre: string
  cliente_empresa: string | null
  cliente_email: string | null
  total: number
  estado: 'borrador' | 'enviada' | 'ganada' | 'perdida'
  imagen_url: string | null
  created_at: string
}

export default async function CotizacionesPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()
  const { data } = await supabase
    .from('cotizaciones')
    .select('id, numero, creado_por_nombre, cliente_nombre, cliente_empresa, cliente_email, total, estado, imagen_url, created_at')
    .order('created_at', { ascending: false })
    .limit(300)

  return <CotizacionesClient filas={(data ?? []) as CotizacionRow[]} />
}
