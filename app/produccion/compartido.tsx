'use client'

import { useState } from 'react'
import ProductImage from '@/components/ui/ProductImage'
import { AlertTriangle, X } from 'lucide-react'
import type { SugerenciaPlan, OcupacionPlanta, RecetaInsumoLinea } from './page'
import { COLORS } from './tema'
import { ENVASE_LABEL, type EnvaseBucket, type FamiliaEnvase } from '@/lib/produccion/reglas'

/** Etiqueta + color por categoría de insumo — mismas 4 del Excel de recetas
 *  (malta/lúpulo/levadura/otros), reutilizado en la tabla de Insumos y Compras. */
export const CATEGORIA_INSUMO: Record<string, { label: string; badge: string }> = {
  malta: { label: 'Malta', badge: 'border-(--p-warn-line) bg-(--p-warn-soft) text-(--p-warn)' },
  lupulo: { label: 'Lúpulo', badge: 'border-(--p-ok-line) bg-(--p-ok-soft) text-(--p-ok)' },
  levadura: { label: 'Levadura', badge: 'border-(--p-violet-line) bg-(--p-violet-soft) text-(--p-violet)' },
  otros: { label: 'Otros', badge: 'border-(--p-line) bg-(--p-card-2) text-(--p-text-2)' },
}

/* ── Preferencia del usuario: Proyección de carga plegada o abierta ──────
   Arranca PLEGADA por decisión del usuario (22-sep-2026): la tarjeta le
   agregaba una fila entera de tarjetas mensuales encima del Gantt, y ese es
   el elemento que de verdad se usa día a día — la proyección es de consulta
   ocasional, no algo para tener siempre a la vista. Se guarda en
   localStorage y no en useState a secas por el mismo motivo que el menú
   lateral que tenía el módulo: localStorage es un store externo, y
   useSyncExternalStore evita el desajuste de hidratación de leerlo dentro de
   un efecto (el snapshot del servidor es siempre `false`, así que la carga
   inicial coincide en server y cliente; recién en el cliente se corrige a lo
   que el usuario haya elegido antes). */
export const CLAVE_PROYECCION_ABIERTA = 'prod-proyeccion-carga-abierta'
export const oyentesProyeccionAbierta = new Set<() => void>()
export function suscribirProyeccionAbierta(alCambiar: () => void) {
  oyentesProyeccionAbierta.add(alCambiar)
  window.addEventListener('storage', alCambiar)
  return () => { oyentesProyeccionAbierta.delete(alCambiar); window.removeEventListener('storage', alCambiar) }
}
export function leerProyeccionAbierta(): boolean {
  try { return localStorage.getItem(CLAVE_PROYECCION_ABIERTA) === '1' } catch { return false }
}
export function guardarProyeccionAbierta(v: boolean) {
  try { localStorage.setItem(CLAVE_PROYECCION_ABIERTA, v ? '1' : '0') } catch { /* modo privado */ }
  oyentesProyeccionAbierta.forEach(f => f())
}

