/**
 * Tipos y constantes de la vista principal de Ventas.
 *
 * Va aparte de hoyData.ts a propósito: ese módulo importa
 * lib/supabase/server, y el componente cliente necesita RANGOS (un valor, no
 * sólo tipos), así que importarlo desde allá arrastraría código de servidor al
 * bundle del navegador y el build falla.
 */

export type RangoKey = 'hoy' | '7d' | '30d' | 'mes' | 'anio'

export const RANGOS: { key: RangoKey; label: string }[] = [
  { key: 'hoy',  label: 'Hoy'  },
  { key: '7d',   label: '7D'   },
  { key: '30d',  label: '30D'  },
  { key: 'mes',  label: 'Mes'  },
  { key: 'anio', label: 'Año'  },
]

export interface KpisRango {
  litros: number
  revenue: number
  clientes: number
  pedidos: number
  litrosCerveza: number
  litrosKombucha: number
  litrosOtros: number
}

export interface VendedorRango {
  vendedor: string      // nombre de display (agrupado)
  litros: number
  revenue: number
  clientes: number
  litrosPrev: number
}

export interface PuntoSerie {
  fecha: string
  litros: number
  revenue: number
  clientes: number
  pedidos: number
}

export interface DatosRango {
  desde: string
  hasta: string
  actual: KpisRango
  previo: KpisRango
  vendedores: VendedorRango[]
  serie: PuntoSerie[]
}

export interface AlertaInsight {
  tipo: 'alerta' | 'insight'
  titulo: string
  detalle: string
  href?: string
}

export interface HoyData {
  rangos: Record<RangoKey, DatosRango>
  periodo: { nombre: string; inicio: string; fin: string } | null
  metaLitros: number
  alertas: AlertaInsight[]
  ultimaSync: string | null
  usuario: { nombre: string; iniciales: string; avatarUrl: string | null } | null
}
