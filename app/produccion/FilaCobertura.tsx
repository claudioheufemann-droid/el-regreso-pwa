'use client'

/**
 * Una fila de "hasta cuándo alcanza" un producto, sobre el mismo eje de tiempo
 * que las cocciones del Gantt.
 *
 * Es lo que permite decidir sin cruzar fechas a mano: la barra se corta el día
 * que el stock llega a cero, y los rombos marcan cuándo queda LISTO cada lote
 * de ese producto. Un rombo rojo a la derecha de la marca roja es exactamente
 * el caso que hay que resolver — adelantar esa cocción, o sacarle el tanque a
 * otro producto que aguanta más.
 *
 * Vive en su propio archivo y no dentro de GanttProduccion.tsx porque ese
 * archivo ya pasa las 600 líneas y esto es una pieza con su propia lógica de
 * dibujo.
 */

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
}

const MS_DIA = 86_400_000

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
  // Sin fecha de quiebre la barra llega al final de la grilla: que alcance
  // para todo el horizonte es una respuesta, no un dato que falta.
  const hasta = c.agota ? diffDias(inicio, c.agota) : dias.length
  const ancho = Math.max(0, hasta - desdeHoy) * anchoDia

  return (
    <div className="prod-gantt-fila flex border-b border-gray-100 hover:bg-gray-50/40"
      style={{ ['--fila' as string]: fila }}>

      <div style={{ width: anchoEtiqueta, flexShrink: 0, height: altoFila }}
        className="sticky left-0 z-10 flex items-center gap-1.5 border-r border-gray-100 bg-white px-3"
        title={`${c.producto} · ${Math.round(c.stockActual).toLocaleString('es-CL')} L en cámara hoy`}>
        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: color }} />
        <span className="truncate font-bold text-gray-800" style={{ fontSize: tamEtiqueta + 1 }}>
          {c.producto}
        </span>
        <span className="ml-auto shrink-0 tabular-nums text-gray-400" style={{ fontSize: tamEtiqueta - 1 }}>
          {fLitros(c.stockActual)}
        </span>
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

        {/* La barra se desvanece hacia el final: es una proyección, y un borde
            duro se leería como una fecha comprometida. */}
        {ancho > 0 && (
          <div
            className="prod-gantt-bloque absolute rounded-sm"
            title={c.agota
              ? `Alcanza hasta el ${c.agota}${c.rescate ? ` · el próximo lote llega el ${c.rescate.fecha}` : ' · no hay ningún lote agendado después'}`
              : 'Alcanza para todo el horizonte proyectado'}
            style={{
              left: desdeHoy * anchoDia,
              width: ancho,
              top: altoFila / 2 - 4,
              height: 8,
              background: `linear-gradient(90deg, ${color} 70%, ${color}33 100%)`,
            }}
          />
        )}

        {/* Franja de quiebre: los días que el producto pasaría en cero. */}
        {c.agota && c.rescate && (
          <div className="absolute"
            style={{
              left: hasta * anchoDia,
              width: Math.max(diffDias(c.agota, c.rescate.fecha) * anchoDia, 2),
              top: altoFila / 2 - 5,
              height: 10,
              background: 'repeating-linear-gradient(45deg, #DC262633 0 4px, transparent 4px 8px)',
              borderTop: '1px solid #DC262655',
              borderBottom: '1px solid #DC262655',
            }}
            title={`${c.diasEnCero} días sin stock antes de que llegue el próximo lote`} />
        )}

        {c.agota && (
          <div className="absolute flex items-center"
            style={{ left: hasta * anchoDia - 1, top: 0, height: '100%' }}>
            <span className="h-full w-0.5 bg-red-600" />
            <span className="ml-1 whitespace-nowrap rounded bg-red-600 px-1 font-bold text-white"
              style={{ fontSize: tamEtiqueta - 1 }}>
              {diaMes(c.agota)}
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
                left: x * anchoDia - 4, top: altoFila / 2 - 4,
                width: 8, height: 8, transform: 'rotate(45deg)',
                background: tarde ? '#DC2626' : '#ffffff',
                border: `2px solid ${tarde ? '#DC2626' : color}`,
              }} />
          )
        })}
      </div>
    </div>
  )
}