/* ── Utilidades de formato ─────────────────────────────────────────────── */
export const MESES_CORTOS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
export const fNum = (n: number) => Math.round(n).toLocaleString('es-CL')
/** Dinero neto en pesos chilenos, completo ($1.234.567) y corto para ejes y tarjetas ($1,2 M / $450 mil). */
export const fPesos = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(Math.round(n)).toLocaleString('es-CL')}`
export const fPesosCorto = (n: number) => {
  const a = Math.abs(n), signo = n < 0 ? '−' : ''
  return a >= 1_000_000 ? `${signo}$${(a / 1_000_000).toFixed(1).replace('.', ',')} M` : a >= 1000 ? `${signo}$${Math.round(a / 1000)} mil` : `${signo}$${Math.round(a)}`
}

/** Cantidad de insumo en su unidad base (gr/ml) → texto legible, subiendo a
 *  kg/L cuando conviene (≥1000) — la base sigue siendo gr/ml para que el
 *  descuento de stock nunca mezcle unidades, esto es sólo de presentación. */
export function fCantidadInsumo(cantidad: number, unidadBase: 'gr' | 'ml'): string {
  const unidadGrande = unidadBase === 'gr' ? 'kg' : 'L'
  if (Math.abs(cantidad) >= 1000) return `${(cantidad / 1000).toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${unidadGrande}`
  return `${fNum(cantidad)} ${unidadBase}`
}

/** Orden fijo de formato — evita que un mismo producto se vea disperso al
 *  ordenar por otro criterio (Stock de Seguridad, calculadora de cobertura). */
export const ORDEN_ENVASE: EnvaseBucket[] = ['barril_30', 'barril_50', 'lata', 'otros']
export const ORDEN_FAMILIA: FamiliaEnvase[] = ['barril', 'lata']

/** Valor sentinela del selector de Producto en la Calculadora de Cobertura
 *  para la opción agregada "Todos los productos" (compras necesita el total
 *  de latas a comprar de todo el catálogo, no producto por producto). */
export const TODOS_PRODUCTOS = '__todos__'

/** Nombre de la unidad física de cada formato, para mostrar junto a los
 *  litros de disponible ("314 L · 888 latas"). */
export const UNIDAD_ENVASE: Record<EnvaseBucket, string> = {
  barril_30: 'barriles', barril_50: 'barriles', lata: 'latas', otros: 'unidades',
}

/** Litros ↔ unidades, para mostrar el stock de seguridad tanto en litros
 *  como en cantidad de envases (no sólo en litros, que no dice nada sobre
 *  "cuántas latas/barriles tengo que tener siempre"). Barril es exacto (el
 *  bucket ES 30L o 50L por definición — ver bucketEnvase en reglas.ts). Lata
 *  mezcla 354ml y 473ml (decisión 4-sep-2026), así que no hay un tamaño fijo:
 *  se estima el tamaño promedio real a partir del propio inventario físico
 *  (disponibleLitros / disponibleUnidades) en vez de asumir uno solo — null
 *  si no hay stock físico contado todavía para derivar el promedio. */
export function estimarUnidadesEnvase(
  envase: EnvaseBucket, litros: number, disponibleLitros: number | null, disponibleUnidades: number | null
): number | null {
  if (envase === 'barril_30') return Math.round(litros / 30)
  if (envase === 'barril_50') return Math.round(litros / 50)
  if (envase === 'lata' && disponibleLitros && disponibleUnidades) {
    const litrosPorLata = disponibleLitros / disponibleUnidades
    if (litrosPorLata > 0) return Math.round(litros / litrosPorLata)
  }
  return null
}

/** Color por formato — sólo para la barra apilada del Split de Envasado, donde
 *  hay que distinguir tres tramos de un mismo lote de un vistazo. */
export const COLOR_ENVASE: Record<EnvaseBucket, string> = {
  barril_30: '#D4AF37', barril_50: '#B8962E', lata: '#60A5FA', otros: '#8A8378',
}

/**
 * Costo de insumos de UNA cocción: escala la receta al litraje real y la
 * valoriza al último precio de compra de cada insumo (mismo escalado lineal
 * que usa el MRP — decisión del usuario, 7-sep-2026).
 *
 * `sinPrecio` cuenta las líneas de receta que quedaron FUERA del total por no
 * tener precio cargado. Es obligatorio mostrarlo junto al costo: un total al
 * que le faltan insumos no se puede leer como el costo real del lote.
 */
export function costoCoccion(producto: string, litros: number, recetaInsumos: RecetaInsumoLinea[]) {
  const lineas = recetaInsumos.filter(l => l.producto === producto)
  if (lineas.length === 0 || !(litros > 0)) {
    return { costo: null as number | null, sinPrecio: 0, lineasReceta: lineas.length }
  }
  let costo = 0
  let sinPrecio = 0
  for (const l of lineas) {
    if (l.precioUnitario == null) { sinPrecio++; continue }
    costo += l.cantidadPorLote * (litros / l.litrosBase) * l.precioUnitario
  }
  // Ninguna línea tenía precio: no hay costo que mostrar, ni siquiera $0.
  if (sinPrecio === lineas.length) return { costo: null as number | null, sinPrecio, lineasReceta: lineas.length }
  return { costo: Math.round(costo) as number | null, sinPrecio, lineasReceta: lineas.length }
}

/**
 * Qué fermentador conviene usar para una cocción de `litrosNecesarios`, de la
 * línea `categoria` (cerveza/kombucha — los tanques con código T son
 * exclusivos de cervecería y los K de kombuchería, decisión del usuario,
 * 14-sep-2026: ver la migración agregar_categoria_fermentadores).
 *
 * Sólo se ofrecen tanques VACÍOS: uno con fermentación en curso no se puede
 * compartir con una cocción nueva de otro lote, así que "tiene 200L libres
 * de 3.000L" no sirve para esto aunque sí sirva para el cálculo agregado de
 * % de ocupación de planta.
 *
 * Prioriza el tanque MÁS CHICO que alcance — no el más grande disponible —
 * para no ocupar un fermentador de 3.000L en una cocción de 300L y dejarlo
 * sin uso para la próxima cocción grande que sí lo necesite.
 */
export function recomendarFermentador(
  categoria: 'cerveza' | 'kombucha',
  litrosNecesarios: number,
  tanques: OcupacionPlanta['tanques'],
): { tanque: OcupacionPlanta['tanques'][number] | null; ajustado: boolean } {
  const vacios = tanques.filter(t => t.categoria === categoria && t.litros === 0)
  if (vacios.length === 0) return { tanque: null, ajustado: false }

  const queAlcanzan = vacios.filter(t => t.capacidadLitros >= litrosNecesarios).sort((a, b) => a.capacidadLitros - b.capacidadLitros)
  if (queAlcanzan.length > 0) return { tanque: queAlcanzan[0], ajustado: false }

  // Ningún vacío alcanza solo: se ofrece igual el más grande disponible —
  // mejor que no sugerir nada — pero marcado como "ajustado" para que quede
  // claro que no cubre el volumen completo (hay que cocer menos, partir en
  // dos lotes, o esperar a que se libere uno más grande).
  const masGrande = [...vacios].sort((a, b) => b.capacidadLitros - a.capacidadLitros)[0]
  return { tanque: masGrande, ajustado: true }
}

/** Fecha de HOY en yyyy-mm-dd, en huso HORARIO LOCAL del navegador — nunca
 *  `toISOString()`, que da la fecha en UTC y en Chile (UTC-3/-4) ya marca
 *  "mañana" desde media tarde, haciendo aparecer como atrasado un lote
 *  planificado para hoy mismo. */
export function hoyLocalISO(d: Date = new Date()): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/* Fechas y demanda proyectada: viven en el motor único (lib/produccion/cobertura.ts)
   y se re-exportan acá para no tener dos copias de la misma cuenta. */
export {
  sumarDiasCalISO, sumarDiasHabilesISO, restarDiasHabilesISO, diffDiasISO,
  demandaProyectadaConRangoEnPeriodo, demandaProyectadaEnPeriodo, vieneAltaDemanda,
  type DemandaConRango,
} from '@/lib/produccion/cobertura'
import { sumarDiasHabilesISO } from '@/lib/produccion/cobertura'

/** Singular o plural según la cantidad: `${n} ${pl(n, 'insumo', 'insumos')}`. */
export const pl = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios)

export function etiquetaMes(iso: string) {
  const [y, m] = iso.split('-').map(Number)
  return `${MESES_CORTOS[m - 1]} '${String(y).slice(2)}`
}
export function indiceMes(iso: string) {
  return Number(iso.split('-')[1]) - 1
}
/** "23 jul" a partir de yyyy-mm-dd — para mostrar el rango real de un ciclo
 *  interno (24→23) en el tooltip, y así no confundir el AÑO de la etiqueta
 *  del mes ("Ago '26") con un día del mes. */
