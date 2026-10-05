import { notFound } from 'next/navigation'
import Link from 'next/link'
import ProduccionClient from '@/app/produccion/ProduccionClient'
import { propsCompletos, type ModoDatos } from './fixturesCompletos'

/**
 * Banco de pruebas del MÓDULO COMPLETO de Producción (las cinco pestañas), con
 * datos inventados y un selector de datos (break-ui): normal, peor caso, vacío
 * y un solo elemento. Se elige con ?data=normal|peor|vacio|uno.
 *
 * No toca la base: los botones que guardan van a fallar, y está bien.
 * Igual que /dev/produccion, no existe fuera de desarrollo (proxy.ts + este
 * notFound).
 */
export const dynamic = 'force-dynamic'

const MODOS: { id: ModoDatos; label: string }[] = [
  { id: 'normal', label: 'Demo' }, { id: 'peor', label: 'Peor caso' }, { id: 'vacio', label: 'Vacío' }, { id: 'uno', label: 'Uno' },
]

export default async function DevProduccionCompletoPage({ searchParams }: { searchParams: Promise<{ data?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound()
  const { data } = await searchParams
  const modo: ModoDatos = MODOS.some(m => m.id === data) ? (data as ModoDatos) : 'normal'
  return (
    <>
      <ProduccionClient key={modo} {...propsCompletos(modo)} />
      {/* Selector del banco de pruebas: deliberadamente neutro y fuera del diseño bajo prueba. */}
      <nav aria-label="Datos del banco de pruebas" style={{ position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 10001, display: 'flex', gap: 2, padding: 3, background: '#d4d4d8', borderRadius: 10, font: '600 12px system-ui' }}>
        {MODOS.map(m => (
          <Link key={m.id} href={`?data=${m.id}`} replace style={{ padding: '5px 10px', borderRadius: 8, whiteSpace: 'nowrap', textDecoration: 'none', color: '#18181b', background: m.id === modo ? '#fff' : 'transparent' }}>{m.label}</Link>
        ))}
      </nav>
    </>
  )
}
