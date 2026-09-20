import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

/** Configuración por producto del Gantt de Producción: cuántos días corridos
 *  ocupa el fermentador, con qué litraje se suele cocer y de qué color se
 *  pinta el bloque. Es el "apartado de setting" de la sección.
 *
 *  Los días son CORRIDOS, no hábiles: la fermentación no se detiene el fin de
 *  semana. El Gantt que se llevaba en Excel usaba columnas de días hábiles, y
 *  por eso un bloque que dura 12 días corridos se veía de 10. */

const HEX = /^#[0-9a-fA-F]{6}$/

function puedeGestionar(user: { isAdmin: boolean; macroArea: string | null }) {
  return user.isAdmin || user.macroArea === 'produccion'
}

export async function GET() {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('config_produccion_producto')
    .select('producto, categoria, dias_fermentacion, litros_objetivo, color')
    .order('categoria')
    .order('producto')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    config: (data ?? []).map(c => ({
      producto: c.producto as string,
      categoria: c.categoria as 'cerveza' | 'kombucha',
      diasFermentacion: Number(c.dias_fermentacion),
      litrosObjetivo: c.litros_objetivo === null ? null : Number(c.litros_objetivo),
      color: c.color as string,
    })),
  })
}

/** PUT: upsert de UN producto. Se actualiza de a uno porque la UI edita una
 *  fila a la vez y así dos personas editando productos distintos no se pisan. */
export async function PUT(req: Request) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: {
    producto?: string
    categoria?: 'cerveza' | 'kombucha'
    diasFermentacion?: number
    litrosObjetivo?: number | null
    color?: string
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const producto = body.producto?.trim()
  if (!producto) return NextResponse.json({ error: 'Falta el producto' }, { status: 400 })
  if (body.categoria !== 'cerveza' && body.categoria !== 'kombucha') {
    return NextResponse.json({ error: 'Categoría inválida' }, { status: 400 })
  }

  const dias = body.diasFermentacion
  if (dias != null && (!Number.isInteger(dias) || dias < 1 || dias > 120)) {
    return NextResponse.json({ error: 'Los días de fermentación van de 1 a 120' }, { status: 400 })
  }
  // El color entra directo a un style en el cliente, así que se valida acá
  // en vez de sanitizar allá.
  if (body.color != null && !HEX.test(body.color)) {
    return NextResponse.json({ error: 'El color tiene que ser #rrggbb' }, { status: 400 })
  }
  const litros = body.litrosObjetivo
  if (litros != null && (!Number.isFinite(litros) || litros <= 0)) {
    return NextResponse.json({ error: 'El litraje tiene que ser mayor a cero' }, { status: 400 })
  }

  const fila: Record<string, unknown> = {
    producto,
    categoria: body.categoria,
    actualizado_at: new Date().toISOString(),
    actualizado_por: user.id,
  }
  if (dias != null) fila.dias_fermentacion = dias
  if (body.color != null) fila.color = body.color
  // litrosObjetivo admite null a propósito: significa "usar la capacidad del
  // tanque que se elija", que es distinto de "no lo toques".
  if (body.litrosObjetivo !== undefined) fila.litros_objetivo = litros ?? null

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('config_produccion_producto')
    .upsert(fila, { onConflict: 'producto' })
    .select('producto, categoria, dias_fermentacion, litros_objetivo, color')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({
    producto: data.producto as string,
    categoria: data.categoria as 'cerveza' | 'kombucha',
    diasFermentacion: Number(data.dias_fermentacion),
    litrosObjetivo: data.litros_objetivo === null ? null : Number(data.litros_objetivo),
    color: data.color as string,
  })
}
