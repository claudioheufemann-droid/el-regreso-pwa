import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getServerUser } from '@/lib/auth'
import leadsData from '@/data/cold_leads.json'

export const runtime = 'nodejs'
export const maxDuration = 60

type Lead = {
  nombre: string; region: string | null; ciudad: string | null
  tipo_buscado: string | null; producto_sugerido: string | null
  categoria: string | null; direccion: string | null
  telefono: string | null; sitio_web: string | null; rating: number | null
}

const norm = (s: string | null | undefined) =>
  (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim()

const jitter = (c: number) => c + (Math.random() - 0.5) * 0.012

// POST /api/leads/import  — admin: clasifica, estima potencial, ubica y guarda leads
export async function POST() {
  const user = await getServerUser()
  if (!user?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Supabase service key no configurada' }, { status: 500 })
  const supabase = createClient(url, key)

  // 1. Potencial por categoría (litros/mes) desde el histórico
  const { data: potRaw, error: potErr } = await supabase.rpc('get_categoria_potencial')
  if (potErr) return NextResponse.json({ error: `get_categoria_potencial: ${potErr.message}` }, { status: 500 })
  const cats = ((potRaw ?? []) as { categoria: string; litros_mes_prom: number; n_clientes: number }[])
    .map(c => ({ raw: c.categoria, n: norm(c.categoria), lpm: Number(c.litros_mes_prom) || 0 }))
  const globalAvg = cats.length ? cats.reduce((s, c) => s + c.lpm, 0) / cats.length : 30

  // 2. Centroides de ciudad desde clientes con coordenadas (= zonas de despacho)
  const { data: clientes } = await supabase
    .from('clientes')
    .select('lat, lng, localidad, localidad_entrega')
  const cityAcc = new Map<string, { lat: number; lng: number; n: number }>()
  for (const c of (clientes ?? []) as { lat: number | null; lng: number | null; localidad: string | null; localidad_entrega: string | null }[]) {
    if (!c.lat || !c.lng) continue
    for (const loc of [c.localidad, c.localidad_entrega]) {
      const k = norm(loc)
      if (!k) continue
      const cur = cityAcc.get(k) ?? { lat: 0, lng: 0, n: 0 }
      cur.lat += c.lat; cur.lng += c.lng; cur.n++
      cityAcc.set(k, cur)
    }
  }
  const cityCentroid = new Map<string, { lat: number; lng: number }>()
  for (const [k, v] of cityAcc) cityCentroid.set(k, { lat: v.lat / v.n, lng: v.lng / v.n })

  // 3. Mapear categoría del lead → nuestra categoría → litros base
  function lpmParaLead(l: Lead): { cat: string | null; lpm: number } {
    const candidates = [norm(l.categoria), norm(l.tipo_buscado)].filter(Boolean)
    for (const lc of candidates) {
      // match por inclusión normalizada (palabra >= 4 chars)
      const hit = cats
        .filter(c => c.n && lc && (c.n.includes(lc) || lc.includes(c.n)) && Math.min(c.n.length, lc.length) >= 4)
        .sort((a, b) => b.lpm - a.lpm)[0]
      if (hit) return { cat: hit.raw, lpm: hit.lpm }
    }
    return { cat: null, lpm: globalAvg }
  }

  const leads = leadsData as Lead[]

  // Pre-cálculo para normalizar score por volumen
  const evaluados = leads.map(l => {
    const { cat, lpm } = lpmParaLead(l)
    const ratingFactor = l.rating ? Math.max(0.6, Math.min(1.3, l.rating / 4.5)) : 1.0
    const litros_potencial = Math.round(lpm * ratingFactor * 10) / 10
    const ciudadKey = norm(l.ciudad)
    const centro = cityCentroid.get(ciudadKey) ?? null
    return { l, cat, litros_potencial, centro, en_zona: !!centro }
  })
  const maxLpm = Math.max(1, ...evaluados.map(e => e.litros_potencial))

  const rows = evaluados.map(e => {
    const volNorm = (e.litros_potencial / maxLpm) * 100
    const ratingScore = e.l.rating ? (e.l.rating / 5) * 100 : 50
    const phoneScore = e.l.telefono ? 100 : 0
    const score = Math.round(0.6 * volNorm + 0.25 * ratingScore + 0.15 * phoneScore)
    return {
      nombre: e.l.nombre,
      region: e.l.region,
      ciudad: e.l.ciudad,
      tipo_buscado: e.l.tipo_buscado,
      producto_sugerido: e.l.producto_sugerido,
      categoria: e.l.categoria,
      categoria_mapeada: e.cat,
      direccion: e.l.direccion,
      telefono: e.l.telefono,
      sitio_web: e.l.sitio_web,
      rating: e.l.rating,
      lat: e.centro ? jitter(e.centro.lat) : null,
      lng: e.centro ? jitter(e.centro.lng) : null,
      litros_potencial: e.litros_potencial,
      score_lead: score,
      en_zona: e.en_zona,
    }
  })

  // 4. Upsert por lotes (onConflict nombre,ciudad)
  let inserted = 0
  const BATCH = 500
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH)
    const { error } = await supabase.from('cold_leads').upsert(batch, { onConflict: 'nombre,ciudad', ignoreDuplicates: false })
    if (error) return NextResponse.json({ error: `insert: ${error.message}`, inserted }, { status: 500 })
    inserted += batch.length
  }

  const enZona = rows.filter(r => r.en_zona).length
  return NextResponse.json({
    ok: true,
    total: rows.length,
    en_zona: enZona,
    categorias_historicas: cats.length,
    ciudades_despacho: cityCentroid.size,
    litros_potencial_total_en_zona: Math.round(rows.filter(r => r.en_zona).reduce((s, r) => s + r.litros_potencial, 0)),
  })
}
