import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validarPlanEditable } from '@/lib/terreno/planificacion/validarPlanEditable'
import { calcularYCachearRutaDia } from '@/lib/terreno/planificacion/calcularRutaDia'

// POST /api/terreno/planificacion/[id]/dias/[diaId]/calcular-ruta — calcula (o reutiliza
// del cache) la distancia real del día por el proveedor de rutas configurado. Si no hay
// proveedor o falla, responde ok:false con motivo — nunca inventa un km.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string; diaId: string }> }) {
  const { id, diaId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'No autenticado' }, { status: 401 })

  const { error: errResp } = await validarPlanEditable(supabase, id, user.id)
  if (errResp) return errResp

  const resultado = await calcularYCachearRutaDia(supabase, diaId)
  return NextResponse.json(resultado, { status: resultado.ok ? 200 : 422 })
}
