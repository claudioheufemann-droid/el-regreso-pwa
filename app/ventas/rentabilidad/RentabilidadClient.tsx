'use client'

import { useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, TrendingUp, Plus, Trash2, Save, Beer, Percent, ArrowRight, Lock, Pencil } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { createClient } from '@/lib/supabase/client'
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/States'
import SettingsPanel from '@/components/ui/SettingsPanel'
import NotificationsBell from '@/components/ui/NotificationsBell'
import ProductImage from '@/components/ui/ProductImage'
import type { AppUser } from '@/lib/auth'
import {
  type CostoPrecio, type Zona, type Formato, type ItemSimulacion, type PromoTramo,
  ZONA_LABEL, SEMAFORO_COLOR, PROMO_PRESETS, MARGEN_PRESETS,
  desglosePrecio, calcularMargen, semaforoDeMargen, descuentoMaximoPct, precioNetoParaMargen,
  simular, simularPromo, promoAItemSimulacion, fmtCLP, fmtPct,
} from '@/lib/rentabilidad'

const C = {
  bg: '#F1F5F9', card: '#FFFFFF', hero: '#0F172A',
  text: '#0F172A', muted: '#64748B', faint: '#94A3B8', line: '#E2E8F0',
  blue: '#2563EB', blueSoft: '#EFF6FF',
  green: '#059669', greenSoft: '#ECFDF5',
  amber: '#D97706', amberSoft: '#FFFBEB',
  red: '#DC2626', redSoft: '#FEF2F2',
}

// La foto la resuelve ProductImage (fuente única en lib/producto-imagenes.ts).
function ProductoThumb({ nombre, codigo, categoria, formato, size = 40 }: { nombre?: string | null; codigo: string | null; categoria: string; formato: Formato; size?: number }) {
  return <ProductImage nombre={nombre} codigo={codigo} categoria={categoria} esBarril={formato === 'barril'} size={size} radius={9} />
}

function SemaforoBadge({ pct }: { pct: number }) {
  const s = semaforoDeMargen(pct)
  const color = SEMAFORO_COLOR[s]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 100,
      background: `${color}18`, color, fontSize: 11.5, fontWeight: 800,
    }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: color }} />
      {fmtPct(pct)}
    </span>
  )
}

type Tab = 'catalogo' | 'simulador' | 'promociones' | 'historial'

interface SimulacionGuardada {
  id: string
  created_at: string
  nota: string | null
  zona: Zona
  venta_neta_total: number
  costo_total: number
  margen_clp: number
  margen_pct: number
  items: ItemSimulacion[]
}

