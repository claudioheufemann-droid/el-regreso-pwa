import type { BloqueGantt, ConfigProducto, FermentadorGantt } from '@/app/produccion/GanttProduccion'
import type { SerieForecast, StockSeguridadItem, LotePlan } from '@/app/produccion/page'

/**
 * Datos inventados para el banco de pruebas. Nada de acá sale a producción ni
 * toca la base: es para poder mirar los componentes en estados que con datos
 * reales no se pueden provocar a pedido.
 *
 * Los tanques sí son los de verdad (nombres y capacidades), porque el layout
 * depende de cuántas filas hay y de cuán largos son los nombres — probar con
 * "Tanque 1" cuando en la realidad dice "Fermentador T13 (1700 L)" escondería
 * justo los problemas de espacio que hay que ver.
 */

const hoy = new Date()
const iso = (d: Date) => d.toISOString().slice(0, 10)
export const HOY = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`
const masDias = (n: number) => iso(new Date(Date.parse(`${HOY}T00:00:00Z`) + n * 86400000))
const mesDesde = (n: number) => {
  const d = new Date(Date.UTC(hoy.getFullYear(), hoy.getMonth() + n, 1))
  return d.toISOString().slice(0, 10)
}

export const FERMENTADORES: FermentadorGantt[] = [
  { nombre: 'Fermentador T1', tipo: 'Fermentador Inox', categoria: 'cerveza', capacidadLitros: 1500, litrosActuales: 0 },
  { nombre: 'Fermentador T2', tipo: 'Unitank Inox', categoria: 'cerveza', capacidadLitros: 1700, litrosActuales: 1700 },
  { nombre: 'Fermentador T3', tipo: 'Fermentador Inox', categoria: 'cerveza', capacidadLitros: 1500, litrosActuales: 0 },
  { nombre: 'Bright tank T4', tipo: 'Fermentador Inox', categoria: 'cerveza', capacidadLitros: 3000, litrosActuales: 0 },
  { nombre: 'Fermentador T5', tipo: 'Fermentador Inox', categoria: 'cerveza', capacidadLitros: 3000, litrosActuales: 2400 },
  { nombre: 'Fermentador T6', tipo: 'Fermentador Inox', categoria: 'cerveza', capacidadLitros: 3200, litrosActuales: 0 },
  { nombre: 'Fermentador T9', tipo: 'Fermentador Inox', categoria: 'cerveza', capacidadLitros: 1500, litrosActuales: 0 },
  { nombre: 'Fermentador T10', tipo: 'Unitank Inox', categoria: 'cerveza', capacidadLitros: 450, litrosActuales: 0 },
  { nombre: 'Fermentador T13', tipo: 'Unitank Inox', categoria: 'cerveza', capacidadLitros: 1700, litrosActuales: 0 },
  { nombre: 'Lavoratorio T1', tipo: 'Madurador Inox', categoria: 'cerveza', capacidadLitros: 150, litrosActuales: 0 },
  { nombre: 'Fermentador K-1', tipo: 'Fermentador Inox', categoria: 'kombucha', capacidadLitros: 2000, litrosActuales: 2000 },
  { nombre: 'Fermentador K-2', tipo: 'Unitank Inox', categoria: 'kombucha', capacidadLitros: 2000, litrosActuales: 0 },
  { nombre: 'Fermentador K-3', tipo: 'Unitank Inox', categoria: 'kombucha', capacidadLitros: 1200, litrosActuales: 0 },
  { nombre: 'Fermentador K-4', tipo: 'Unitank Inox', categoria: 'kombucha', capacidadLitros: 1200, litrosActuales: 0 },
  { nombre: 'Fermentador K-6', tipo: 'Unitank Inox', categoria: 'kombucha', capacidadLitros: 1300, litrosActuales: 0 },
]

export const CONFIG: ConfigProducto[] = [
  { producto: 'Mocho English', categoria: 'cerveza', diasFermentacion: 24, litrosObjetivo: 1500, color: '#B5502A' },
  { producto: 'Red IPA', categoria: 'cerveza', diasFermentacion: 24, litrosObjetivo: 3000, color: '#3A6EA5' },
  { producto: 'Ámbar Lager', categoria: 'cerveza', diasFermentacion: 28, litrosObjetivo: 3000, color: '#2F7A55' },
  { producto: 'Aguas Blancas', categoria: 'cerveza', diasFermentacion: 21, litrosObjetivo: 1700, color: '#8B5E3C' },
  { producto: 'La Barra APA', categoria: 'cerveza', diasFermentacion: 24, litrosObjetivo: 1500, color: '#7D5BA6' },
  { producto: 'Kombucha Berry Menta', categoria: 'kombucha', diasFermentacion: 12, litrosObjetivo: 2000, color: '#A34E6B' },
  { producto: 'Kombucha Detox', categoria: 'kombucha', diasFermentacion: 12, litrosObjetivo: 1200, color: '#5C8A3A' },
  { producto: 'Kombucha Maracuyá Cardamomo', categoria: 'kombucha', diasFermentacion: 14, litrosObjetivo: 1200, color: '#C08A2E' },
]

/** Escenarios: cada uno aísla un estado que hay que poder mirar. */
export type Escenario = 'normal' | 'choques' | 'noCabe' | 'sinAsignar' | 'saturado' | 'vacio'

export const ESCENARIOS: { id: Escenario; label: string; pista: string }[] = [
  { id: 'normal', label: 'Normal', pista: 'Un plan corriente, con confirmados y sugeridos.' },
  { id: 'choques', label: 'Choques de tanque', pista: 'Dos cocciones pisándose: las dos deben marcarse en rojo y latir.' },
  { id: 'noCabe', label: 'No cabe en el tanque', pista: 'Litraje mayor que la capacidad: borde rojo y aviso.' },
  { id: 'sinAsignar', label: 'Sin tanque', pista: 'Bloques sueltos: deben aparecer en la fila ámbar, no desaparecer.' },
  { id: 'saturado', label: 'Planta saturada', pista: 'Todos los tanques ocupados, para ver densidad y scroll.' },
  { id: 'vacio', label: 'Sin cocciones', pista: 'Estado vacío: la grilla debe leerse igual.' },
]

export function bloquesDe(escenario: Escenario): BloqueGantt[] {
  const base = (over: Partial<BloqueGantt> & Pick<BloqueGantt, 'id' | 'producto' | 'categoria' | 'litros' | 'inicioISO' | 'dias'>): BloqueGantt => ({
    tipo: 'confirmado', fermentador: null, ...over,
  })

  switch (escenario) {
    case 'vacio':
      return []

    case 'choques':
      return [
        base({ id: 'c1', producto: 'Red IPA', categoria: 'cerveza', litros: 1500, inicioISO: masDias(1), dias: 24, fermentador: 'Fermentador T1' }),
        // Arranca dentro de la ventana del anterior, mismo tanque.
        base({ id: 'c2', producto: 'Mocho English', categoria: 'cerveza', litros: 1400, inicioISO: masDias(10), dias: 24, fermentador: 'Fermentador T1' }),
        base({ id: 'c3', producto: 'Kombucha Detox', categoria: 'kombucha', litros: 1200, inicioISO: masDias(3), dias: 12, fermentador: 'Fermentador K-3' }),
        base({ id: 'c4', producto: 'Kombucha Berry Menta', categoria: 'kombucha', litros: 1200, inicioISO: masDias(8), dias: 12, fermentador: 'Fermentador K-3' }),
      ]

    case 'noCabe':
      return [
        // 3.000 L en un tanque de 1.500.
        base({ id: 'n1', producto: 'Ámbar Lager', categoria: 'cerveza', litros: 3000, inicioISO: masDias(2), dias: 28, fermentador: 'Fermentador T1' }),
        base({ id: 'n2', producto: 'Kombucha Detox', categoria: 'kombucha', litros: 2600, inicioISO: masDias(4), dias: 12, fermentador: 'Fermentador K-3' }),
        base({ id: 'n3', producto: 'La Barra APA', categoria: 'cerveza', litros: 1500, inicioISO: masDias(5), dias: 24, fermentador: 'Fermentador T3' }),
      ]

    case 'sinAsignar':
      return [
        base({ id: 's1', producto: 'Red IPA', categoria: 'cerveza', litros: 1500, inicioISO: masDias(2), dias: 24 }),
        base({ id: 's2', producto: 'Kombucha Detox', categoria: 'kombucha', litros: 1200, inicioISO: masDias(6), dias: 12, tipo: 'sugerido' }),
        base({ id: 's3', producto: 'Mocho English', categoria: 'cerveza', litros: 1400, inicioISO: masDias(1), dias: 24, fermentador: 'Fermentador T3' }),
      ]

    case 'saturado': {
      const out: BloqueGantt[] = []
      FERMENTADORES.forEach((f, i) => {
        const cfg = CONFIG.filter(c => c.categoria === f.categoria)
        const c = cfg[i % cfg.length]
        out.push(base({
          id: `sat-${f.nombre}`, producto: c.producto, categoria: f.categoria,
          litros: Math.min(f.capacidadLitros, c.litrosObjetivo ?? f.capacidadLitros),
          inicioISO: masDias((i % 5) - 1), dias: c.diasFermentacion, fermentador: f.nombre,
          tipo: i % 3 === 0 ? 'sugerido' : 'confirmado',
        }))
      })
      return out
    }

    default:
      return [
        base({ id: 'b1', producto: 'Red IPA', categoria: 'cerveza', litros: 3000, inicioISO: masDias(-2), dias: 24, fermentador: 'Fermentador T6' }),
        base({ id: 'b2', producto: 'Mocho English', categoria: 'cerveza', litros: 1500, inicioISO: masDias(3), dias: 24, fermentador: 'Fermentador T1' }),
        base({ id: 'b3', producto: 'Aguas Blancas', categoria: 'cerveza', litros: 1700, inicioISO: masDias(9), dias: 21, fermentador: 'Fermentador T13', tipo: 'sugerido' }),
        base({ id: 'b4', producto: 'La Barra APA', categoria: 'cerveza', litros: 1500, inicioISO: masDias(28), dias: 24, fermentador: 'Fermentador T3', tipo: 'sugerido' }),
        base({ id: 'b5', producto: 'Kombucha Berry Menta', categoria: 'kombucha', litros: 2000, inicioISO: masDias(1), dias: 12, fermentador: 'Fermentador K-2' }),
        base({ id: 'b6', producto: 'Kombucha Detox', categoria: 'kombucha', litros: 1200, inicioISO: masDias(15), dias: 12, fermentador: 'Fermentador K-3', tipo: 'sugerido' }),
        base({ id: 'b7', producto: 'Kombucha Maracuyá Cardamomo', categoria: 'kombucha', litros: 1200, inicioISO: masDias(20), dias: 14, fermentador: 'Fermentador K-4', tipo: 'sugerido' }),
        // Uno que arranca antes de la ventana: prueba el recorte izquierdo.
        base({ id: 'b8', producto: 'Ámbar Lager', categoria: 'cerveza', litros: 2400, inicioISO: masDias(-18), dias: 28, fermentador: 'Fermentador T5' }),
      ]
  }
}

/* ── Datos para la tabla de necesidad mensual ─────────────────────────── */

export const SERIES: SerieForecast[] = CONFIG.map((c, i) => {
  const nivelBase = 900 + i * 260
  return {
    id: `s-${i}`,
    nivel: 'producto',
    clave: c.producto,
    label: c.producto,
    producto: c.producto,
    envaseBucket: null,
    categoria: c.categoria,
    puntos: Array.from({ length: 6 }, (_, m) => {
      const litros = Math.round(nivelBase * (1 + 0.06 * m))
      return {
        mes: mesDesde(m),
        tipo: 'forecast' as const,
        litros,
        // Banda del ±25%, que es el orden de magnitud real del modelo.
        litrosMin: Math.round(litros * 0.75),
        litrosMax: Math.round(litros * 1.26),
        tendencia: litros * 0.9,
        estacionalidad: litros * 0.1,
      }
    }),
    mae: 180,
    mape: 18 + i * 3,
    mesesHistorial: 30,
    metodo: 'propio',
    litrosMesEnCurso: Math.round(nivelBase * 0.4),
  }
})

export const STOCK_SEGURIDAD: StockSeguridadItem[] = CONFIG.map((c, i) => ({
  nivel: 'producto',
  producto: c.producto,
  envase: null,
  categoria: c.categoria,
  mes: mesDesde(0),
  leadTimeSemanas: c.categoria === 'cerveza' ? 4 : 3,
  periodoRevisionSemanas: 4.349,
  demandaMensualProyectada: 900 + i * 260,
  demandaEnVentana: (900 + i * 260) * 2.2,
  sigmaSemanal: 120 + i * 20,
  stockSeguridadLitros: 420 + i * 130,
  puntoReordenLitros: 1800 + i * 380,
  confianza: i % 3 === 0 ? 'alta' : i % 3 === 1 ? 'media' : 'baja',
  mapeBacktest: 18 + i * 3,
  mesesHistorial: 30,
  metodo: 'propio',
  stockActualLitros: 300 + i * 90,
  stockActualUnidades: null,
  // Litros del producto que ya están en un fermentador: no hay que volver a
  // cocerlos, así que el escenario los incluye para probar ese descuento.
  litrosEnProduccion: i % 3 === 0 ? 800 : 0,
}))

export const PLAN: LotePlan[] = [
  {
    id: 'p1', producto: 'Red IPA', categoria: 'cerveza', litrosPlanificados: 3000,
    fechaPlanificada: masDias(-2), prioridad: 0, estado: 'planificado', origen: 'sugerido',
    motivo: 'Bajo punto de reorden', observaciones: null,
    fermentador: 'Fermentador T6', diasOcupacion: 24,
  },
  {
    id: 'p2', producto: 'Kombucha Berry Menta', categoria: 'kombucha', litrosPlanificados: 2000,
    fechaPlanificada: masDias(1), prioridad: 1, estado: 'planificado', origen: 'manual',
    motivo: null, observaciones: null,
    fermentador: 'Fermentador K-2', diasOcupacion: 12,
  },
]

/** Cobertura para la franja del Gantt: un mes cubierto, uno a medias y dos
 *  cortos, para ver los tres colores de la barra de una sola pasada. */
export const COBERTURA = [
  { mes: mesDesde(0), necesidad: 14600, planificado: 15200 },
  { mes: mesDesde(1), necesidad: 14400, planificado: 10100 },
  { mes: mesDesde(2), necesidad: 14900, planificado: 4200 },
  { mes: mesDesde(3), necesidad: 16900, planificado: 0 },
]

/** Último mes proyectado: la grilla del Gantt llega hasta ahí. */
export const HASTA_MES = mesDesde(5)

/**
 * Stock de hoy y ritmo de venta por producto. Calibrado a propósito para que
 * se vean los tres casos de una sola pasada: uno que se queda corto y su lote
 * llega tarde, uno justo, y varios que aguantan todo el horizonte.
 */
export const NECESIDAD = CONFIG.map((c, i) => {
  const litrosMes = 900 + i * 260
  return {
    producto: c.producto,
    categoria: c.categoria,
    // Los primeros de la lista arrancan con poco stock: son los que quiebran.
    stockActual: Math.round(litrosMes * (i < 2 ? 0.35 : i < 4 ? 0.9 : 2.2)),
    ritmo: Array.from({ length: 6 }, (_, m) => ({
      mes: mesDesde(m),
      litrosDia: (litrosMes * (1 + 0.06 * m)) / 30,
    })),
  }
})
