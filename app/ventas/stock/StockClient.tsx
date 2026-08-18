'use client'

import { useMemo, useState } from 'react'
import { Package, Search, Beer, Layers } from 'lucide-react'
import type { StockProductoRow } from './page'

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0',
  blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#059669', greenSoft: '#ECFDF5',
  purple: '#7C3AED', purpleSoft: '#F5F3FF',
  amber: '#D97706', amberSoft: '#FFFBEB',
}

const fNum = (n: number) => n.toLocaleString('es-CL')
const fL = (n: number) => `${n.toLocaleString('es-CL', { maximumFractionDigits: 0 })} L`
function fFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d} ${meses[m - 1]} ${y}`
}

export default function StockClient({ filas, fechaInforme }: { filas: StockProductoRow[]; fechaInforme: string | null }) {
  const [tab, setTab] = useState<'barril' | 'envase'>('barril')
  const [busca, setBusca] = useState('')

  const barriles = useMemo(() => filas.filter(f => f.tipo === 'barril'), [filas])
  const envases = useMemo(() => filas.filter(f => f.tipo === 'envase'), [filas])

  const totBarrilesCant = barriles.reduce((s, f) => s + f.cantidad, 0)
  const totBarrilesLitros = barriles.reduce((s, f) => s + (f.litros ?? 0), 0)
  const totEnvasesCant = envases.reduce((s, f) => s + f.cantidad, 0)

  const listaActual = tab === 'barril' ? barriles : envases
  const visibles = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!q) return listaActual
    return listaActual.filter(f => f.producto.toLowerCase().includes(q) || (f.codigo_producto ?? '').toLowerCase().includes(q))
  }, [listaActual, busca])

  const maxCant = Math.max(1, ...listaActual.map(f => f.cantidad))

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 32 }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>CÁMARA GENERAL BARRIOS BAJOS</p>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>Stock de productos</h1>
          <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>
            {fechaInforme ? `Actualizado ${fFecha(fechaInforme)}` : 'Sin datos cargados todavía'}
          </p>
        </div>

        {filas.length === 0 ? (
          <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 32, textAlign: 'center' }}>
            <Package size={36} color={C.faint} style={{ margin: '0 auto 12px' }} />
            <p style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Aún no se ha cargado el stock</p>
            <p style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>Un administrador debe subir el informe desde Admin → Stock</p>
          </div>
        ) : (
          <>
            {/* Resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 16 }}>
              <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: C.amberSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Layers size={15} color={C.amber} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Barriles</span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>{fNum(totBarrilesCant)}</p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{fL(totBarrilesLitros)}</p>
              </div>
              <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 9, background: C.greenSoft, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Beer size={15} color={C.green} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: C.muted }}>Envases</span>
                </div>
                <p style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px' }}>{fNum(totEnvasesCant)}</p>
                <p style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>unidades</p>
              </div>
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4, marginBottom: 12, width: 'fit-content' }}>
              {(['barril', 'envase'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  style={{
                    padding: '8px 16px', borderRadius: 9, border: 'none', cursor: 'pointer',
                    fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                    background: tab === t ? C.hero : 'transparent',
                    color: tab === t ? '#fff' : C.muted,
                  }}
                >
                  {t === 'barril' ? `Barriles (${barriles.length})` : `Envases (${envases.length})`}
                </button>
              ))}
            </div>

            {/* Búsqueda */}
            <div style={{ position: 'relative', marginBottom: 12 }}>
              <Search size={15} color={C.faint} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                value={busca}
                onChange={e => setBusca(e.target.value)}
                placeholder="Buscar producto o código…"
                style={{
                  width: '100%', padding: '10px 12px 10px 36px', borderRadius: 12,
                  border: `1px solid ${C.line}`, background: C.card, fontSize: 13, color: C.text, outline: 'none',
                }}
              />
            </div>

            {/* Lista */}
            {visibles.length === 0 ? (
              <p style={{ textAlign: 'center', color: C.muted, fontSize: 13, padding: 28 }}>Sin coincidencias</p>
            ) : (
              <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.line}`, overflow: 'hidden' }}>
                {visibles.map((f, i) => {
                  const share = (f.cantidad / maxCant) * 100
                  const tintCat = f.categoria === 'Kombucha' ? C.green : C.purple
                  return (
                    <div key={`${f.producto}-${i}`} style={{ padding: '12px 16px', borderTop: i === 0 ? 'none' : `1px solid ${C.line}` }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
                        <div style={{ minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, color: C.text, lineHeight: 1.3 }}>{f.producto}</p>
                          <p style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>
                            {f.codigo_producto ?? '—'}
                            {f.categoria && <span style={{ color: tintCat, fontWeight: 600 }}> · {f.categoria}</span>}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 15, fontWeight: 800, color: C.text }}>
                            {fNum(f.cantidad)} <span style={{ fontSize: 11, fontWeight: 500, color: C.muted }}>{f.tipo === 'barril' ? 'barr.' : 'un.'}</span>
                          </p>
                          {f.litros != null && <p style={{ fontSize: 11, color: C.muted }}>{fL(f.litros)}</p>}
                        </div>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: C.line, overflow: 'hidden' }}>
                        <div style={{ width: `${share}%`, height: '100%', background: tintCat, borderRadius: 3 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
