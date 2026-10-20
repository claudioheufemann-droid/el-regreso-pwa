import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

function puedeGestionar(user: { isAdmin: boolean; macroArea: string | null }) {
  return user.isAdmin || user.macroArea === 'produccion'
}

/** GET: lotes con su tanque y lo envasado, más los catálogos que necesita el
 *  formulario de "Nuevo lote" (recetas y fermentadores activos). */
export async function GET() {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  const admin = createAdminClient()
  const [lotes, envasado, fermentadores, recetas] = await Promise.all([
    admin.from('lotes').select('*').order('fecha_coccion', { ascending: false }).limit(300),
    admin.from('lote_envasado').select('lote_id, formato, unidades, litros'),
    admin.from('fermentadores').select('id, nombre, capacidad_litros, categoria').eq('activo', true).order('nombre'),
    admin.from('recetas').select('id, producto, litros_base').order('producto'),
  ])
  const error = lotes.error ?? envasado.error ?? fermentadores.error ?? recetas.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const envasadoPorLote = new Map<string, { litros: number; barriles: number; latas: number }>()
  for (const e of envasado.data ?? []) {
    const acc = envasadoPorLote.get(e.lote_id) ?? { litros: 0, barriles: 0, latas: 0 }
    acc.litros += Number(e.litros)
    if (e.formato === 'barril') acc.barriles += e.unidades
    else acc.latas += e.unidades
    envasadoPorLote.set(e.lote_id, acc)
  }

  return NextResponse.json({
    lotes: (lotes.data ?? []).map(l => ({ ...l, envasado: envasadoPorLote.get(l.id) ?? { litros: 0, barriles: 0, latas: 0 } })),
    fermentadores: fermentadores.data ?? [],
    recetas: recetas.data ?? [],
  })
}

/** POST: crear un lote. El código se arma solo (aammdd-NN) si no viene. */
export async function POST(req: Request) {
  const user = await getServerUser()
  if (!user || !puedeGestionar(user)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

  let body: {
    producto?: string; categoria?: 'cerveza' | 'kombucha'; recetaId?: string | null; fermentadorId?: string | null
    fechaCoccion?: string; litrosIniciales?: number; planId?: string | null; observaciones?: string | null; codigo?: string
  }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'JSON inválido' }, { status: 400 }) }

  const producto = body.producto?.trim()
  if (!producto) return NextResponse.json({ error: 'Falta el producto' }, { status: 400 })
  if (!body.fechaCoccion || !/^\d{4}-\d{2}-\d{2}$/.test(body.fechaCoccion)) return NextResponse.json({ error: 'Fecha de cocción inválida' }, { status: 400 })
  if (!(typeof body.litrosIniciales === 'number' && body.litrosIniciales > 0)) return NextResponse.json({ error: 'Litros inválidos' }, { status: 400 })

  const admin = createAdminClient()

  let codigo = body.codigo?.trim()
  if (!codigo) {
    const prefijo = body.fechaCoccion.slice(2).replace(/-/g, '')
    const { count } = await admin.from('lotes').select('id', { count: 'exact', head: true }).like('codigo', `${prefijo}-%`)
    codigo = `${prefijo}-${String((count ?? 0) + 1).padStart(2, '0')}`
  }

  const { data, error } = await admin.from('lotes').insert({
    codigo,
    producto,
    categoria: body.categoria ?? null,
    receta_id: body.recetaId ?? null,
    fermentador_id: body.fermentadorId ?? null,
    plan_id: body.planId ?? null,
    fecha_coccion: body.fechaCoccion,
    litros_iniciales: body.litrosIniciales,
    observaciones: body.observaciones ?? null,
    creado_por: user.id,
  }).select('*').single()
  if (error) {
    const duplicado = error.code === '23505'
    return NextResponse.json({ error: duplicado ? `Ya existe el lote ${codigo}` : error.message }, { status: duplicado ? 409 : 500 })
  }

  // La primera etapa queda registrada desde el día uno.
  await admin.from('lote_etapas').insert({ lote_id: data.id, etapa: 'coccion', registrado_por: user.id })
  return NextResponse.json(data, { status: 201 })
}
