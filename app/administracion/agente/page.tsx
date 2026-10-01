import AgenteClient, { type ConfigAgente } from './AgenteClient'
import { PARAMETROS, REGLAS, GLOSARIO, EJEMPLOS } from '@/lib/agente/sistema'
import { CONSULTAS } from '@/lib/agente/consultas'

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
      ['Turnos de historial', String(PARAMETROS.maxTurnosHistorial)],
      ['Filas máx. leídas por consulta', PARAMETROS.maxFilasEscaneadas.toLocaleString('es-CL')],
      ['Acceso', PARAMETROS.acceso],
      ['Modo', PARAMETROS.soloLectura ? 'Solo lectura (no escribe en la base)' : 'Lectura y escritura'],
    ],
    reglas: [...REGLAS],
    glosario: [...GLOSARIO],
    ejemplos: EJEMPLOS.map(e => e.pregunta),
    consultas: CONSULTAS.map(c => ({
      nombre: c.nombre,
      descripcion: c.descripcion,
      parametros: c.parametros.map(p => `${p.nombre}${p.requerido ? '*' : ''} (${p.tipo})`),
    })),
  }
  return <AgenteClient config={config} />
}
