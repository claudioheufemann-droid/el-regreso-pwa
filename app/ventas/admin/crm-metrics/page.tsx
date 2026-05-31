import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import CRMMetricsClient from './CRMMetricsClient'

export default async function CRMMetricsPage() {
  const supabase = await createClient()

  const [{ data: clientes }, { data: frequencias }, { data: followups }] = await Promise.all([
    supabase.from('clientes').select('nombre_fantasia, vendedor'),
    supabase.from('frequencias').select('nombre, segmento, alert_level, ciclo_promedio_dias, dias_sin_compra'),
    supabase.from('followups').select('id, cliente_nombre_fantasia, estado, fecha_recordatorio, vendedor'),
  ])

  return (
    <Suspense>
      <CRMMetricsClient
        clientes={clientes ?? []}
        frequencias={frequencias ?? []}
        followups={followups ?? []}
      />
    </Suspense>
  )
}
