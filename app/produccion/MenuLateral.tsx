'use client'

import { useCallback, useSyncExternalStore } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  LayoutDashboard, TrendingUp, Package, CalendarDays, CheckCircle2,
  ShoppingCart, CircleDollarSign, ChevronLeft, Home,
} from 'lucide-react'
import { COLORS } from './tema'

/**
 * Menú lateral del módulo Producción.
 *
 * Vive fuera de ProduccionClient.tsx por dos motivos: ese archivo pasa las
 * 5.000 líneas, y sobre todo porque acá adentro se puede montar en el banco
 * de pruebas (/dev/produccion) y MIRARLO. El menú está detrás del login, así
 * que antes de extraerlo la única verificación posible era que compilara.
 *
 * ANCHO SEGÚN EL ESPACIO REAL. En notebooks (1280-1440 px) los 256 px del
 * menú son ~20% del ancho, y estas pantallas muestran tableros que llegan a
 * los 3.000 px. Por eso por defecto queda como riel de iconos y sólo se abre
 * solo en monitores grandes (1536 px+).
 *
 * TODO EL LAYOUT SALE DE UN BOOLEANO Y ESTILOS INLINE, no de clases.
 * Se intentó con utilidades de Tailwind (`w-64`, `2xl:w-64`) y con reglas
 * propias en globals.css, y ninguna de las dos aplicó: en Tailwind v4 las
 * utilidades se emiten dentro de `@layer utilities`, y este proyecto tiene
 * reglas sin capa que les ganan — el mismo problema ya documentado con el
 * spacing. El síntoma era peor que un estilo feo: `width` caía a `auto` y el
 * menú quedaba del ancho de sus iconos sin que nada lo explicara. Para una
 * primitiva de layout como el ancho de una columna, el estilo inline es la
 * única forma que no depende del orden en que se resuelva la cascada.
 */

/* El menú está ordenado como el trabajo, no como una lista de pantallas.
   El flujo real es: se mira cuánto se va a vender, se decide cuántos litros
   de cada producto hay que producir cada mes, y recién ahí se ordena en el
   tiempo y en los tanques. Los tres pasos van numerados porque el orden
   IMPORTA — el paso 3 no se puede armar sin haber cerrado el 2 — y el resto
   queda abajo como consulta, que es como se usa. */
export const navItems = [
  { id: 'resumen', icon: LayoutDashboard, label: 'Resumen', sub: 'Cómo venimos' },
  { id: 'forecasting', icon: TrendingUp, label: '1 · Cuánto vamos a vender', sub: 'Forecast por producto' },
  { id: 'seguridad', icon: Package, label: '2 · Cuánto producir', sub: 'Litros por producto y mes' },
  { id: 'calendario', icon: CalendarDays, label: '3 · Cuándo y dónde', sub: 'Carta Gantt de fermentadores' },
  { id: 'plan', icon: CheckCircle2, label: 'Plan Maestro', sub: 'Cocciones confirmadas' },
  { id: 'insumos', icon: ShoppingCart, label: 'Qué comprar', sub: 'Insumos, cuánto y cuándo' },
  { id: 'presupuesto', icon: CircleDollarSign, label: 'Presupuesto', sub: 'Gasto proyectado' },
] as const

export type TabId = (typeof navItems)[number]['id']

const GRUPOS_NAV: { titulo: string; items: TabId[] }[] = [
  { titulo: 'Dónde estamos', items: ['resumen'] },
  { titulo: 'El plan, paso a paso', items: ['forecasting', 'seguridad', 'calendario'] },
  { titulo: 'Consulta', items: ['plan', 'insumos', 'presupuesto'] },
]

const ANCHO_ABIERTO = 256
const ANCHO_RIEL = 68
/** Desde acá el menú se abre solo: es el corte entre notebook y monitor. */
const CONSULTA_GRANDE = '(min-width: 1536px)'

/* ── Preferencia del usuario ───────────────────────────────────────────
   Se lee con useSyncExternalStore y no con useState+useEffect: localStorage
   es un store externo, y leerlo dentro de un efecto obliga a un setState que
   dispara un render en cascada (lo marca react-hooks). El listener de
   `storage` además mantiene coherentes dos pestañas del módulo. */
type PrefMenu = 'auto' | 'abierto' | 'cerrado'
const CLAVE_MENU = 'prod-menu-lateral'
const oyentesMenu = new Set<() => void>()