export default function RentabilidadClient({ user, filasIniciales }: { user: AppUser; filasIniciales: CostoPrecio[] }) {
  const router = useRouter()
  const { user: ctxUser } = useUser()
  const supabase = useMemo(() => createClient(), [])

  const [showSettings, setShowSettings] = useState(false)
  const [tab, setTab] = useState<Tab>('catalogo')
  const [zona, setZona] = useState<Zona>('sur')
  const [formatoFiltro, setFormatoFiltro] = useState<Formato>('lata')
  const [filas, setFilas] = useState<CostoPrecio[]>(filasIniciales)
  const [guardando, setGuardando] = useState<string | null>(null)

  const [items, setItems] = useState<ItemSimulacion[]>([])
  const [nota, setNota] = useState('')
  const [guardandoSim, setGuardandoSim] = useState(false)
  const [historial, setHistorial] = useState<SimulacionGuardada[] | null>(null)
  const [errorHistorial, setErrorHistorial] = useState<string | null>(null)
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const catalogoMap = useMemo(() => new Map(filas.map(f => [f.id, f])), [filas])
  const filasZona = useMemo(() => filas.filter(f => f.zona === zona), [filas, zona])
  const filasZonaFormato = useMemo(() => filasZona.filter(f => f.formato === formatoFiltro), [filasZona, formatoFiltro])
  const cervezas = useMemo(() => filasZonaFormato.filter(f => f.categoria === 'cerveza').sort((a, b) => a.producto.localeCompare(b.producto)), [filasZonaFormato])
  const kombuchas = useMemo(() => filasZonaFormato.filter(f => f.categoria === 'kombucha').sort((a, b) => a.producto.localeCompare(b.producto)), [filasZonaFormato])

  async function actualizarCampo(id: string, campo: 'costo_neto' | 'precio_neto', valor: number) {
    setFilas(prev => prev.map(f => f.id === id ? { ...f, [campo]: valor } : f))
    setGuardando(id)
    const { error } = await supabase.from('costos_precios').update({ [campo]: valor, updated_at: new Date().toISOString() }).eq('id', id)
    setGuardando(null)
    if (error) console.error('rentabilidad: error guardando', error)
  }

  const resumen = useMemo(() => simular(items, catalogoMap), [items, catalogoMap])

  function agregarItem(cp: CostoPrecio) {
    setItems(prev => {
      const existe = prev.find(i => i.costoPrecioId === cp.id)
      if (existe) return prev.map(i => i.costoPrecioId === cp.id ? { ...i, cantidad: i.cantidad + 1 } : i)
      return [...prev, { costoPrecioId: cp.id, producto: cp.producto, formato: cp.formato, cantidad: 1, descuentoPct: 0 }]
    })
  }

  function actualizarItem(id: string, campo: 'cantidad' | 'descuentoPct', valor: number) {
    setItems(prev => prev.map(i => i.costoPrecioId === id ? { ...i, [campo]: valor } : i))
  }

  function quitarItem(id: string) {
    setItems(prev => prev.filter(i => i.costoPrecioId !== id))
  }

  function usarPromoEnSimulador(item: ItemSimulacion) {
    setItems(prev => {
      const existe = prev.find(i => i.costoPrecioId === item.costoPrecioId)
      if (existe) return prev.map(i => i.costoPrecioId === item.costoPrecioId ? item : i)
      return [...prev, item]
    })
    setTab('simulador')
  }

  async function guardarSimulacion() {
    if (items.length === 0) return
    setGuardandoSim(true)
    const { error } = await supabase.from('simulaciones_rentabilidad').insert({
      user_id: user.id,
      nota: nota.trim() || null,
      zona,
      items,
      venta_neta_total: resumen.ventaNetaTotal,
      costo_total: resumen.costoTotal,
      margen_clp: resumen.margenClpTotal,
      margen_pct: resumen.margenPctTotal,
    })
    setGuardandoSim(false)
    if (error) { console.error('rentabilidad: error guardando simulación', error); return }
    setItems([])
    setNota('')
  }

  async function cargarHistorial() {
    setCargandoHistorial(true)
    setErrorHistorial(null)
    const { data, error } = await supabase
      .from('simulaciones_rentabilidad')
      .select('id, created_at, nota, zona, venta_neta_total, costo_total, margen_clp, margen_pct, items')
      .order('created_at', { ascending: false })
      .limit(50)
    setCargandoHistorial(false)
    if (error) {
      console.error('rentabilidad: error cargando historial', error)
      // Antes esto sólo logueaba y volvía — `historial` se quedaba en null
      // y el tab mostraba "Sin simulaciones guardadas todavía", que es
      // mentira: la consulta ni siquiera llegó a responder.
      setErrorHistorial(error.message)
      return
    }
    // Mismo caso que costo_neto/precio_neto: columnas numeric vuelven como
    // string desde PostgREST — se convierten acá antes de formatear.
    setHistorial((data ?? []).map(s => ({
      ...s,
      venta_neta_total: Number(s.venta_neta_total),
      costo_total: Number(s.costo_total),
      margen_clp: Number(s.margen_clp),
      margen_pct: Number(s.margen_pct),
    })) as SimulacionGuardada[])
  }

  function abrirTab(t: Tab) {
    setTab(t)
    if (t === 'historial' && historial === null) cargarHistorial()
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 'max(140px, calc(env(safe-area-inset-bottom, 0px) + 120px))' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 0' }}>
        <button
          onClick={() => router.push('/ventas')}
          aria-label="Volver"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            background: C.card, border: `1px solid ${C.line}`,
            borderRadius: 100, padding: '7px 14px 7px 10px', marginBottom: 14,
            color: C.blue, fontSize: 13, fontWeight: 700, cursor: 'pointer', minHeight: 36,
          }}
        >
          <ChevronLeft size={17} strokeWidth={2.5} color={C.blue} />
          Volver
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: C.muted, letterSpacing: '0.04em' }}>SOLO USO INTERNO</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: C.text, letterSpacing: '-0.5px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={22} color={C.green} />
              Rentabilidad
            </h1>
            <p style={{ fontSize: 12, color: C.faint, marginTop: 2 }}>Costos, márgenes y simulación de descuentos</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginTop: 2 }}>
            <NotificationsBell inline variant="light" />
            <button
              onClick={() => setShowSettings(true)}
              aria-label="Cuenta"
              style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', border: `1px solid ${C.line}`, background: C.hero, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', flexShrink: 0, padding: 0 }}
            >
              {ctxUser?.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={ctxUser.avatarUrl} alt={ctxUser.nombre} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : (ctxUser?.iniciales || '··')}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 6, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 4, marginBottom: 14 }}>
          {([['catalogo', 'Catálogo'], ['simulador', 'Simulador'], ['promociones', 'Promos'], ['historial', 'Historial']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => abrirTab(t)} style={{
              flex: 1, padding: '9px 0', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: tab === t ? C.hero : 'transparent', color: tab === t ? '#fff' : C.muted,
              fontSize: 13, fontWeight: 700,
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* Zona selector — comparte catálogo y simulador */}
        {tab !== 'historial' && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 16, overflowX: 'auto' }}>
            {(['sur', 'santiago', 'supermercados'] as Zona[]).map(z => (
              <button key={z} onClick={() => setZona(z)} style={{
                padding: '7px 14px', borderRadius: 100, border: `1.5px solid ${zona === z ? C.blue : C.line}`,
                background: zona === z ? C.blueSoft : C.card, color: zona === z ? C.blue : C.muted,
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
              }}>
                {ZONA_LABEL[z]}
              </button>
            ))}
          </div>
        )}

        {tab === 'catalogo' && (
          <>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              {(['lata', 'barril'] as Formato[]).map(f => (
                <button key={f} onClick={() => setFormatoFiltro(f)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 10, border: `1.5px solid ${formatoFiltro === f ? C.text : C.line}`,
                  background: formatoFiltro === f ? C.hero : C.card, color: formatoFiltro === f ? '#fff' : C.muted,
                  fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                }}>
                  {f === 'lata' ? 'Latas' : 'Barriles'}
                </button>
              ))}
            </div>
            <CatalogoTab cervezas={cervezas} kombuchas={kombuchas} guardando={guardando} onGuardar={actualizarCampo} />
          </>
        )}

        {tab === 'simulador' && (
          <SimuladorTab
            filasZona={filasZona}
            items={items}
            resumen={resumen}
            nota={nota}
            guardando={guardandoSim}
            onAgregar={agregarItem}
            onActualizar={actualizarItem}
            onQuitar={quitarItem}
            onNota={setNota}
            onGuardar={guardarSimulacion}
          />
        )}

        {tab === 'promociones' && (
          <PromocionesTab filasZona={filasZona} onUsarEnSimulador={usarPromoEnSimulador} />
        )}

        {tab === 'historial' && (
          <HistorialTab cargando={cargandoHistorial} historial={historial} error={errorHistorial} onRetry={cargarHistorial} />
        )}
      </div>

      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          userName={ctxUser?.nombre ?? ''}
          userEmail={ctxUser?.email ?? ''}
          avatarUrl={ctxUser?.avatarUrl ?? undefined}
        />
      )}
    </div>
  )
}

