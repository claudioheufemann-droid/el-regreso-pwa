/**
 * Motor de reglas de verificación de llegada en terreno — puro, sin I/O.
 *
 * Decide un ÚNICO resultado por llegada: 'verificada_auto' o
 * 'pendiente_revision'. Nunca decide 'aprobada_manual' ni 'rechazada' —
 * esos dos son exclusivamente acciones de un admin sobre una llegada que
 * quedó en revisión (ver app/api/terreno/revision). El vendedor no puede
 * aprobar ni rechazar su propia evidencia.
 *
 * Parámetros iniciales (spec sección 5), ajustables sin tocar la lógica.
 */
export const PARAMS_VERIFICACION = {
  /** Radio de referencia por defecto si el cliente no define uno propio. */
  radioDefaultM: 100,
  /** Precisión (accuracy) máxima aceptable del GPS para verificar automático. */
  precisionMaxM: 50,
  /** Antigüedad máxima de la lectura GPS respecto al momento de captura. */
  lecturaMaxEdadS: 30,
  /** Ventana de la sesión de captura online. */
  sesionMaxS: 5 * 60,
} as const

export type MotivoRevision =
  | 'sin_ubicacion'
  | 'captura_offline'
  | 'foto_invalida'
  | 'referencia_no_validada'
  | 'precision_insuficiente'
  | 'lectura_antigua'
  | 'sesion_expirada'
  | 'fuera_de_radio'
  | 'incertidumbre_borde'
  | 'reloj_incoherente'
  | 'incidencia_declarada'

export type EstadoPresenciaAutomatico = 'verificada_auto' | 'pendiente_revision'

export interface InputVerificacion {
  /** false si el cliente/local aún no fue validado por un admin (pin propuesto). */
  referenciaValidada: boolean
  /** Radio de tolerancia del cliente, en metros. */
  radioM: number
  /** Distancia recta entre la lectura del vendedor y el punto de referencia, en metros. */
  distanciaM: number | null
  /** Precisión (accuracy) reportada por el GPS, en metros. */
  precisionM: number | null
  /** Segundos entre el timestamp de la lectura GPS y el momento de captura. */
  edadLecturaS: number | null
  /** La sesión de captura (online, ventana de 5 min) sigue vigente. */
  sesionValida: boolean
  /** La captura se hizo sin conexión y se sincronizó después. */
  capturaOffline: boolean
  /** La foto pasó validación de servidor: decodifica, tipo real, tamaño y dimensiones OK. */
  fotoValida: boolean
  /** El reloj del dispositivo está muy desalineado con el del servidor al recibir. */
  relojIncoherente?: boolean
  /** El vendedor declaró una incidencia (ver nota obligatoria) en vez de completar la captura normal. */
  incidenciaDeclarada?: boolean
}

export interface ResultadoVerificacion {
  estado: EstadoPresenciaAutomatico
  motivo: MotivoRevision | null
}

/**
 * Evalúa una llegada. Cualquier duda razonable cae a 'pendiente_revision' —
 * un admin decide después; el motor nunca aprueba con datos incompletos ni
 * rechaza por su cuenta.
 */
export function evaluarPresencia(input: InputVerificacion): ResultadoVerificacion {
  if (input.incidenciaDeclarada) return { estado: 'pendiente_revision', motivo: 'incidencia_declarada' }
  if (!input.fotoValida) return { estado: 'pendiente_revision', motivo: 'foto_invalida' }
  if (input.relojIncoherente) return { estado: 'pendiente_revision', motivo: 'reloj_incoherente' }
  if (input.capturaOffline) return { estado: 'pendiente_revision', motivo: 'captura_offline' }
  if (input.distanciaM == null || input.precisionM == null || input.edadLecturaS == null) {
    return { estado: 'pendiente_revision', motivo: 'sin_ubicacion' }
  }
  if (!input.referenciaValidada) return { estado: 'pendiente_revision', motivo: 'referencia_no_validada' }
  if (input.precisionM > PARAMS_VERIFICACION.precisionMaxM) {
    return { estado: 'pendiente_revision', motivo: 'precision_insuficiente' }
  }
  if (input.edadLecturaS > PARAMS_VERIFICACION.lecturaMaxEdadS) {
    return { estado: 'pendiente_revision', motivo: 'lectura_antigua' }
  }
  if (!input.sesionValida) return { estado: 'pendiente_revision', motivo: 'sesion_expirada' }

  const radioM = input.radioM > 0 ? input.radioM : PARAMS_VERIFICACION.radioDefaultM
  const margenOptimista = input.distanciaM + input.precisionM
  const margenPesimista = input.distanciaM - input.precisionM

  if (margenOptimista <= radioM) return { estado: 'verificada_auto', motivo: null }
  if (margenPesimista > radioM) return { estado: 'pendiente_revision', motivo: 'fuera_de_radio' }
  return { estado: 'pendiente_revision', motivo: 'incertidumbre_borde' }
}

export const MOTIVO_LABEL: Record<MotivoRevision, string> = {
  sin_ubicacion: 'Sin ubicación',
  captura_offline: 'Capturada sin conexión',
  foto_invalida: 'Foto no válida',
  referencia_no_validada: 'Local pendiente de validar',
  precision_insuficiente: 'Precisión GPS insuficiente',
  lectura_antigua: 'Lectura GPS antigua',
  sesion_expirada: 'Sesión de captura vencida',
  fuera_de_radio: 'Fuera del radio del local',
  incertidumbre_borde: 'En el borde del radio',
  reloj_incoherente: 'Reloj del teléfono desalineado',
  incidencia_declarada: 'Incidencia declarada por el vendedor',
}
