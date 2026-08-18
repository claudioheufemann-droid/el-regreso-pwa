import { createClient } from '@/lib/supabase/server'
import { Suspense } from 'react'
import CRMMetricsClient from './CRMMetricsClient'

export default async function CRMMetricsPage() {
  const supabase = await createClient()

  const desde30d = new Date(Date.now() - 30 * 86400000).toISOString()

  const [{ data: clientes }, { data: frequencias }, { data: followups }, { data: visitas }, { data: seguimientos }, { data: vendedores }] = await Promise.all([
    supabase.from('clientes').select('nombre_fantasia, vendedor'),
    supabase.from('frequencias').select('nombre, segmento, alert_level, ciclo_promedio_dias, dias_sin_compra'),
    supabase.from('followups').select('id, cliente_nombre_fantasia, estado, fecha_recordatorio, vendedor'),
    // Últimos 30 días: base para Efectividad de Visitas y Apertura/Contacto
    supabase.from('visitas_terreno').select('id, vendedor_id, tiene_venta, estado, iniciada_at').gte('iniciada_at', desde30d).neq('estado', 'cancelada'),
    supabase.from('seguimientos').select('id, vendedor_id, tipo_accion, estado, fecha_hora_compromiso, visita_id'),
    supabase.from('users').select('id, nombre'),
  ])

  return (
    <Suspense>
      <CRMMetricsClient
        clientes={clientes ?? []}
        frequencias={frequencias ?? []}
        followups={followups ?? []}
        visitas={visitas ?? []}
        seguimientos={seguimientos ?? []}
        vendedores={vendedores ?? []}
      />
    </Suspense>
  )
}
