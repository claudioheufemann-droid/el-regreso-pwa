'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Bot, X, Maximize2, RotateCcw } from 'lucide-react'
import { useUser } from '@/lib/userContext'
import { SUGERENCIAS, SUGERENCIAS_VENDEDOR } from '@/lib/agente/sugerencias'
import { VistaChat, useChatAgente } from './ChatAgente'
import { accesoAsistente } from '@/lib/agente/alcance'

// Pantallas donde la burbuja estorba o no tiene sentido (sin sesión, o la propia página del asistente).
const OCULTO_EN = ['/login', '/reset-password', '/auth', '/offline', '/instalar', '/administracion/agente']

/**
 * Burbuja flotante del Asistente de datos, abajo a la derecha, en todas las
 * pantallas. Admins: toda la base. Vendedores con cartera en el ERP: modo
 * cartera (sólo sus clientes, sin SQL libre ni acciones). Acá sólo se oculta o
 * cambia el texto; el control real está en /api/agente (lib/agente/alcance.ts).
 * En "Ver como vendedor" el admin ve exactamente el modo del vendedor.
 */
export default function AgenteFlotante() {
  const { user } = useUser()
  const pathname = usePathname()
  const [abierto, setAbierto] = useState(false)
  const chat = useChatAgente()

  useEffect(() => {
    if (!abierto) return
    const alTeclear = (e: KeyboardEvent) => { if (e.key === 'Escape') setAbierto(false) }
    window.addEventListener('keydown', alTeclear)
    return () => window.removeEventListener('keydown', alTeclear)
  }, [abierto])

  const acceso = accesoAsistente(user)
  const esVendedor = acceso === 'vendedor'
  if (!acceso) return null
  if (OCULTO_EN.some(ruta => pathname === ruta || pathname.startsWith(`${ruta}/`))) return null

  return (
    <>
      <style>{`
        .agente-fab { position: fixed; z-index: 9100; right: 16px; bottom: calc(env(safe-area-inset-bottom, 0px) + 84px);
          width: 56px; height: 56px; border-radius: 100px; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center;
          background: #D4AF37; color: #0A0A0A; box-shadow: 0 6px 22px rgba(0,0,0,.45), 0 0 0 1px rgba(212,175,55,.35); transition: transform .15s; }
        .agente-fab:hover { transform: scale(1.06); }
        .agente-fab:focus-visible, .agente-btn:focus-visible { outline: 2px solid #F4EEDF; outline-offset: 2px; }
        .agente-panel { position: fixed; z-index: 9100; left: 8px; right: 8px; bottom: calc(env(safe-area-inset-bottom, 0px) + 8px);
          height: min(78vh, 640px); display: flex; flex-direction: column; background: #111111; color: #F4EEDF;
          border: 1px solid rgba(212,175,55,.25); border-radius: 18px; overflow: hidden; box-shadow: 0 18px 60px rgba(0,0,0,.6); }
        /* En celular el panel ocupa casi toda la pantalla y trae su propia X: el botón redondo sobraría encima. */
        @media (max-width: 1023px) { .agente-fab[aria-expanded="true"] { display: none; } }
        @media (min-width: 1024px) {
          .agente-fab { right: 24px; bottom: 24px; }
          .agente-panel { left: auto; right: 24px; bottom: 92px; width: 400px; height: min(620px, calc(100vh - 120px)); }
        }
        .agente-btn { background: transparent; border: none; color: #9A938B; cursor: pointer; padding: 6px; border-radius: 8px; display: flex; }
        .agente-btn:hover { color: #F4EEDF; background: rgba(255,255,255,.06); }
        @media (prefers-reduced-motion: reduce) { .agente-fab { transition: none; } }
      `}</style>

      {abierto && (
        <section className="agente-panel" role="dialog" aria-label="Asistente de datos">
          <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
            <Bot size={16} style={{ color: '#D4AF37' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 13.5, fontWeight: 800 }}>Asistente de datos</p>
              <p style={{ fontSize: 11, color: '#9A938B' }}>{esVendedor ? 'Tu cartera · solo lectura' : 'Lee la base y propone acciones'}</p>
            </div>
            {chat.mensajes.length > 0 && (
              <button className="agente-btn" onClick={chat.limpiar} aria-label="Nueva conversación" title="Nueva conversación"><RotateCcw size={15} /></button>
            )}
            {/* La pantalla completa (/administracion/agente) es sólo para admins. */}
            {user?.isAdmin && (
              <Link className="agente-btn" href="/administracion/agente" onClick={() => setAbierto(false)} aria-label="Abrir en pantalla completa" title="Pantalla completa y ajustes"><Maximize2 size={15} /></Link>
            )}
            <button className="agente-btn" onClick={() => setAbierto(false)} aria-label="Cerrar"><X size={17} /></button>
          </header>
          <VistaChat {...chat} tema="oscuro" ejemplos={esVendedor ? SUGERENCIAS_VENDEDOR : SUGERENCIAS.slice(0, 4)} esVendedor={esVendedor} idCampo="pregunta-agente-flotante" />
        </section>
      )}

      <button
        className="agente-fab" onClick={() => { if (!abierto) void chat.recargar(); setAbierto(a => !a) }}
        aria-label={abierto ? 'Cerrar asistente de datos' : 'Abrir asistente de datos'} aria-expanded={abierto}
      >
        {abierto ? <X size={24} /> : <Bot size={26} />}
      </button>
    </>
  )
}
