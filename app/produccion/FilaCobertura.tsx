'use client'

/**
 * Una fila de "hasta cuándo alcanza" un producto, sobre el mismo eje de tiempo
 * que las cocciones del Gantt.
 *
 * Es lo que permite decidir sin cruzar fechas a mano: la barra cambia de color
 * cuando el stock entra al colchón, se corta el día que llega a cero, y los
 * rombos marcan cuándo queda LISTO cada lote de ese producto. Un rombo rojo a
 * la derecha de la marca roja es exactamente el caso que hay que resolver —
 * adelantar esa cocción, o sacarle el tanque a otro producto que aguanta más.
 *
 * La barra NO es de un solo color. Tiene tres estados, y el umbral entre ellos
 * no es un porcentaje redondo sino el stock de seguridad que el propio modelo
 * calculó para ese producto:
 *
 *   · color del producto  — sobra. Alcanza para más que el colchón.
 *   · ámbar               — está comiéndose el colchón. Todavía hay stock,
 *                           pero ya se entró al margen que existe justamente
 *                           para absorber un atraso. Acá es donde hay que
 *                           decidir, no cuando la barra se corta.
 *   · rayado rojo         — cero. No hay qué vender.
 *
 * Y un cuarto estado, más claro y más delgado: el tramo RESCATADO. Es el stock
 * que existe sólo porque hay un lote agendado que llega después del primer
 * quiebre. Se dibuja distinto a propósito — es una proyección que depende de
 * que esa cocción efectivamente salga, no stock que ya está en la cámara.
 *
 * Vive en su propio archivo y no dentro de GanttProduccion.tsx porque ese
 * archivo ya pasa las 800 líneas y esto es una pieza con su propia lógica de
 * dibujo.
 */

import { FAMILIA_LABEL, FAMILIA_AYUDA, type FamiliaEnvase } from '@/lib/produccion/reglas'

export type NivelCobertura = 'ok' | 'bajo' | 'cero'

export interface TramoCobertura {
  desde: string
  /** Exclusivo: el tramo cubre [desde, hasta). */
  hasta: string
  nivel: NivelCobertura
  /** El tramo existe sólo porque llega un lote DESPUÉS del primer quiebre. */
  rescatado: boolean
}

export interface CoberturaProducto {
  producto: string
  stockActual: number
  /** Día en que el stock llega a cero. Null = alcanza para todo el horizonte. */
  agota: string | null
  /** Cuándo queda listo cada lote de este producto, con sus litros. */
  llegadas: { fecha: string; litros: number }[]
  /** Primera llegada DESPUÉS del quiebre: la que habría que adelantar. */
  rescate: { fecha: string; litros: number } | null
  diasEnCero: number
  /** La trayectoria completa del stock, ya cortada en tramos de un color. */
  tramos: TramoCobertura[]
  /** Litros/día que se venden este mes — venta real de las últimas 4
   *  semanas, no forecast (ver ProduccionClient.tsx: necesidadGantt). */
  velocidad: number
  /** Días de inventario: cuánto dura lo que hay HOY en cámara, sin contar
   *  ningún lote por llegar. Es distinto de `agota`, que sí los cuenta — ver
   *  los dos juntos es lo que dice "aguanta poco, pero viene algo". */
  doi: number | null
  /** Colchón en litros bajo el cual la barra pasa a ámbar. */
  colchon: number
  /** true = este producto no tiene stock de seguridad calculado todavía, y
   *  el colchón de arriba es el respaldo (7 días de venta) — no el número
   *  con σ y nivel de servicio detrás. Se muestra distinto para no hacerlo
   *  pasar por un dato tan firme como el real. */
  colchonEstimado: boolean
  /** Estado de HOY por familia de envase — foto, no proyección. Ver el
   *  comentario en NecesidadProducto (GanttProduccion.tsx). */
  familias: { familia: FamiliaEnvase; stockActual: number; colchon: number }[]
}

const MS_DIA = 86_400_000
const COLOR_BAJO = '#F59E0B'
const COLOR_CERO = '#DC2626'
/** Cuánto se aclara un tramo rescatado: 0 = igual, 1 = blanco. */
const ACLARADO_RESCATE = 0.55
/** Tope de días de rayado cuando el quiebre no tiene lote después. Sin tope,
 *  un producto sin nada agendado pinta de rojo el último tercio de la grilla
 *  —tres meses— y eso no informa nada: no es un agujero que se pueda cerrar
 *  moviendo una cocción, es que el plan no llega hasta allá. La marca roja con
 *  la fecha ya lo dice. */
