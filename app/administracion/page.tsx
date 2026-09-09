import { redirect } from 'next/navigation'
import { getServerUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { cicloEnCursoISO, inicioDeCiclo, finDeCiclo } from '@/lib/produccion/reglas'
import {
  proyectarCaja, esIngresoReal, normalizarNombreCliente, brutoDeFila,
  categoriaNormalizada, type FilaVentaFinanzas, type ProyeccionCaja,
} from '@/lib/administracion/finanzas'
import AdministracionClient from './AdministracionClient'

export const dynamic = 'force-dynamic'

/** Un punto de la serie de ingresos: histórico real o proyección del modelo. */
export interface PuntoFinanzas {
  mes: string
  tipo: 'historico' | 'forecast'
  monto: number
  montoMin: number | null
  montoMax: number | null
  tendencia: number | null
  estacionalidad: number | null
}

export interface SerieFinanzas {
  id: string
  nivel: 'general' | 'categoria'
  clave: string | null
  puntos: PuntoFinanzas[]
  /** Error del backtest walk-forward a 1 mes, en %. null = no alcanzó el
   *  historial para validar. */
  mape: number | null
  mesesHistorial: number | null
  /** Venta neta del ciclo EN CURSO, calculada en vivo — el modelo excluye el
   *  ciclo abierto a propósito, así que este número no sale de él. */
  montoCicloEnCurso: number
}

export interface AvanceCiclo {
  ciclo: string
  diaActual: number
  diasEnCiclo: number
  diasHabilesTranscurridos: number
  diasHabilesEnCiclo: number
}

export interface ResumenDeuda {
  /** Dato duro del informe de Deudores del ERP: plata que ya venció y no
   *  entró. No sale de nuestra proyección. */
  vencida: number
  clientes: number
  ultimaCarga: string | null
}

const MS_POR_DIA = 86_400_000

function esFinDeSemanaISO(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00Z`).getUTCDay()
  return dow === 0 || dow === 6
}

function contarDiasHabilesISO(desdeISO: string, hastaISO: string): number {
  let n = 0
  for (let t = Date.parse(`${desdeISO}T00:00:00Z`); t <= Date.parse(`${hastaISO}T00:00:00Z`); t += MS_POR_DIA) {
    if (!esFinDeSemanaISO(new Date(t).toISOString().slice(0, 10))) n++
  }
  return n
}

/**
 * Módulo Administración — finanzas de la empresa. Solo administradores.
 *
 * Responde dos preguntas que el resto de la app no responde:
 *   · ¿Cuánta PLATA vamos a facturar? (mismo modelo Prophet que Producción,
 *     pero la unidad es la venta neta en $, no litros.)
 *   · ¿CUÁNDO entra esa plata a la caja? (días de pago del cliente aplicados
 *     sobre la fecha de entrega.)
 */
export default async function AdministracionPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')
  if (!user.isAdmin) redirect('/')

  const admin = createAdminClient()
  const PAGE = 1000

  // ── Ciclo en curso (24 → 23), igual que Producción y la tabla de períodos ──
  const ciclo = cicloEnCursoISO()
  const inicioCiclo = inicioDeCiclo(ciclo)
  const finCiclo = finDeCiclo(ciclo)
  const hoyISO = new Date().toISOString().slice(0, 10)
  const diaActual = Math.floor((Date.parse(`${hoyISO}T00:00:00Z`) - Date.parse(`${inicioCiclo}T00:00:00Z`)) / MS_POR_DIA) + 1
  const diasEnCiclo = Math.floor((Date.parse(`${finCiclo}T00:00:00Z`) - Date.parse(`${inicioCiclo}T00:00:00Z`)) / MS_POR_DIA) + 1
  const avance: AvanceCiclo = {
    ciclo, diaActual, diasEnCiclo,
    diasHabilesTranscurridos: contarDiasHabilesISO(inicioCiclo, hoyISO),
    diasHabilesEnCiclo: contarDiasHabilesISO(inicioCiclo, finCiclo),
  }

  // Ventana de ventas a traer: cubre el ciclo en curso (para el MTD) y, hacia
  // atrás, el plazo de pago más largo del maestro de clientes (90 días) más un
  // margen — una entrega de hace 90 días con 90 de plazo recién vence hoy.
  const desdeVentana = new Date(Date.now() - 120 * MS_POR_DIA).toISOString().slice(0, 10)
  const desdeVentas = desdeVentana < inicioCiclo ? desdeVentana : inicioCiclo

  const [
    forecastRaw, validacionRaw, ventasRaw, clientesRaw, deudoresRaw, ultimaCorridaRaw,
  ] = await Promise.all([
    (async () => {
      const filas: Record<string, unknown>[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data } = await admin.from('forecast_finanzas')
          .select('nivel, clave, mes, tipo, monto, monto_min, monto_max, tendencia, estacionalidad')
          .order('mes', { ascending: true }).range(offset, offset + PAGE - 1)
        if (!data || data.length === 0) break
        filas.push(...data)
        if (data.length < PAGE) break
      }
      return filas
    })(),
    admin.from('forecast_finanzas_validacion').select('nivel, clave, mape, meses_historial').then(r => r.data ?? []),
    // La ventana de 120 días son ~17k filas y PostgREST corta en 1000: en
    // serie eso son 17 viajes encadenados (varios segundos de carga). Con el
    // count primero, las páginas se piden todas a la vez y el costo pasa a ser
    // el de la más lenta.
    (async () => {
      const { count } = await admin.from('ventas')
        .select('id', { count: 'exact', head: true })
        .gte('fecha_pedido', desdeVentas)
      const paginas = Math.ceil((count ?? 0) / PAGE)
      const lotes = await Promise.all(
        Array.from({ length: paginas }, (_, i) =>
          admin.from('ventas')
            .select('nombre_fantasia, producto, categoria_producto, envase, litros, total_sin_impuesto, fecha_pedido, fecha_entrega, entregado')
            .gte('fecha_pedido', desdeVentas)
            .order('id', { ascending: true })
            .range(i * PAGE, i * PAGE + PAGE - 1)
            .then(r => (r.data ?? []) as FilaVentaFinanzas[])
        )
      )
      return lotes.flat()
    })(),
    (async () => {
      const filas: { nombre_fantasia: string | null; dias_pago: number | null }[] = []
      for (let offset = 0; ; offset += PAGE) {
        const { data } = await admin.from('clientes')
          .select('nombre_fantasia, dias_pago')
          .order('id', { ascending: true }).range(offset, offset + PAGE - 1)
        if (!data || data.length === 0) break
        filas.push(...data)
        if (data.length < PAGE) break
      }
      return filas
    })(),
    admin.from('deudores').select('deuda_vencida, updated_at').then(r => r.data ?? []),
    admin.from('erp_sync_log').select('creado_at').eq('fuente', 'forecast_finanzas').eq('ok', true)
      .order('creado_at', { ascending: false }).limit(1).maybeSingle().then(r => r.data),
  ])

  // ── Series del modelo ──────────────────────────────────────────────────────
  const mapeaPunto = (f: Record<string, unknown>): PuntoFinanzas => ({
    mes: String(f.mes).slice(0, 10),
    tipo: f.tipo as 'historico' | 'forecast',
    monto: Number(f.monto),
    montoMin: f.monto_min != null ? Number(f.monto_min) : null,
    montoMax: f.monto_max != null ? Number(f.monto_max) : null,
    tendencia: f.tendencia != null ? Number(f.tendencia) : null,
    estacionalidad: f.estacionalidad != null ? Number(f.estacionalidad) : null,
  })

  const porSerie = new Map<string, PuntoFinanzas[]>()
  for (const f of forecastRaw) {
    const clave = `${f.nivel}::${f.clave ?? ''}`
    if (!porSerie.has(clave)) porSerie.set(clave, [])
    porSerie.get(clave)!.push(mapeaPunto(f))
  }

  const validacionPorSerie = new Map(
    validacionRaw.map(v => [`${v.nivel}::${v.clave ?? ''}`, v])
  )

  // Venta neta del ciclo en curso, por serie — en vivo, por fecha de PEDIDO
  // (mismo criterio que la serie histórica que alimenta el modelo).
  const mtdGeneral = { neto: 0, bruto: 0 }
  const mtdPorCategoria = new Map<string, number>()
  for (const v of ventasRaw) {
    if (!v.fecha_pedido || v.fecha_pedido < inicioCiclo || v.fecha_pedido > finCiclo) continue
    if (!esIngresoReal(v)) continue
    const neto = Number(v.total_sin_impuesto) || 0
    if (neto === 0) continue
    mtdGeneral.neto += neto
    mtdGeneral.bruto += brutoDeFila(v)
    const cat = categoriaNormalizada(v.producto, v.categoria_producto)
    mtdPorCategoria.set(cat, (mtdPorCategoria.get(cat) ?? 0) + neto)
  }

  const series: SerieFinanzas[] = [...porSerie.entries()].map(([id, puntos]) => {
    const [nivel, claveRaw] = id.split('::')
    const clave = claveRaw || null
    const val = validacionPorSerie.get(id)
    return {
      id, nivel: nivel as 'general' | 'categoria', clave,
      puntos: puntos.sort((a, b) => a.mes.localeCompare(b.mes)),
      mape: val?.mape != null ? Number(val.mape) : null,
      mesesHistorial: val?.meses_historial != null ? Number(val.meses_historial) : null,
      montoCicloEnCurso: nivel === 'general' ? mtdGeneral.neto : (mtdPorCategoria.get(clave ?? '') ?? 0),
    }
  })

  // ── Proyección de cobranza ─────────────────────────────────────────────────
  // El maestro puede traer el mismo nombre más de una vez; gana el que tenga
  // plazo cargado, para no perder el dato por culpa de una ficha duplicada
  // incompleta.
  const diasPagoPorCliente = new Map<string, number | null>()
  for (const c of clientesRaw) {
    const k = normalizarNombreCliente(c.nombre_fantasia)
    if (!k) continue
    const previo = diasPagoPorCliente.get(k)
    if (previo == null) diasPagoPorCliente.set(k, c.dias_pago)
  }

  // Se descartan los cobros esperados de hace más de 14 días: `ventas` no dice
  // qué está pagado, así que más atrás la proyección dejaría de ser "lo que
  // falta cobrar". Esa mora vieja la mide el informe de Deudores del ERP.
  const desdeCobro = new Date(Date.now() - 14 * MS_POR_DIA).toISOString().slice(0, 10)
  const caja: ProyeccionCaja = proyectarCaja(ventasRaw, diasPagoPorCliente, hoyISO, desdeCobro)

  const deuda: ResumenDeuda = {
    vencida: deudoresRaw.reduce((s, d) => s + (Number(d.deuda_vencida) || 0), 0),
    clientes: deudoresRaw.filter(d => (Number(d.deuda_vencida) || 0) > 0).length,
    ultimaCarga: deudoresRaw.reduce<string | null>((max, d) => {
      const u = d.updated_at as string | null
      return u && (!max || u > max) ? u : max
    }, null),
  }

  return (
    <AdministracionClient
      series={series}
      avance={avance}
      mtd={mtdGeneral}
      caja={caja}
      deuda={deuda}
      ultimaCorrida={ultimaCorridaRaw?.creado_at ?? null}
      clientesSinPlazo={[...diasPagoPorCliente.values()].filter(v => v == null).length}
      hoyISO={hoyISO}
    />
  )
}