function LineaDato({ label, valor, destacado, sub }: { label: string; valor: string; destacado?: boolean; sub?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: sub ? '3px 0 3px 10px' : '4px 0' }}>
      <span style={{ fontSize: sub ? 11 : 12, color: destacado ? C.text : C.muted, fontWeight: destacado ? 700 : 500 }}>{label}</span>
      <span style={{ fontSize: destacado ? 13.5 : 12, color: C.text, fontWeight: destacado ? 800 : 600 }}>{valor}</span>
    </div>
  )
}

function nearestMargenPreset(margenPct: number): number {
  return MARGEN_PRESETS.reduce((prev, curr) => Math.abs(curr - margenPct) < Math.abs(prev - margenPct) ? curr : prev)
}

/** Inverso de precioNetoParaMargen: de un monto de utilidad fijo (sobre un costo fijo) al % de contribución que representa. */
function utilidadAMargenPct(costoNeto: number, utilidadClp: number): number {
  const total = costoNeto + utilidadClp
  return total > 0 ? utilidadClp / total : 0
}

function FilaProducto({ cp, guardando, onGuardar }: { cp: CostoPrecio; guardando: boolean; onGuardar: (id: string, campo: 'costo_neto' | 'precio_neto', valor: number) => void }) {
  const [editando, setEditando] = useState(false)
  const [costo, setCosto] = useState(String(cp.costo_neto || ''))
  const [precio, setPrecio] = useState(String(cp.precio_neto || ''))

  const desglose = desglosePrecio(cp.precio_neto, cp.aplica_ila)
  const margenActual = calcularMargen(cp.precio_neto, cp.costo_neto)
  const precioLista = cp.precio_neto + desglose.iva

  // El simulador nunca toca precio_neto (fijo, es el dato real). Los dos
  // controles que "juegan" son % de contribución y monto de utilidad —
  // cambiar uno recalcula el otro sobre el costo fijo; de ahí se deriva
  // solo el precio final para el cliente, como vista, no como edición.
  const [margenSel, setMargenSel] = useState(() => nearestMargenPreset(margenActual.margenPct))
  const costoValido = cp.costo_neto > 0
  const utilidadClp = costoValido ? precioNetoParaMargen(cp.costo_neto, margenSel)! - cp.costo_neto : null
  const precioClienteSimulado = costoValido && utilidadClp !== null
    ? desglosePrecio(cp.costo_neto + utilidadClp, cp.aplica_ila).precioCliente
    : null

  function onCambiarMargen(pct: number) {
    setMargenSel(Math.max(0, Math.min(0.99, pct)))
  }
  function onCambiarUtilidad(monto: number) {
    setMargenSel(Math.max(0, Math.min(0.99, utilidadAMargenPct(cp.costo_neto, monto))))
  }

  return (
    <div style={{ padding: '12px 14px', background: C.card, borderRadius: 14, border: `1px solid ${C.line}`, marginBottom: 8, opacity: guardando ? 0.6 : 1 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <ProductoThumb nombre={cp.producto} codigo={cp.codigo} categoria={cp.categoria} formato={cp.formato} />
        <p style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {cp.producto}
        </p>
        <button
          onClick={() => setEditando(v => !v)}
          title={editando ? 'Bloquear costo y precio neto' : 'Editar costo y precio neto'}
          style={{
            display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
            background: editando ? C.amberSoft : 'transparent', border: `1px solid ${editando ? C.amber : C.line}`,
            borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: editando ? C.amber : C.faint, fontSize: 10.5, fontWeight: 700,
          }}
        >
          {editando ? <><Pencil size={11} /> Editando</> : <><Lock size={11} /> Fijo</>}
        </button>
      </div>

      {editando ? (
        <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}>
            Costo
            <input
              type="number" value={costo} onChange={e => setCosto(e.target.value)}
              onBlur={() => onGuardar(cp.id, 'costo_neto', parseFloat(costo) || 0)}
              style={{ width: 80, padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.line}`, fontSize: 12, color: C.text }}
            />
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.muted }}>
            P. Neto
            <input
              type="number" value={precio} onChange={e => setPrecio(e.target.value)}
              onBlur={() => onGuardar(cp.id, 'precio_neto', parseFloat(precio) || 0)}
              style={{ width: 80, padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.line}`, fontSize: 12, color: C.text }}
            />
          </label>
        </div>
      ) : (
        <div style={{ marginBottom: 4 }}>
          <LineaDato label="Costo" valor={fmtCLP(cp.costo_neto)} destacado />
          <LineaDato label="Precio Neto" valor={fmtCLP(cp.precio_neto)} destacado />
          <LineaDato label="IVA (19%)" valor={`+ ${fmtCLP(desglose.iva)}`} sub />
          <LineaDato label="Precio Lista (Neto + IVA)" valor={fmtCLP(precioLista)} />
          {cp.aplica_ila && <LineaDato label="ILA (20,5%)" valor={`+ ${fmtCLP(desglose.ila)}`} sub />}
          <LineaDato label="Precio Final Cliente" valor={fmtCLP(desglose.precioCliente)} destacado />
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0 2px', borderTop: `1px dashed ${C.line}`, marginTop: 4 }}>
        <span style={{ fontSize: 11, color: C.faint }}>Margen actual</span>
        <SemaforoBadge pct={margenActual.margenPct} />
      </div>

      <div style={{ background: C.bg, borderRadius: 10, padding: 10, marginTop: 6 }}>
        <p style={{ fontSize: 11.5, color: C.muted, fontWeight: 700, marginBottom: 8 }}>Jugar con el margen (costo fijo, no toca el precio neto)</p>
        {!costoValido ? (
          <p style={{ fontSize: 11, color: C.faint }}>Falta cargar el costo de este producto para simular un margen.</p>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10.5, color: C.faint }}>% de contribución</span>
                <select
                  value={margenSel}
                  onChange={e => onCambiarMargen(parseFloat(e.target.value))}
                  style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 12.5, fontWeight: 700, color: C.text, background: C.card }}
                >
                  {MARGEN_PRESETS.map(m => <option key={m} value={m}>{fmtPct(m)}</option>)}
                </select>
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
                <span style={{ fontSize: 10.5, color: C.faint }}>Monto de utilidad</span>
                <input
                  type="number" value={Math.round(utilidadClp ?? 0)}
                  onChange={e => onCambiarUtilidad(parseFloat(e.target.value) || 0)}
                  style={{ padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 12.5, fontWeight: 700, color: C.text, background: C.card }}
                />
              </label>
            </div>
            <LineaDato label="Precio final para el cliente" valor={precioClienteSimulado !== null ? fmtCLP(precioClienteSimulado) : '—'} destacado />
          </>
        )}
      </div>
    </div>
  )
}