const MAX_DIAS_RAYADO_ABIERTO = 14

/** Mezcla el color hacia el blanco.
 *
 *  Se aclara el color en vez de bajarle la opacidad porque la opacidad NO
 *  sobrevive: `.prod-gantt-bloque` trae una animación de entrada con
 *  `fill-mode: both` que termina en `opacity: 1`, y una animación gana contra
 *  un estilo inline (está en un origen de cascada superior). El resultado era
 *  un tramo rescatado idéntico a uno real. Aclarar el color lo deja fuera de
 *  esa pelea y además es literalmente lo que se quería: un color más claro. */
function aclarar(hex: string, factor: number) {
  const n = parseInt(hex.slice(1), 16)
  const mezcla = (c: number) => Math.round(c + (255 - c) * factor)
  const r = mezcla((n >> 16) & 255)
  const g = mezcla((n >> 8) & 255)
  const b = mezcla(n & 255)
  return `rgb(${r}, ${g}, ${b})`
}

function isoADate(iso: string) {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}
function diffDias(desdeISO: string, hastaISO: string) {
  return Math.round((isoADate(hastaISO).getTime() - isoADate(desdeISO).getTime()) / MS_DIA)
}
function fLitros(n: number) {
  return n >= 10000 ? `${(n / 1000).toFixed(1).replace('.', ',')}k` : Math.round(n).toLocaleString('es-CL')
}
/** El ritmo con un decimal cuando es chico: "0 L/día" en un producto que sí se
 *  vende es peor que no mostrar nada. */
function fRitmo(n: number) {
  if (n <= 0) return '0'
  return n < 10 ? n.toFixed(1).replace('.', ',') : Math.round(n).toLocaleString('es-CL')
}
function diaMes(iso: string) {
  return new Date(iso + 'T00:00:00Z')
    .toLocaleDateString('es-CL', { day: '2-digit', month: 'short', timeZone: 'UTC' })
    .replace('.', '')
}

