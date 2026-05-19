import { getServerUser } from '@/lib/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/ui/LogoutButton'

export const dynamic = 'force-dynamic'

export default async function HubPage() {
  const user = await getServerUser()
  if (!user) redirect('/login')

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#080808' }}
    >
      <div className="w-full max-w-sm">

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 48 }}>
          <div style={{
            width: 64, height: 64, background: '#D4AF37', borderRadius: 20,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px', fontSize: 28,
          }}>
            🍺
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-0.5px' }}>
            El Regreso Beer
          </h1>
          <p style={{ fontSize: 12, color: '#7A7268', marginTop: 4 }}>
            Hola, <span style={{ color: '#D4AF37', fontWeight: 700 }}>{user.nombre.split(' ')[0]}</span>
          </p>
          <p style={{ fontSize: 10, color: '#3A3530', marginTop: 6, letterSpacing: 1.5 }}>
            {user.isAdmin ? 'ADMINISTRADOR · ACCESO TOTAL' : 'ACCESO VENTAS'}
          </p>
        </div>

        {/* Module Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Ventas — visible to all */}
          <Link href="/ventas" style={{ textDecoration: 'none' }}>
            <div
              style={{
                background: '#131313', border: '1px solid rgba(212,175,55,0.2)',
                borderRadius: 20, padding: '24px 22px',
                display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer',
              }}
              className="card-hover"
            >
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>
                📊
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 4 }}>
                  Ventas
                </div>
                <div style={{ fontSize: 12, color: '#7A7268', lineHeight: 1.4 }}>
                  Dashboard, metas, clientes y mapa
                  {!user.isAdmin && (
                    <span style={{ display: 'block', color: '#D4AF37', fontWeight: 600, marginTop: 2 }}>
                      Vista personalizada
                    </span>
                  )}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#D4AF37', fontSize: 18, flexShrink: 0 }}>→</div>
            </div>
          </Link>

          {/* Gestión — admin only */}
          {user.isAdmin ? (
            <Link href="/gestion" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: '#131313', border: '1px solid rgba(91,138,168,0.25)',
                  borderRadius: 20, padding: '24px 22px',
                  display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer',
                }}
                className="card-hover"
              >
                <div style={{
                  width: 52, height: 52, borderRadius: 16,
                  background: 'rgba(91,138,168,0.12)', border: '1px solid rgba(91,138,168,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, flexShrink: 0,
                }}>
                  ⊞
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 4 }}>
                    Gestión
                  </div>
                  <div style={{ fontSize: 12, color: '#7A7268', lineHeight: 1.4 }}>
                    Tareas, áreas y sistema operativo ejecutivo
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', color: '#5B8AA8', fontSize: 18, flexShrink: 0 }}>→</div>
              </div>
            </Link>
          ) : (
            /* Locked card for non-admins */
            <div style={{
              background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: 20, padding: '24px 22px',
              display: 'flex', alignItems: 'center', gap: 18,
              opacity: 0.4, cursor: 'not-allowed',
            }}>
              <div style={{
                width: 52, height: 52, borderRadius: 16,
                background: 'rgba(255,255,255,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 22, flexShrink: 0,
              }}>
                🔒
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#6A6460', marginBottom: 4 }}>
                  Gestión
                </div>
                <div style={{ fontSize: 12, color: '#3A3530', lineHeight: 1.4 }}>
                  Acceso restringido · Solo administradores
                </div>
              </div>
            </div>
          )}

        </div>

        <LogoutButton />

        <p style={{ textAlign: 'center', fontSize: 10, color: '#2A2520', marginTop: 20, letterSpacing: 1 }}>
          Cervecería El Regreso · Valdivia, Chile
        </p>
      </div>
    </div>
  )
}