export function fCicloCorto(iso: string) {
  const [, m, d] = iso.split('-').map(Number)
  return `${d} ${MESES_CORTOS[m - 1].toLowerCase()}`
}
/** "Camara General Barrios Bajos (Frío)" → "Camara General Barrios Bajos" —
 *  el ERP le agrega el tipo de depósito entre paréntesis a toda cámara, no
 *  aporta nada distinguir eso en la tabla de inventario. */
export function nombreCamaraCorto(camara: string) {
  return camara.replace(/\s*\([^)]*\)\s*$/, '').trim()
}
export function fMinutosDesde(min: number) {
  if (min < 1) return 'recién ahora'
  if (min < 60) return `hace ${min} min`
  const horas = Math.round(min / 60)
  if (horas < 24) return `hace ${horas} h`
  return `hace ${Math.round(horas / 24)} d`
}

/** Las seis preguntas que el módulo responde, en el orden en que se hacen
 *  de verdad en la planta: primero cuánto se va a vender, después cuánto hay
 *  que cocer, después cuándo, y al final qué comprar para poder hacerlo.
 *
 *  El `sub` no es decoración: es el criterio con el que se decidió qué va en
 *  cada pantalla. Antes "Stock de Seguridad" acumulaba siete secciones —el
 *  colchón, el calendario, la capacidad de planta y el presupuesto— bajo un
 *  nombre que describía sólo la primera, y había tres lugares distintos con
 *  números de compra. Si una sección no contesta la pregunta del `sub`, está
 *  en la pantalla equivocada. */
