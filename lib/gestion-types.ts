export type TaskStatus = 'Asignada' | 'En Proceso' | 'Por Aprobar' | 'Atrasada' | 'Completada' | 'Rechazada'

export interface RcUser {
  id: string
  nombre: string
  iniciales: string
  rol: string
  area: string
  email: string
  is_admin?: boolean
  macro_area?: string | null   // 'comercial' | 'administracion' | 'produccion' | null (global admin)
}

export interface RcTask {
  id: string
  titulo: string
  descripcion: string
  area: string
  sub_area?: string
  responsable_id: string
  responsable?: RcUser
  responsable_ids?: string[]
  responsables?: RcUser[]
  plazo: string
  estado: TaskStatus
  prioridad_maxima: boolean
  evidencia_url?: string
  contador_retrasos: number
  created_at?: string
  creado_por?: string
  nota_rechazo?: string
  nota_admin?: string
  foto_antes_url?: string
  foto_despues_url?: string
  resumen_cierre?: string
  started_at?: string
}

// -- Macro categorias --
export const MACRO_AREAS = {
  comercial: {
    label: 'Area Comercial',
    color: '#E67E22',
    code: 'AC',
    areas: ['Ventas', 'Marketing', 'Logistica', 'Control de Gestion'] as const,
  },
  administracion: {
    label: 'Administracion',
    color: '#5B8AA8',
    code: 'AD',
    areas: ['R. Humanos', 'Contabilidad', 'Finanzas'] as const,
  },
  produccion: {
    label: 'Area de Produccion',
    color: '#C8542A',
    code: 'PR',
    areas: ['Produccion'] as const,
  },
} as const

export type MacroKey = keyof typeof MACRO_AREAS

export function getMacroKey(area: string): MacroKey {
  if ((MACRO_AREAS.administracion.areas as readonly string[]).includes(area)) return 'administracion'
  if ((MACRO_AREAS.produccion.areas as readonly string[]).includes(area)) return 'produccion'
  return 'comercial'
}

export function eligibleUsers(users: RcUser[], area: string): RcUser[] {
  const macro = getMacroKey(area)
  return users.filter(u => u.macro_area === macro || !u.macro_area)
}

export const AREAS = [
  ...MACRO_AREAS.comercial.areas,
  ...MACRO_AREAS.administracion.areas,
  ...MACRO_AREAS.produccion.areas,
] as const
export const CEREBRO_AREA = 'Mi Cerebro'
export const ALL_AREAS = [...AREAS, CEREBRO_AREA] as const

export const STATUS_LIST: TaskStatus[] = [
  'Asignada', 'En Proceso', 'Por Aprobar', 'Atrasada', 'Completada', 'Rechazada'
]

export const AREA_CFG: Record<string, { color: string; dim: string; code: string }> = {
  // Area Comercial
  'Ventas':               { color: '#E67E22', dim: '#1A110A', code: 'VT' },
  'Marketing':            { color: '#5B8AA8', dim: '#0A0F14', code: 'MK' },
  'Logistica':            { color: '#C8542A', dim: '#180D0A', code: 'LG' },
  'Logística':            { color: '#C8542A', dim: '#180D0A', code: 'LG' },
  'Control de Gestion':   { color: '#D4AF37', dim: '#141007', code: 'CG' },
  'Control de Gestión':   { color: '#D4AF37', dim: '#141007', code: 'CG' },
  // Administracion
  'R. Humanos':           { color: '#8E44AD', dim: '#120A16', code: 'RH' },
  'Contabilidad':         { color: '#16A085', dim: '#061210', code: 'CT' },
  'Finanzas':             { color: '#27AE60', dim: '#081409', code: 'FZ' },
  // Produccion
  'Produccion':           { color: '#C8542A', dim: '#180D0A', code: 'PR' },
  'Producción':           { color: '#C8542A', dim: '#180D0A', code: 'PR' },
  // Personal
  'Mi Cerebro':           { color: '#9B59B6', dim: '#100A14', code: 'MC' },
}

export const STATUS_CFG: Record<TaskStatus, { color: string; bg: string; label: string }> = {
  'Asignada':    { color: '#5B8AA8', bg: '#0A0F14', label: 'Asignada' },
  'En Proceso':  { color: '#E67E22', bg: '#1A110A', label: 'En Proceso' },
  'Por Aprobar': { color: '#D4AF37', bg: '#141007', label: 'Por Aprobar' },
  'Atrasada':    { color: '#FF4444', bg: '#1A0A0A', label: 'Atrasada' },
  'Completada':  { color: '#4A7A3A', bg: '#0A140A', label: 'Completada' },
  'Rechazada':   { color: '#A8341F', bg: '#140A0A', label: 'Rechazada' },
}
