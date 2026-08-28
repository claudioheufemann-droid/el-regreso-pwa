'use client'

/**
 * Buscador global (§Sprint 8) — Cmd+K / Ctrl+K en desktop, ícono de lupa en
 * AppHeader y en el Hub para mobile. Antes no existía ninguna forma de
 * buscar un cliente, pedido, tarea, vehículo o producto sin saber primero
 * en qué módulo vive. Debounce 350ms, mínimo 2 caracteres, resultados
 * agrupados — el servidor nunca manda más de 5 filas por grupo.
 */
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, Users, ShoppingBag, ClipboardList, Truck, Package, Loader2 } from 'lucide-react'
import { useGlobalSearch } from '@/lib/globalSearchContext'

interface Resultado {
  clientes: { id: number; nombre: string; sub: string }[]
  pedidos: { cliente: string; clienteId: number | null; fecha: string; total: number; litros: number }[]
  tareas: { id: string; titulo: string; area: string; estado: string; macroKey: string }[]
  vehiculos: { id: string; nombre: string; patente: string | null }[]
  productos: { nombre: string; estilo: string }[]
}

const VACIO: Resultado = { clientes: [], pedidos: [], tareas: [], vehiculos: [], productos: [] }

function fPeso(n: number) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(n)
}
function fFecha(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
  return `${d} ${meses[m - 1]} ${y}`
}

export default function GlobalSearch() {
  const { open, openSearch, closeSearch } = useGlobalSearch()
  const router = useRouter()
  const [q, setQ] = useState('')
  const [resultado, setResultado] = useState<Resultado>(VACIO)
  const [buscando, setBuscando] = useState(false)
  const [error, setError] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Cmd+K / Ctrl+K global — un solo listener, montado siempre (abierto o no).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        openSearch()
      } else if (e.key === 'Escape') {
        closeSearch()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openSearch, closeSearch])

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); return }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQ('')
    setResultado(VACIO)
    setError(false)
  }, [open])

  const ejecutar = useCallback(async (termino: string) => {
    setBuscando(true)
    try {
      const res = await fetch(`/api/buscar-global?q=${encodeURIComponent(termino)}`)
      if (!res.ok) throw new Error()
      setResultado(await res.json())
      setError(false)
    } catch {
      setError(true)
      setResultado(VACIO)
    } finally {
      setBuscando(false)
    }
  }, [])

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const t = q.trim()
    if (t.length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResultado(VACIO)
      setBuscando(false)
      return
    }
    debounceRef.current = setTimeout(() => ejecutar(t), 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [q, ejecutar])

  function ir(href: string) {
    closeSearch()
    router.push(href)
  }

  if (!open) return null

  const total = resultado.clientes.length + resultado.pedidos.length + resultado.tareas.length + resultado.vehiculos.length + resultado.productos.length
  const buscandoActivo = q.trim().length >= 2

  return (
    <div
      onClick={closeSearch}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '10vh 16px 16px',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 560, maxHeight: '70vh',
          background: '#111111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 18,
          boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <Search size={18} color="rgba(255,255,255,0.4)" style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar clientes, pedidos, tareas, vehículos, productos…"
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 15, color: '#F4EEDF',
            }}
          />
          {buscando && <Loader2 size={16} color="#D4AF37" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }} />}
          <button onClick={closeSearch} aria-label="Cerrar" style={{
            width: 28, height: 28, borderRadius: 8, border: 'none', cursor: 'pointer', flexShrink: 0,
            background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={14} color="rgba(255,255,255,0.5)" />
          </button>
        </div>

        <div style={{ overflowY: 'auto', padding: '8px' }}>
          {!buscandoActivo ? (
            <p style={{ textAlign: 'center', fontSize: 12.5, color: 'rgba(255,255,255,0.3)', padding: '28px 16px' }}>
              Escribe al menos 2 letras para buscar en toda la app.
            </p>
          ) : error ? (
            <p style={{ textAlign: 'center', fontSize: 12.5, color: '#E67E22', padding: '28px 16px' }}>
              No pudimos buscar. Intenta de nuevo.
            </p>
          ) : !buscando && total === 0 ? (
            <p style={{ textAlign: 'center', fontSize: 12.5, color: 'rgba(255,255,255,0.3)', padding: '28px 16px' }}>
              Sin resultados para &quot;{q.trim()}&quot;.
            </p>
          ) : (
            <>
              <Grupo titulo="Clientes" icon={Users} color="#D4AF37">
                {resultado.clientes.map(c => (
                  <Fila key={`c-${c.id}`} titulo={c.nombre} sub={c.sub} onClick={() => ir(`/ventas/clientes/${c.id}`)} />
                ))}
              </Grupo>
              <Grupo titulo="Pedidos" icon={ShoppingBag} color="#5A8A4A">
                {resultado.pedidos.map((p, i) => (
                  <Fila key={`p-${i}`} titulo={p.cliente} sub={`${fFecha(p.fecha)} · ${fPeso(p.total)} · ${p.litros.toFixed(0)} L`}
                    onClick={() => p.clienteId != null && ir(`/ventas/clientes/${p.clienteId}`)} />
                ))}
              </Grupo>
              <Grupo titulo="Tareas" icon={ClipboardList} color="#5B8AA8">
                {resultado.tareas.map(t => (
                  <Fila key={`t-${t.id}`} titulo={t.titulo} sub={`${t.area} · ${t.estado}`} onClick={() => ir(`/gestion/${t.macroKey}`)} />
                ))}
              </Grupo>
              <Grupo titulo="Vehículos" icon={Truck} color="#F97316">
                {resultado.vehiculos.map(v => (
                  <Fila key={`v-${v.id}`} titulo={v.nombre} sub={v.patente ?? ''} onClick={() => ir(`/flota/vehiculo/${v.id}`)} />
                ))}
              </Grupo>
              <Grupo titulo="Productos" icon={Package} color="#9B59B6">
                {resultado.productos.map(p => (
                  <Fila key={`pr-${p.nombre}`} titulo={p.nombre} sub={p.estilo} onClick={() => ir('/ventas/stock')} />
                ))}
              </Grupo>
            </>
          )}
        </div>
      </div>
      <style>{`@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}`}</style>
    </div>
  )
}

function Grupo({ titulo, icon: Icon, color, children }: {
  titulo: string; icon: typeof Users; color: string; children: React.ReactNode
}) {
  const hijos = Array.isArray(children) ? children.filter(Boolean) : children
  const vacio = Array.isArray(hijos) ? hijos.length === 0 : !hijos
  if (vacio) return null
  return (
    <div style={{ marginBottom: 6 }}>
      <p style={{
        display: 'flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800,
        color: `${color}CC`, letterSpacing: '0.06em', textTransform: 'uppercase',
        padding: '8px 10px 4px',
      }}>
        <Icon size={12} color={color} />
        {titulo}
      </p>
      {children}
    </div>
  )
}

function Fila({ titulo, sub, onClick }: { titulo: string; sub: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
        background: 'none', border: 'none', borderRadius: 10, padding: '8px 10px',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >
      <p style={{ fontSize: 13.5, fontWeight: 700, color: '#F4EEDF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</p>
      {sub && <p style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.4)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</p>}
    </button>
  )
}
