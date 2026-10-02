import AgenteClient, { type ConfigAgente } from './AgenteClient'
import { PARAMETROS, REGLAS, GLOSARIO } from '@/lib/agente/sistema'
import { SUGERENCIAS } from '@/lib/agente/sugerencias'
import { CONSULTAS } from '@/lib/agente/consultas'
import { AREAS, LLAVES, MODULOS } from '@/lib/agente/mapa'

export const dynamic = 'force-dynamic'

export default function AgentePage() {
  // El acceso (sólo admin) lo resuelve app/administracion/layout.tsx.
  const config: ConfigAgente = {
    configurado: !!process.env.GEMINI_API_KEY,
    parametros: [
      ['Proveedor', PARAMETROS.proveedor],
      ['Modelos (en orden de preferencia)', PARAMETROS.modelos.join(' → ')],
      ['Temperatura', String(PARAMETROS.temperatura)],
      ['Tokens máx. por respuesta', String(PARAMETROS.maxTokensRespuesta)],
      ['Rondas máx. de consulta por pregunta', String(PARAMETROS.maxRondasHerramientas)],
      ['Resumen automático de la conversación', `cada ${PARAMETROS.umbralResumen} mensajes (deja ${PARAMETROS.mensajesTrasResumir} literales)`],
      ['Memorias inyectadas por pregunta (máx.)', String(PARAMETROS.maxMemoriasContexto)],
      ['Lectura libre (SQL)', `máx. ${PARAMETROS.maxFilasSql} filas · ${PARAMETROS.timeoutSql}`],
      ['Filas máx. leídas por herramienta', PARAMETROS.maxFilasEscaneadas.toLocaleString('es-CL')],
      ['Alcance de datos', PARAMETROS.alcanceDatos],
      ['Acceso', PARAMETROS.acceso],
      ['Modo', PARAMETROS.soloLectura ? 'Solo lectura (no escribe en la base)' : 'Lectura y escritura'],
    ],
    reglas: [...REGLAS],
    glosario: [...GLOSARIO],
    ejemplos: SUGERENCIAS,
    consultas: CONSULTAS.map(c => ({
      nombre: c.nombre,
      descripcion: c.descripcion,
      parametros: c.parametros.map(p => `${p.nombre}${p.requerido ? '*' : ''} (${p.tipo})`),
    })),
    mapa: { llaves: [...LLAVES], areas: AREAS, modulos: MODULOS },
  }
  return <AgenteClient config={config} />
}