/** Encabezado de cada vista: la pregunta que contesta, en una línea. Es lo
 *  que evita que el módulo vuelva a convertirse en un montón de tarjetas sin
 *  jerarquía — cada pantalla declara para qué está. */
export function PreguntaDeLaVista({ pregunta, detalle }: { pregunta: string; detalle: string }) {
  return (
    // Barra verde a la izquierda en vez de una tarjeta blanca más entre
    // tarjetas blancas: el encabezado tiene que leerse como el título de la
    // pantalla, no como el primer dato. Con todo del mismo color, la pregunta
    // que da sentido a la vista se perdía entre los paneles de abajo.
    <div className="relative overflow-hidden rounded-xl border border-(--p-line) bg-(--p-card) p-4 pl-5 shadow-sm sm:p-5 sm:pl-6">
      <span className="absolute inset-y-0 left-0 w-1.5" style={{ backgroundColor: COLORS.primario }} />
      <h2 className="text-base font-bold tracking-tight text-(--p-text) sm:text-[19px]">{pregunta}</h2>
      <p className="mt-1 max-w-4xl text-sm leading-relaxed text-(--p-text-3)">{detalle}</p>
    </div>
  )
}

/** Alta manual de un lote al Plan Maestro. Estado propio (no vive en el
 *  padre) porque es puramente del formulario — se descarta al cerrar. */
export function FormNuevoLote({
  guardando, onCancelar, onGuardar,
}: {
  guardando: boolean
  onCancelar: () => void
  onGuardar: (datos: { producto: string; categoria: 'cerveza' | 'kombucha'; litrosPlanificados: number; fechaPlanificada: string; origen: 'manual' }) => void
}) {
  const [producto, setProducto] = useState('')
  const [categoria, setCategoria] = useState<'cerveza' | 'kombucha'>('cerveza')
  const [litros, setLitros] = useState('')
  const [fecha, setFecha] = useState(() => hoyLocalISO())

  const litrosNum = Number(litros)
  const valido = producto.trim().length > 0 && litrosNum > 0 && fecha.length > 0

  function submit() {
    if (!valido) return
    onGuardar({ producto: producto.trim(), categoria, litrosPlanificados: litrosNum, fechaPlanificada: fecha, origen: 'manual' })
    setProducto(''); setLitros('')
  }

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-(--p-line-2) bg-(--p-card-2)/70 p-5">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-(--p-text-3)">Producto</label>
        <input
          value={producto} onChange={e => setProducto(e.target.value)}
          placeholder="Ej: Doble IPA"
          className="w-48 rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-(--p-text-3)">Categoría</label>
        <select
          value={categoria} onChange={e => setCategoria(e.target.value as 'cerveza' | 'kombucha')}
          className="rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
        >
          <option value="cerveza">Cerveza</option>
          <option value="kombucha">Kombucha</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-(--p-text-3)">Litros</label>
        <input
          type="number" min={1} value={litros} onChange={e => setLitros(e.target.value)}
          placeholder="1000"
          className="w-28 rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-(--p-text-3)">Fecha planificada</label>
        <input
          type="date" value={fecha} onChange={e => setFecha(e.target.value)}
          className="rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
        />
      </div>
      <div className="flex gap-2">
        <button
          disabled={!valido || guardando}
          onClick={submit}
          className="rounded-lg prod-primario px-4 py-2 text-sm font-bold disabled:opacity-40"
        >
          {guardando ? 'Guardando…' : 'Agregar a la cola'}
        </button>
        <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-bold text-(--p-text-3) hover:bg-(--p-hover)">
          Cancelar
        </button>
      </div>
    </div>
  )
}