function suscribirMenu(alCambiar: () => void) {
  oyentesMenu.add(alCambiar)
  window.addEventListener('storage', alCambiar)
  return () => { oyentesMenu.delete(alCambiar); window.removeEventListener('storage', alCambiar) }
}
function leerMenu(): PrefMenu {
  try {
    const v = localStorage.getItem(CLAVE_MENU)
    return v === 'abierto' || v === 'cerrado' ? v : 'auto'
  } catch { return 'auto' }
}
function guardarMenu(v: PrefMenu) {
  try { localStorage.setItem(CLAVE_MENU, v) } catch { /* modo privado */ }
  oyentesMenu.forEach(f => f())
}

/* ── Tamaño de pantalla ────────────────────────────────────────────────
   matchMedia también es un store externo, así que va por la misma vía. El
   snapshot del servidor es `false` (riel): en un monitor grande eso cuesta
   un cuadro de parpadeo al hidratar, que es mucho menos malo que el
   desajuste de hidratación de leer window.innerWidth en el render. */
function suscribirPantalla(alCambiar: () => void) {
  const mq = window.matchMedia(CONSULTA_GRANDE)
  mq.addEventListener('change', alCambiar)
  return () => mq.removeEventListener('change', alCambiar)
}
function leerPantalla() {
  try { return window.matchMedia(CONSULTA_GRANDE).matches } catch { return false }
}

interface Props {
  activeTab: TabId
  onCambiarTab: (id: TabId) => void
  alertasPorTab: Partial<Record<TabId, number>>
  ultimaCorrida: string | null
  nombreUsuario: string
  inicialesUsuario: string
}