export default function FilaCobertura({
  cobertura: c, dias, anchoDia, altoFila, tamEtiqueta, hoy, color, fila, anchoEtiqueta,
}: {
  cobertura: CoberturaProducto
  dias: { iso: string; finde: boolean; esHoy: boolean }[]
  anchoDia: number
  altoFila: number
  tamEtiqueta: number
  hoy: string
  color: string
  fila: number
  anchoEtiqueta: number
}) {
  const inicio = dias[0]?.iso ?? hoy
  const desdeHoy = Math.max(0, diffDias(inicio, hoy))
  const hasta = c.agota ? diffDias(inicio, c.agota) : dias.length
  const ejeY = altoFila / 2

  /** Quiebre cruzado: el stock se acaba ANTES de que llegue el lote que venía
   *  a reponerlo. No es lo mismo que "se agota" — acá hay una cocción
   *  agendada, sólo que tarde, y eso se arregla moviéndola, no agregando
   *  otra. */
  const cruzado = !!c.agota && !!c.rescate && c.diasEnCero > 0

  return (
    <div className="prod-gantt-fila flex border-b border-gray-100 hover:bg-gray-50/40"
      style={{ ['--fila' as string]: fila }}>

      <div style={{ width: anchoEtiqueta, flexShrink: 0, height: altoFila }}
        className="sticky left-0 z-10 flex items-center gap-2 border-r border-gray-100 bg-white px-3">

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
            <span className="truncate font-bold text-gray-800" style={{ fontSize: tamEtiqueta + 1 }}
              title={`${c.producto} · ${Math.round(c.stockActual).toLocaleString('es-CL')} L en cámara hoy`}>
              {c.producto}
            </span>
          </div>

          {/* Velocidad y días de inventario. Los dos juntos, porque por separado
              engañan: 40 L/día no dice nada sin saber cuánto hay, y "8 días" no
              dice si eso es mucho o poco para este producto. */}
          <div className="flex items-center gap-1.5 tabular-nums text-gray-400"
            style={{ fontSize: Math.max(tamEtiqueta - 2, 8) }}>
            <span title={`Se venden ${fRitmo(c.velocidad)} litros por día de ${c.producto} — venta real de las últimas 4 semanas para este mes, forecast para los meses siguientes de la proyección`}>
              {fRitmo(c.velocidad)} L/día
            </span>
            {c.doi != null && (
              <>
                <span className="text-gray-300">·</span>
                <span
                  className={c.doi <= 7 ? 'font-bold text-red-500' : c.doi <= 21 ? 'font-bold text-amber-600' : ''}
                  title={`Días de inventario: lo que hay hoy en cámara alcanza ${c.doi} días a este ritmo, sin contar ningún lote por llegar`}>
                  DOI {c.doi} d
                </span>
              </>
            )}
          </div>
        </div>

        {/* Stock de HOY contra su colchón, partido en barril y lata. Un pedido
            de barril no se sirve con latas, así que el número del producto
            entero —que los promedia— puede mostrar verde con un formato en
            cero. Los dos tamaños de barril ya vienen sumados de necesidadGantt:
            son intercambiables entre sí (ver familiaEnvase en reglas.ts).

            Se cae al total del producto sólo si el forecast todavía no calculó
            el stock de seguridad por formato para este producto. */}
        {c.familias.length > 0 ? (
          <div className="flex shrink-0 flex-col items-end justify-center gap-px tabular-nums"
            style={{ fontSize: Math.max(tamEtiqueta - 2, 8) }}>
            {c.familias.map(f => {
              const falta = f.stockActual < f.colchon
              const enCero = f.stockActual <= 0
              return (
                <span key={f.familia}
                  className={enCero ? 'font-bold text-red-600' : falta ? 'font-bold text-amber-600' : 'text-gray-400'}
                  title={`${FAMILIA_LABEL[f.familia]}: ${fLitros(f.stockActual)} L en cámara hoy contra un colchón de ${fLitros(f.colchon)} L. `
                    + (enCero ? 'Sin stock de este formato. ' : falta ? `Faltan ${fLitros(f.colchon - f.stockActual)} L para el colchón. ` : 'Sobre el colchón. ')
                    + FAMILIA_AYUDA[f.familia]}>
                  <span className="mr-0.5 font-normal text-gray-300">{FAMILIA_LABEL[f.familia][0]}</span>
                  {fLitros(f.stockActual)}
                  <span className="font-normal text-gray-300">/</span>
                  {fLitros(f.colchon)}
                </span>
              )
            })}
          </div>
        ) : (
          <span className="shrink-0 tabular-nums text-gray-400" style={{ fontSize: tamEtiqueta - 1 }}
            title={c.colchonEstimado
              ? `Colchón: sin stock de seguridad calculado todavía para este producto — se usa un respaldo de 7 días de venta (${fLitros(c.colchon)} L)`
              : `Colchón: ${fLitros(c.colchon)} L — el stock de seguridad calculado para este producto (con su σ y nivel de servicio). Por debajo de esto la barra pasa a ámbar.`}>
            {fLitros(c.stockActual)}
            <span className="text-gray-300"> / </span>
            <span className={c.colchonEstimado ? 'italic text-gray-300' : 'text-gray-400'}>
              {c.colchonEstimado && '~'}{fLitros(c.colchon)}
            </span>
          </span>
        )}
      </div>

      <div className="relative" style={{ width: dias.length * anchoDia, flexShrink: 0, height: altoFila }}>
        <div className="absolute inset-0 flex">
          {dias.map(d => (
            <div key={d.iso} style={{ width: anchoDia, flexShrink: 0 }}
              className={`border-l ${
                d.esHoy ? 'border-[#C9A227] bg-[#C9A227]/10'
                  : d.finde ? 'border-gray-200 bg-gray-200/70' : 'border-gray-100'
              }`} />
          ))}
        </div>

        {/* La barra, tramo a tramo. Cada uno es un estado del stock, así que el
            punto donde cambia de color es el dato: ahí entra al colchón. */}
        {c.tramos.map(t => {
          const x0 = Math.max(diffDias(inicio, t.desde), desdeHoy)
          const x1 = Math.min(diffDias(inicio, t.hasta), dias.length)
          if (x1 <= x0) return null

          if (t.nivel === 'cero') {
            const largo = x1 - x0
            // Un tramo que muere en el borde de la grilla no tiene lote
            // después: es un quiebre abierto, no un agujero medible.
            const abierto = x1 >= dias.length
            const dibujado = abierto ? Math.min(largo, MAX_DIAS_RAYADO_ABIERTO) : largo
            return (
              <div key={`${t.desde}-cero`} className="absolute"
                style={{
                  left: x0 * anchoDia,
                  width: Math.max(dibujado * anchoDia, 2),
                  top: ejeY - 5,
                  height: 10,
                  background: `repeating-linear-gradient(45deg, ${COLOR_CERO}33 0 4px, transparent 4px 8px)`,
                  borderTop: `1px solid ${COLOR_CERO}55`,
                  borderBottom: `1px solid ${COLOR_CERO}55`,
                  // El rayado abierto se desvanece: no termina ahí, sólo deja
                  // de dibujarse porque seguir no agrega nada.
                  ...(abierto && largo > dibujado
                    ? { maskImage: 'linear-gradient(90deg, #000 55%, transparent 100%)' }
                    : {}),
                }}
                title={abierto
                  ? `Sin stock desde el ${diaMes(t.desde)} y sin ninguna cocción agendada después`
                  : `${largo} ${largo === 1 ? 'día' : 'días'} sin stock, desde el ${diaMes(t.desde)}`} />
            )
          }

          const base = t.nivel === 'bajo' ? COLOR_BAJO : color
          return (
            <div key={`${t.desde}-${t.nivel}`} className="prod-gantt-bloque absolute"
              style={{
                left: x0 * anchoDia,
                width: (x1 - x0) * anchoDia,
                top: ejeY - (t.rescatado ? 3 : 4),
                height: t.rescatado ? 6 : 8,
                background: t.rescatado ? aclarar(base, ACLARADO_RESCATE) : base,
                borderRadius: 2,
              }}
              title={
                (t.rescatado ? 'Sólo gracias a un lote agendado: ' : '') +
                (t.nivel === 'bajo'
                  ? `bajo el colchón de ${fLitros(c.colchon)} L desde el ${diaMes(t.desde)}`
                  : `stock holgado hasta el ${diaMes(t.hasta)}`)
              } />
          )
        })}

        {/* Marca del primer quiebre. Es la fecha que manda: lo que venga
            después ya es "y además". */}
        {c.agota && (
          <div className="absolute flex items-center"
            style={{ left: hasta * anchoDia - 1, top: 0, height: '100%' }}>
            <span className="h-full w-0.5 bg-red-600" />
            <span className="ml-1 flex items-center gap-0.5 whitespace-nowrap rounded bg-red-600 px-1 font-bold text-white"
              style={{ fontSize: tamEtiqueta - 1 }}
              title={cruzado
                ? `Quiebre cruzado: el stock se acaba el ${c.agota} y el lote que venía a reponerlo recién queda listo el ${c.rescate!.fecha}. Son ${c.diasEnCero} días en cero — adelantá esa cocción.`
                : `Alcanza hasta el ${c.agota}. No hay ningún lote agendado después.`}>
              {diaMes(c.agota)}
              {cruzado && <span className="opacity-80">⤫{c.diasEnCero}d</span>}
            </span>
          </div>
        )}

        {/* Rombos: cuándo queda LISTO cada lote. Rojo = llega después del
            quiebre, o sea que hay que adelantarlo o cederle el tanque. */}
        {c.llegadas.map(l => {
          const x = diffDias(inicio, l.fecha)
          if (x < 0 || x > dias.length) return null
          const tarde = !!c.agota && l.fecha > c.agota
          return (
            <span key={l.fecha}
              title={`Llegan ${Math.round(l.litros).toLocaleString('es-CL')} L el ${l.fecha}${tarde ? ' — después del quiebre' : ''}`}
              className="absolute"
              style={{
                left: x * anchoDia - 4, top: ejeY - 4,
                width: 8, height: 8, transform: 'rotate(45deg)',
                background: tarde ? COLOR_CERO : '#ffffff',
                border: `2px solid ${tarde ? COLOR_CERO : color}`,
              }} />
          )
        })}
      </div>
    </div>
  )
}