function CatalogoTab({ cervezas, kombuchas, guardando, onGuardar }: {
  cervezas: CostoPrecio[]; kombuchas: CostoPrecio[]; guardando: string | null
  onGuardar: (id: string, campo: 'costo_neto' | 'precio_neto', valor: number) => void
}) {
  return (
    <div>
      <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.05em', margin: '4px 0 8px', textTransform: 'uppercase' }}>
        <Beer size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Cervezas
      </p>
      {cervezas.map(cp => <FilaProducto key={cp.id} cp={cp} guardando={guardando === cp.id} onGuardar={onGuardar} />)}

      <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.05em', margin: '16px 0 8px', textTransform: 'uppercase' }}>
        🫧 Kombuchas
      </p>
      {kombuchas.map(cp => <FilaProducto key={cp.id} cp={cp} guardando={guardando === cp.id} onGuardar={onGuardar} />)}
    </div>
  )
}

function SimuladorTab({ filasZona, items, resumen, nota, guardando, onAgregar, onActualizar, onQuitar, onNota, onGuardar }: {
  filasZona: CostoPrecio[]
  items: ItemSimulacion[]
  resumen: ReturnType<typeof simular>
  nota: string
  guardando: boolean
  onAgregar: (cp: CostoPrecio) => void
  onActualizar: (id: string, campo: 'cantidad' | 'descuentoPct', valor: number) => void
  onQuitar: (id: string) => void
  onNota: (v: string) => void
  onGuardar: () => void
}) {
  const [busca, setBusca] = useState('')
  const disponibles = useMemo(
    () => filasZona.filter(f => f.producto.toLowerCase().includes(busca.toLowerCase()) && !items.some(i => i.costoPrecioId === f.id)),
    [filasZona, busca, items]
  )
  const catalogoMap = useMemo(() => new Map(filasZona.map(f => [f.id, f])), [filasZona])

  return (
    <div>
      <input
        placeholder="Buscar producto para agregar…" value={busca} onChange={e => setBusca(e.target.value)}
        style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, fontSize: 13, marginBottom: 8, color: C.text }}
      />
      {busca && (
        <div style={{ marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto' }}>
          {disponibles.slice(0, 8).map(cp => (
            <button key={cp.id} onClick={() => { onAgregar(cp); setBusca('') }} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 10,
              border: `1px solid ${C.line}`, background: C.card, cursor: 'pointer', textAlign: 'left',
            }}>
              <Plus size={14} color={C.blue} />
              <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{cp.producto} · {cp.formato === 'lata' ? 'Lata' : 'Barril'}</span>
            </button>
          ))}
          {disponibles.length === 0 && <p style={{ fontSize: 12, color: C.faint, padding: '6px 4px' }}>Sin resultados.</p>}
        </div>
      )}

      {items.length === 0 ? (
        <div style={{ padding: '40px 16px', textAlign: 'center', background: C.card, borderRadius: 14, border: `1px dashed ${C.line}` }}>
          <p style={{ fontSize: 13, color: C.faint }}>Busca un producto arriba y arma la simulación de venta.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {resumen.lineas.map(l => {
            const cp = catalogoMap.get(l.costoPrecioId)
            const dmax = cp ? descuentoMaximoPct(cp.costo_neto, cp.precio_neto) : null
            return (
              <div key={l.costoPrecioId} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.line}`, padding: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{l.producto} · {l.formato === 'lata' ? 'Lata' : 'Barril'}</p>
                  <button onClick={() => onQuitar(l.costoPrecioId)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.red }}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Cant.
                    <input type="number" min={1} value={l.cantidad}
                      onChange={e => onActualizar(l.costoPrecioId, 'cantidad', Math.max(1, parseInt(e.target.value) || 1))}
                      style={{ width: 56, padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.line}`, fontSize: 12 }} />
                  </label>
                  <label style={{ fontSize: 11, color: C.muted, display: 'flex', alignItems: 'center', gap: 4 }}>
                    Desc. %
                    <input type="number" min={0} max={100} value={Math.round(l.descuentoPct * 100)}
                      onChange={e => onActualizar(l.costoPrecioId, 'descuentoPct', Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)) / 100)}
                      style={{ width: 56, padding: '3px 6px', borderRadius: 6, border: `1px solid ${C.line}`, fontSize: 12 }} />
                  </label>
                  {dmax !== null && (
                    <span style={{ fontSize: 10.5, color: C.amber, fontWeight: 700 }}>
                      Máx. {fmtPct(dmax)} antes de rojo
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
                  <span style={{ fontSize: 11.5, color: C.faint }}>Venta neta: {fmtCLP(l.ventaNetaLinea)}</span>
                  <SemaforoBadge pct={l.margenPctLinea} />
                </div>
              </div>
            )
          })}

          <input
            placeholder="Nota (ej. Bar Ejemplo — negociación julio)" value={nota} onChange={e => onNota(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, fontSize: 13, marginTop: 6, color: C.text }}
          />

          <div style={{
            marginTop: 10, padding: 14, borderRadius: 14, background: C.hero,
            border: `2px solid ${SEMAFORO_COLOR[resumen.semaforo]}55`,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Venta neta total</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmtCLP(resumen.ventaNetaTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Costo total</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmtCLP(resumen.costoTotal)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color: '#fff' }}>Margen</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 800, color: SEMAFORO_COLOR[resumen.semaforo] }}>{fmtCLP(resumen.margenClpTotal)}</span>
                <SemaforoBadge pct={resumen.margenPctTotal} />
              </span>
            </div>
            <button onClick={onGuardar} disabled={guardando} style={{
              width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', cursor: guardando ? 'default' : 'pointer',
              background: '#D4AF37', color: '#0F172A', fontSize: 13, fontWeight: 800,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: guardando ? 0.6 : 1,
            }}>
              <Save size={15} />
              {guardando ? 'Guardando…' : 'Guardar simulación'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function PromocionesTab({ filasZona, onUsarEnSimulador }: {
  filasZona: CostoPrecio[]
  onUsarEnSimulador: (item: ItemSimulacion) => void
}) {
  const [busca, setBusca] = useState('')
  const [productoSel, setProductoSel] = useState<CostoPrecio | null>(null)
  const [presetIdx, setPresetIdx] = useState<number | 'custom'>(0)
  const [custom, setCustom] = useState<PromoTramo>({ nombre: 'Personalizada', cantidadGrupo: 2, descuentosPct: [0, 0.5], repetir: false })
  const [cantidad, setCantidad] = useState(6)

  const resultados = useMemo(
    () => filasZona.filter(f => f.producto.toLowerCase().includes(busca.toLowerCase())),
    [filasZona, busca]
  )

  const promo: PromoTramo = presetIdx === 'custom' ? custom : PROMO_PRESETS[presetIdx]
  const resumen = productoSel ? simularPromo(productoSel, cantidad, promo) : null
  const comparacion = useMemo(() => {
    if (!productoSel) return []
    return [1, 2, 3].map(f => promo.cantidadGrupo * f).map(cant => ({ cant, r: simularPromo(productoSel, cant, promo) }))
  }, [productoSel, promo])

  function cambiarGrupoCustom(n: number) {
    const grupo = Math.max(1, Math.min(12, n || 1))
    setCustom(prev => ({ ...prev, cantidadGrupo: grupo, descuentosPct: Array.from({ length: grupo }, (_, i) => prev.descuentosPct[i] ?? 0) }))
  }

  function actualizarDescuentoCustom(pos: number, pct: number) {
    setCustom(prev => {
      const next = [...prev.descuentosPct]
      next[pos] = Math.min(1, Math.max(0, pct / 100))
      return { ...prev, descuentosPct: next }
    })
  }

  return (
    <div>
      {!productoSel ? (
        <>
          <input
            placeholder="Buscar producto para simular una promo…" value={busca} onChange={e => setBusca(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${C.line}`, background: C.card, fontSize: 13, marginBottom: 8, color: C.text }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
            {resultados.slice(0, 20).map(cp => (
              <button key={cp.id} onClick={() => setProductoSel(cp)} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '9px 10px', borderRadius: 10,
                border: `1px solid ${C.line}`, background: C.card, cursor: 'pointer', textAlign: 'left',
              }}>
                <ProductoThumb nombre={cp.producto} codigo={cp.codigo} categoria={cp.categoria} formato={cp.formato} size={28} />
                <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{cp.producto} · {cp.formato === 'lata' ? 'Lata' : 'Barril'}</span>
              </button>
            ))}
            {busca && resultados.length === 0 && <p style={{ fontSize: 12, color: C.faint, padding: '6px 4px' }}>Sin resultados.</p>}
            {!busca && <p style={{ fontSize: 12, color: C.faint, padding: '10px 4px' }}>Busca un producto para armar una promoción y ver cuánto ganarías.</p>}
          </div>
        </>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: C.card, borderRadius: 12, border: `1px solid ${C.line}`, marginBottom: 12 }}>
            <ProductoThumb nombre={productoSel.producto} codigo={productoSel.codigo} categoria={productoSel.categoria} formato={productoSel.formato} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{productoSel.producto} · {productoSel.formato === 'lata' ? 'Lata' : 'Barril'}</p>
              <p style={{ fontSize: 11, color: C.faint }}>Precio neto {fmtCLP(productoSel.precio_neto)} · Costo {fmtCLP(productoSel.costo_neto)}</p>
            </div>
            <button onClick={() => { setProductoSel(null); setBusca('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.blue, fontSize: 12, fontWeight: 700 }}>
              Cambiar
            </button>
          </div>

          <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.05em', margin: '4px 0 8px', textTransform: 'uppercase' }}>
            <Percent size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} /> Tipo de promo
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            {PROMO_PRESETS.map((p, i) => (
              <button key={p.nombre} onClick={() => setPresetIdx(i)} style={{
                padding: '7px 12px', borderRadius: 100, border: `1.5px solid ${presetIdx === i ? C.blue : C.line}`,
                background: presetIdx === i ? C.blueSoft : C.card, color: presetIdx === i ? C.blue : C.muted,
                fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              }}>
                {p.nombre}
              </button>
            ))}
            <button onClick={() => setPresetIdx('custom')} style={{
              padding: '7px 12px', borderRadius: 100, border: `1.5px solid ${presetIdx === 'custom' ? C.blue : C.line}`,
              background: presetIdx === 'custom' ? C.blueSoft : C.card, color: presetIdx === 'custom' ? C.blue : C.muted,
              fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
            }}>
              Personalizada
            </button>
          </div>

          {presetIdx === 'custom' && (
            <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.line}`, padding: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.muted, marginBottom: 10 }}>
                Cada
                <input type="number" min={1} max={12} value={custom.cantidadGrupo}
                  onChange={e => cambiarGrupoCustom(parseInt(e.target.value) || 1)}
                  style={{ width: 56, padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.line}`, fontSize: 12 }} />
                unidades, descuento por posición:
              </label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
                {custom.descuentosPct.map((d, i) => (
                  <label key={i} style={{ fontSize: 11, color: C.muted, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
                    Unidad {i + 1}
                    <input type="number" min={0} max={100} value={Math.round(d * 100)}
                      onChange={e => actualizarDescuentoCustom(i, parseFloat(e.target.value) || 0)}
                      style={{ width: 52, padding: '4px 6px', borderRadius: 6, border: `1px solid ${C.line}`, fontSize: 12, textAlign: 'center' }} />
                  </label>
                ))}
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.text }}>
                <input type="checkbox" checked={custom.repetir} onChange={e => setCustom(prev => ({ ...prev, repetir: e.target.checked }))} />
                Se repite en pedidos más grandes (si no, el descuento aplica una sola vez y el resto se cobra normal)
              </label>
            </div>
          )}

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: C.muted, marginBottom: 14 }}>
            Unidades a cotizar
            <input type="number" min={1} value={cantidad}
              onChange={e => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
              style={{ width: 64, padding: '6px 8px', borderRadius: 8, border: `1px solid ${C.line}`, fontSize: 13, fontWeight: 700 }} />
          </label>

          {resumen && (
            <div style={{ padding: 14, borderRadius: 14, background: C.hero, border: `2px solid ${SEMAFORO_COLOR[resumen.semaforo]}55`, marginBottom: 14 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 10 }}>
                {resumen.unidades.slice(0, 24).map(u => (
                  <span key={u.posicion} title={`Unidad ${u.posicion + 1}: ${fmtPct(u.descuentoPct)} dcto`} style={{
                    width: 22, height: 22, borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 800,
                    background: u.descuentoPct === 0 ? 'rgba(255,255,255,0.1)' : u.descuentoPct >= 1 ? 'rgba(220,38,38,0.25)' : 'rgba(217,119,6,0.25)',
                    color: u.descuentoPct === 0 ? 'rgba(255,255,255,0.5)' : u.descuentoPct >= 1 ? '#FCA5A5' : '#FCD34D',
                  }}>
                    {Math.round(u.descuentoPct * 100)}
                  </span>
                ))}
                {resumen.unidades.length > 24 && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', alignSelf: 'center' }}>+{resumen.unidades.length - 24}</span>}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Venta normal ({resumen.cantidadTotal} un.)</span>
                <span style={{ fontSize: 13, color: '#fff' }}>{fmtCLP(resumen.ventaNormalTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Descuento de la promo</span>
                <span style={{ fontSize: 13, color: '#FCA5A5' }}>-{fmtCLP(resumen.descuentoTotalClp)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Venta neta con promo</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{fmtCLP(resumen.ventaNetaTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.6)' }}>Costo total</span>
                <span style={{ fontSize: 13, color: '#fff' }}>{fmtCLP(resumen.costoTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 800, color: '#fff', display: 'block' }}>Margen con promo</span>
                  <span style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.5)' }}>vs {fmtPct(resumen.margenPctSinPromo)} sin promo</span>
                </div>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: SEMAFORO_COLOR[resumen.semaforo] }}>{fmtCLP(resumen.margenClpTotal)}</span>
                  <SemaforoBadge pct={resumen.margenPctTotal} />
                </span>
              </div>
              <button onClick={() => onUsarEnSimulador(promoAItemSimulacion(resumen))} style={{
                width: '100%', padding: '11px 0', borderRadius: 10, border: 'none', cursor: 'pointer',
                background: '#D4AF37', color: '#0F172A', fontSize: 13, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                Usar esta promo en el Simulador <ArrowRight size={15} />
              </button>
            </div>
          )}

          <p style={{ fontSize: 11.5, fontWeight: 800, color: C.muted, letterSpacing: '0.05em', margin: '4px 0 8px', textTransform: 'uppercase' }}>
            A distintas cantidades
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {comparacion.map(({ cant, r }) => (
              <div key={cant} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: C.card, borderRadius: 12, border: `1px solid ${C.line}` }}>
                <span style={{ fontSize: 12.5, color: C.text, fontWeight: 600 }}>{cant} unidades</span>
                <span style={{ fontSize: 11.5, color: C.faint }}>{fmtCLP(r.margenClpTotal)}</span>
                <SemaforoBadge pct={r.margenPctTotal} />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function HistorialTab({ cargando, historial, error, onRetry }: {
  cargando: boolean; historial: SimulacionGuardada[] | null; error: string | null; onRetry: () => void
}) {
  if (cargando) return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '4px 0' }}>
      {[0, 1, 2].map(i => <Skeleton key={i} height={64} radius={12} />)}
    </div>
  )
  if (error) return (
    <ErrorState
      compact
      title="No pudimos cargar el historial"
      hint="Revisa tu conexión y vuelve a intentar."
      detail={error}
      showDetail
      onRetry={onRetry}
    />
  )
  if (!historial || historial.length === 0) return (
    <EmptyState
      compact
      title="Sin simulaciones guardadas todavía"
      hint="Las simulaciones que guardes aparecerán acá."
    />
  )
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {historial.map(s => (
        <div key={s.id} style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.line}`, padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <p style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{s.nota || `Simulación ${ZONA_LABEL[s.zona]}`}</p>
              <p style={{ fontSize: 11, color: C.faint, marginTop: 2 }}>
                {new Date(s.created_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' })} · {ZONA_LABEL[s.zona]} · {s.items.length} producto{s.items.length !== 1 ? 's' : ''}
              </p>
            </div>
            <SemaforoBadge pct={s.margen_pct} />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 8 }}>
            <span style={{ fontSize: 11.5, color: C.muted }}>Venta: <b style={{ color: C.text }}>{fmtCLP(s.venta_neta_total)}</b></span>
            <span style={{ fontSize: 11.5, color: C.muted }}>Margen: <b style={{ color: C.text }}>{fmtCLP(s.margen_clp)}</b></span>
          </div>
        </div>
      ))}
    </div>
  )
}