export default function MenuLateral({
  activeTab, onCambiarTab, alertasPorTab, ultimaCorrida, nombreUsuario, inicialesUsuario,
}: Props) {
  const pref = useSyncExternalStore(suscribirMenu, leerMenu, () => 'auto' as PrefMenu)
  const pantallaGrande = useSyncExternalStore(suscribirPantalla, leerPantalla, () => false)

  /** Un solo booleano gobierna TODO el layout del menú. */
  const abierto = pref === 'abierto' || (pref === 'auto' && pantallaGrande)

  const alternar = useCallback(() => {
    // Se guarda el opuesto de lo que se está viendo, no el opuesto de la
    // preferencia: desde 'auto' en un notebook el usuario ve el riel y lo
    // que espera del botón es abrirlo.
    guardarMenu(abierto ? 'cerrado' : 'abierto')
  }, [abierto])

  /** Se oculta lo que necesita ancho. Inline para no depender de la cascada. */
  const soloAbierto = (tipo: 'flex' | 'block' = 'flex') => ({
    display: abierto ? tipo : 'none',
  })

  return (
    <aside
      className="hidden shrink-0 flex-col justify-between lg:flex"
      style={{
        width: abierto ? ANCHO_ABIERTO : ANCHO_RIEL,
        transition: 'width .2s cubic-bezier(0.16,1,0.3,1)',
        // Degradado sutil en vez de un plano: da profundidad sin introducir
        // un color nuevo — es el mismo verde corporativo, apenas más oscuro
        // abajo, así el bloque del usuario se asienta visualmente.
        backgroundImage: `linear-gradient(180deg, ${COLORS.darkGreen} 0%, #0B2E22 100%)`,
      }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center gap-3 py-6"
          style={{ paddingLeft: abierto ? 20 : 12, paddingRight: abierto ? 12 : 12, color: '#fff' }}>
          {/* Logo real de la marca (badge circular gold-on-black). */}
          <div className="relative h-11 w-11 shrink-0">
            <Image src="/logo-icon-1024.png" alt="El Regreso Beer Co." fill sizes="44px" style={{ objectFit: 'contain' }} priority />
          </div>
          <div className="min-w-0 flex-col" style={soloAbierto()}>
            <h1 className="text-lg font-black leading-tight tracking-tight">EL REGRESO</h1>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Beer &amp; Kombucha</p>
          </div>
          <button
            type="button"
            onClick={alternar}
            aria-label="Contraer el menú"
            title="Contraer el menú"
            className="prod-press ml-auto shrink-0 rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
            style={soloAbierto('block')}
          >
            <ChevronLeft size={15} />
          </button>
        </div>

        {/* En riel el botón va suelto y centrado: sin texto al lado, el
            ml-auto lo pegaría contra el borde. */}
        <button
          type="button"
          onClick={alternar}
          aria-label="Expandir el menú"
          title="Expandir el menú"
          className="prod-press mx-auto mb-2 rounded-md p-1.5 text-white/40 hover:bg-white/10 hover:text-white"
          style={{ display: abierto ? 'none' : 'block' }}
        >
          <ChevronLeft size={15} style={{ transform: 'rotate(180deg)' }} />
        </button>

        {/* Los ítems se agrupan por para qué sirven: primero entender la
            demanda, después decidir qué producir y comprar. */}
        <nav className="flex flex-col gap-6 px-3 pb-4">
          {GRUPOS_NAV.map(grupo => (
            <div key={grupo.titulo} className="flex flex-col gap-1">
              <p className="pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/30"
                style={{ ...soloAbierto('block'), paddingLeft: 16 }}>
                {grupo.titulo}
              </p>
              {grupo.items.map(id => {
                const item = navItems.find(n => n.id === id)!
                const activo = activeTab === id
                const alertas = alertasPorTab[id] ?? 0
                return (
                  <button
                    key={id}
                    onClick={() => onCambiarTab(id)}
                    aria-current={activo ? 'page' : undefined}
                    // Con el menú en riel el nombre no se ve: sin el title,
                    // los iconos solos son adivinanza.
                    title={`${item.label} — ${item.sub}`}
                    className={`prod-press group relative flex items-center gap-3 rounded-lg text-left text-sm transition-colors ${
                      activo ? 'font-bold text-white' : 'font-medium text-white/60 hover:bg-white/5 hover:text-white'
                    }`}
                    style={{
                      backgroundColor: activo ? COLORS.lightGreen : 'transparent',
                      paddingTop: 10, paddingBottom: 10,
                      paddingLeft: abierto ? 16 : 0, paddingRight: abierto ? 12 : 0,
                      justifyContent: abierto ? 'flex-start' : 'center',
                    }}
                  >
                    {/* Marca dorada del ítem activo: el cambio de fondo solo
                        era poco contraste sobre el verde. */}
                    <span
                      className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full"
                      style={{ backgroundColor: COLORS.amber, opacity: activo ? 1 : 0 }}
                    />
                    <item.icon size={18} className="shrink-0" style={{ color: activo ? COLORS.amber : undefined }} />
                    <span className="min-w-0 flex-1 flex-col" style={soloAbierto()}>
                      <span className="truncate">{item.label}</span>
                      <span className={`truncate text-[10px] font-medium ${activo ? 'text-white/70' : 'text-white/35'}`}>
                        {item.sub}
                      </span>
                    </span>
                    {alertas > 0 && (
                      <>
                        <span
                          className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums"
                          style={{ ...soloAbierto('block'), backgroundColor: 'rgba(239,68,68,0.18)', color: '#FCA5A5' }}
                          title={`${alertas} ${alertas === 1 ? 'punto' : 'puntos'} que requieren atención`}
                        >
                          {alertas}
                        </span>
                        {/* En riel, un punto sobre el icono: el número no entra
                            en 68 px, pero perder la señal sería peor. */}
                        <span
                          className="absolute right-3 top-2 h-2 w-2 rounded-full"
                          style={{
                            display: abierto ? 'none' : 'block',
                            backgroundColor: '#F87171',
                            boxShadow: `0 0 0 2px ${COLORS.darkGreen}`,
                          }}
                        />
                      </>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </nav>
      </div>

      {/* Estado del modelo: dato operativo que antes sólo vivía en la barra
          superior, donde competía con el título de la sección. */}
      <div className="shrink-0 px-3 pb-3">
        <div className="mb-2 rounded-lg px-4 py-3"
          style={{ ...soloAbierto('block'), backgroundColor: 'rgba(0,0,0,0.22)' }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/35">Último cálculo</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ backgroundColor: ultimaCorrida ? '#34D399' : COLORS.gray }} />
            <span className="truncate text-xs font-semibold text-white/80">
              {ultimaCorrida ? ultimaCorrida.slice(0, 10) : 'Sin corrida'}
            </span>
          </div>
        </div>

        <div className="flex items-center rounded-lg p-3 text-white"
          style={{
            backgroundColor: 'rgba(0,0,0,0.22)',
            justifyContent: abierto ? 'space-between' : 'center',
          }}
          title={`${nombreUsuario} · ${ultimaCorrida ? `último cálculo ${ultimaCorrida.slice(0, 10)}` : 'sin corrida'}`}>
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-black"
              style={{ backgroundColor: COLORS.amber, color: COLORS.darkGreen }}
            >
              {inicialesUsuario || '··'}
            </div>
            <div className="min-w-0 flex-col text-left" style={soloAbierto()}>
              <span className="truncate text-sm font-semibold">{nombreUsuario}</span>
              <span className="text-[11px] text-white/40">Producción</span>
            </div>
          </div>
          <Link href="/" aria-label="Volver al inicio"
            className="shrink-0 rounded-md p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
            style={soloAbierto('block')}>
            <Home size={15} />
          </Link>
        </div>
      </div>
    </aside>
  )
}
