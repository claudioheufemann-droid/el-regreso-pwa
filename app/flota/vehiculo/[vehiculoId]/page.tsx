import { createClient } from '@/lib/supabase/server'
import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import ViajeDetailClient from '../../viaje/[viajeId]/ViajeDetailClient'

export const dynamic = 'force-dynamic'

export default async function VehiculoActivoPage({ params }: { params: Promise<{ vehiculoId: string }> }) {
  const { vehiculoId } = await params
  const user = await getServerUser()
  if (!user) redirect('/login')

  const supabase = await createClient()

  // Buscar viaje activo por vehiculo
  const { data: viaje } = await supabase
    .from('viajes_flota')
    .select('id, tipo, motivo, km_inicio, km_teoricos, km_fin, iniciado_at, destino_declarado, conductor_id, vehiculo_id, estado, repartos_terminados, foto_odometro_inicio, foto_360_frente_inicio, foto_360_izquierdo_inicio, foto_360_derecho_inicio, foto_360_atras_inicio, foto_combustible_inicio, foto_odometro_fin, foto_360_frente_fin, foto_360_izquierdo_fin, foto_360_derecho_fin, foto_360_atras_fin, foto_combustible_fin, foto_boleta_combustible')
    .eq('vehiculo_id', vehiculoId)
    .eq('estado', 'en_curso')
    .order('iniciado_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: vehiculo } = await supabase
    .from('vehiculos')
    .select('nombre, tipo, patente, modelo, color, combustible, km_actual, estado')
    .eq('id', vehiculoId)
    .single()

  // Si hay viaje activo, mostrar detalle normal
  if (viaje && vehiculo) {
    let conductor: { nombre: string } | null = null
    if (viaje.conductor_id) {
      const { data } = await supabase.from('users').select('nombre').eq('id', viaje.conductor_id).single()
      conductor = data
    }
    return (
      <ViajeDetailClient
        user={user}
        viaje={{ ...viaje, conductor, vehiculo }}
      />
    )
  }

  // Sin viaje activo — mostrar estado y opción de liberar
  return (
    <div style={{ flex: 1, minHeight: 0, background: '#080808', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(245,158,11,0.12)', border: '2px solid rgba(245,158,11,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28 }}>
        ⚠️
      </div>
      <p style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', textAlign: 'center' }}>
        {vehiculo?.nombre ?? 'Vehículo'} está en uso sin viaje registrado
      </p>
      <p style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center' }}>
        El vehículo quedó marcado como "en uso" pero no tiene un viaje activo asociado.
      </p>
      <form action={async () => {
        'use server'
        const sb = await import('@/lib/supabase/server').then(m => m.createClient())
        await (await sb).from('vehiculos').update({ estado: 'disponible' }).eq('id', vehiculoId)
        redirect('/flota')
      }}>
        <button type="submit" style={{ padding: '14px 28px', borderRadius: 12, border: 'none', cursor: 'pointer', background: '#D4AF37', color: '#fff', fontSize: 15, fontWeight: 800 }}>
          Liberar vehículo
        </button>
      </form>
      <a href="/flota" style={{ fontSize: 13, color: 'var(--muted)', textDecoration: 'none' }}>← Volver a flota</a>
    </div>
  )
}