/**
 * Popup que se abre al confirmar una alarma de quiebre ("Agregar al plan").
 *
 * Por PRODUCTO, no por formato: así se cuece en la realidad — se manda un
 * lote con el litraje TOTAL, y recién cuando el fermentador está listo se
 * decide cuánto va a lata y cuánto a barril (eso lo resuelve el Split de
 * Envasado más abajo, no esta pantalla). Antes cada formato en alerta tenía
 * su propio botón "Agregar al plan", así que cubrir Imperial Stout en sus 3
 * formatos generaba 3 lotes separados — 3 cocciones donde en la práctica es
 * una sola (decisión del usuario, 11-sep-2026).
 *
 * No agrega con el total sugerido a ciegas: deja fijar fecha de inicio y
 * cantidad, y muestra en vivo cuánta necesidad cubre y hasta cuándo alcanza
 * cada formato — todo derivado del ritmo de venta real (mismo cálculo que
 * la alarma), para decidir la orden con criterio.
 */
export function ModalConfirmarLoteGrupo({
  grupo, guardando, recetaInsumos, onCancelar, onConfirmar,
}: {
  grupo: { producto: string; categoria: 'cerveza' | 'kombucha'; items: SugerenciaPlan[] }
  guardando: boolean
  recetaInsumos: RecetaInsumoLinea[]
  onCancelar: () => void
  onConfirmar: (datos: { litrosPlanificados: number; fechaPlanificada: string; necesidadCubrir: number; cubreHasta: string | null; motivo: string }) => void
}) {
  const totalSugerido = grupo.items.reduce((s, i) => s + i.litrosSugeridos, 0)
  // Propone el ÚLTIMO día para empezar a cocer del formato más apremiante del
  // grupo (quiebre − lead time), no una fecha arbitraria: antes era hoy+7 fijo
  // aunque el producto quebrara en 5 días o en 40. Si esa fecha ya pasó se
  // propone hoy, que es lo más temprano que se puede hacer algo.
  const [fecha, setFecha] = useState(() => {
    const hoy = hoyLocalISO()
    const limites = grupo.items.map(i => i.fechaLimiteInicio).filter((f): f is string => f != null)
    if (limites.length === 0) return hoy
    const masApremiante = limites.sort()[0]
    return masApremiante < hoy ? hoy : masApremiante
  })
  const hayAtrasado = grupo.items.some(i => i.atrasado)
  const [litros, setLitros] = useState(String(Math.round(totalSugerido)))

  const litrosNum = Number(litros)
  const valido = litrosNum > 0 && fecha.length > 0

  // Ritmo agregado de TODOS los formatos en alerta — para estimar hasta
  // cuándo alcanza el total combinado, no un formato aislado.
  const ritmoTotal = grupo.items.reduce((s, i) => s + i.ritmoDiarioActual, 0)
  const diasCobertura = ritmoTotal > 0 ? litrosNum / ritmoTotal : null
  const cubreHasta = diasCobertura != null ? sumarDiasHabilesISO(fecha, diasCobertura) : null

  // Cuánto sale cocinar esto: la receta escalada al litraje que se está por
  // confirmar, valorizada al último precio de compra de cada insumo.
  const costo = costoCoccion(grupo.producto, litrosNum, recetaInsumos)

  function submit() {
    if (!valido) return
    const motivo = grupo.items.length === 1
      ? grupo.items[0].motivo
      : `Cubre la necesidad combinada de ${grupo.items.length} formatos (${grupo.items.map(i => ENVASE_LABEL[i.envase] ?? i.envase).join(', ')}). El reparto por formato se decide en el Split de Envasado cuando el lote esté listo.`
    onConfirmar({ litrosPlanificados: litrosNum, fechaPlanificada: fecha, necesidadCubrir: totalSugerido, cubreHasta, motivo })
  }

  return (
    <div className="prod-scrim fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4" onClick={onCancelar}>
      <div className="prod-modal w-full max-w-md rounded-xl bg-(--p-card) p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="mb-4 flex items-center gap-3">
          <ProductImage nombre={grupo.producto} categoria={grupo.categoria} size={36} radius={9} />
          <div>
            <h3 className="font-bold text-(--p-text)">{grupo.producto}</h3>
            <p className="text-xs font-bold uppercase tracking-wide text-(--p-warn)">
              {grupo.items.length} {grupo.items.length === 1 ? 'formato en alerta' : 'formatos en alerta'}
            </p>
          </div>
          <button onClick={onCancelar} className="ml-auto rounded-lg p-1.5 text-(--p-text-3) hover:bg-(--p-hover) hover:text-(--p-text-2)">
            <X size={18} />
          </button>
        </div>

        {/* Desglose por formato — qué compone el total sugerido, aunque el
            lote que se va a crear es uno solo por el litraje combinado. */}
        <div className="mb-4 rounded-lg bg-(--p-warn-soft) p-3 text-sm text-(--p-warn)">
          <p className="font-semibold">Necesidad por formato:</p>
          <div className="mt-1.5 flex flex-col gap-1">
            {grupo.items.map((i, idx) => (
              <div key={`${i.envase}-${idx}`} className="flex items-center justify-between text-xs">
                <span>{ENVASE_LABEL[i.envase] ?? i.envase} — disponible {fNum(i.disponibleLitros)} L</span>
                <span className="font-bold">{fNum(i.litrosSugeridos)} L</span>
              </div>
            ))}
          </div>
          <p className="mt-2 border-t border-(--p-warn-line) pt-2">
            <strong>Total sugerido: {fNum(totalSugerido)} L</strong>, sumando todos los formatos en alerta.
          </p>
        </div>

        {hayAtrasado && (
          <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-(--p-bad-line) bg-(--p-bad-soft) p-3 text-sm text-(--p-bad)">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-(--p-bad)" />
            <p>
              <strong>Este lote ya va atrasado.</strong> Con el lead time de este producto, ni empezando
              hoy alcanza a estar listo antes del quiebre — igual conviene largarlo cuanto antes para
              acortar el tiempo sin stock.
            </p>
          </div>
        )}

        <div className="mb-4 flex gap-3">
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-semibold text-(--p-text-3)">Fecha de inicio de elaboración</label>
            <input
              type="date" value={fecha} onChange={e => setFecha(e.target.value)}
              className="rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-semibold text-(--p-text-3)">Cantidad total a producir (L)</label>
            <input
              type="number" min={1} value={litros} onChange={e => setLitros(e.target.value)}
              className="rounded-lg border border-(--p-line) px-3 py-2 text-sm focus:border-(--p-accent-line) focus:outline-none"
            />
          </div>
        </div>

        {/* Costo de la cocción — responde "¿cuánto me sale cocinar esto?" en
            vivo mientras se ajusta el litraje. */}
        {costo.lineasReceta > 0 && (
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-(--p-info-line) bg-(--p-info-soft) p-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-(--p-info)">Costo de insumos de esta cocción</p>
              {costo.sinPrecio > 0 && (
                <p className="mt-0.5 text-xs text-(--p-info)">
                  Parcial: {costo.sinPrecio} de {costo.lineasReceta} insumos de la receta sin precio cargado.
                </p>
              )}
            </div>
            {costo.costo != null ? (
              <div className="text-right">
                <p className="text-xl font-black tabular-nums text-(--p-info)">${fNum(costo.costo)}</p>
                {litrosNum > 0 && (
                  <p className="text-xs text-(--p-info)">${fNum(Math.round(costo.costo / litrosNum))} por litro</p>
                )}
              </div>
            ) : (
              <p className="text-sm font-semibold text-(--p-info)">Sin precios cargados</p>
            )}
          </div>
        )}

        {/* Cobertura — responde "hasta cuándo nos durará esto", en vivo según
            lo que el usuario haya puesto en Cantidad y Fecha de inicio. */}
        <div className="mb-5 rounded-lg border border-(--p-line) bg-(--p-card-2) p-3 text-sm">
          {ritmoTotal > 0 && diasCobertura != null && cubreHasta ? (
            <p className="text-(--p-text-2)">
              Con {fNum(litrosNum)} L, la cobertura combinada dura <strong>~{Math.round(diasCobertura)} días hábiles</strong> al
              ritmo actual — alcanzaría hasta el <strong>{new Date(cubreHasta + 'T00:00:00Z').toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' })}</strong>.
              El reparto exacto entre formatos se define después, en el Split de Envasado.
            </p>
          ) : (
            <p className="text-(--p-text-3)">Sin ventas en las últimas 4 semanas — no se puede estimar hasta cuándo alcanza.</p>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onCancelar} className="rounded-lg px-4 py-2 text-sm font-bold text-(--p-text-3) hover:bg-(--p-hover)">
            Cancelar
          </button>
          <button
            disabled={!valido || guardando}
            onClick={submit}
            className="prod-press prod-primario rounded-lg px-4 py-2 text-sm font-extrabold disabled:opacity-40"
          >
            {guardando ? 'Agregando…' : 'Confirmar y agregar al plan'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* ── Chip de desviación del modelo (MAPE del backtest) ──────────────────
   OJO, esto NO es una "confiabilidad" en el sentido de 0-100% siendo mejor
   arriba — es el error porcentual absoluto medio: mientras MÁS ALTO, PEOR el
   modelo. Se llamó "Confiabilidad" hasta que un usuario vio un "450%" y con
   razón le pareció absurdo ("¿cómo la confiabilidad supera el 100%?") — con
   el nombre correcto, un desvío de 450% es una afirmación coherente (aunque
   mala), no un número roto. Pasa fácil de 100% en series de bajo volumen
   (ej. 30L vendidos en el mes): ahí un error chico en litros absolutos ya es
   un porcentaje enorme. */
export function ChipDesviacion({ mape, derivado = false }: { mape: number | null; derivado?: boolean }) {
  if (mape == null) return <span className="text-xs text-(--p-text-4)">—</span>
  const color = mape < 15 ? 'emerald' : mape < 30 ? 'amber' : 'red'
  const clases = {
    emerald: 'border-(--p-ok-line) bg-(--p-ok-soft) text-(--p-ok)',
    amber: 'border-(--p-warn-line) bg-(--p-warn-soft) text-(--p-warn)',
    red: 'border-(--p-bad-line) bg-(--p-bad-soft) text-(--p-bad)',
  }[color]
  return (
    <span
      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-bold ${clases}`}
      title={
        derivado
          ? 'Desvío del PRODUCTO (no de este formato puntual): esta fila se derivó del forecast del producto, y escalar una serie por una proporción constante no cambia su error porcentual, así que se reutiliza el mismo MAPE.'
          : 'Desvío del modelo (MAPE): error porcentual promedio comparando la proyección contra la venta real de los últimos 3 meses. Más alto es peor. En series de bajo volumen puede superar el 100% — un error chico en litros ya es un % grande.'
      }
    >
      {mape.toFixed(0)}%
    </span>
  )
}

