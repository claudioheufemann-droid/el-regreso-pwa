import { notFound } from 'next/navigation'
import DevProduccionClient from './DevProduccionClient'

/**
 * Banco de pruebas de los componentes de Producción.
 *
 * Existe porque el módulo vive detrás del gate de sesión y hay estados que
 * con datos reales no se pueden provocar cuando uno quiere: dos cocciones
 * pisándose en el mismo tanque, un bloque cuyo litraje no cabe, la planta
 * saturada, la tabla vacía. Acá se arman a mano y se revisan de un vistazo.
 *
 * NO TOCA LA BASE Y NO MUESTRA NADA REAL: todo sale de datos inventados en
 * `fixtures.ts`. Y no existe fuera de desarrollo — el notFound() de abajo es
 * la segunda capa; la primera es la condición de NODE_ENV en proxy.ts.
 */
export const dynamic = 'force-static'

export default function DevProduccionPage() {
  if (process.env.NODE_ENV !== 'development') notFound()
  return <DevProduccionClient />
}
