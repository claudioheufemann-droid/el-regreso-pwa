import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import LogoutButton from '@/components/ui/LogoutButton'

export const dynamic = 'force-dynamic'

export default async function HubPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Profile lookup — if it fails, show hub with limited access (no redirect loop)
  const { data: profile } = await supabase
    .from('users')
    .select('nombre, is_admin, email')
    .eq('id', user.id)
    .maybeSingle()

  const isAdmin = profile?.is_admin ?? false
  const nombre = profile?.nombre ?? user.email?.split('@')[0] ?? 'Usuario'

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-6"
      style={{ background: '#080808' }}
    >
      <div className="w-full max-w-sm">

        {/* Header */}
        <div className="hub-header" style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            width: 52, height: 52, background: '#D4AF37', borderRadius: 16,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 12px', fontSize: 24,
          }}>
            🍺
          </div>
          <h1 style={{ fontSize: 20, fontWeight: 900, color: '#F4EEDF', letterSpacing: '-0.5px' }}>
            El Regreso Beer
          </h1>
          <p style={{ fontSize: 12, color: '#7A7268', marginTop: 3 }}>
            Hola, <span style={{ color: '#D4AF37', fontWeight: 700 }}>{nombre.split(' ')[0]}</span>
          </p>
          <p style={{ fontSize: 9, color: '#3A3530', marginTop: 4, letterSpacing: 1.5 }}>
            {isAdmin ? 'ADMINISTRADOR · ACCESO TOTAL' : 'ACCESO VENTAS'}
          </p>
        </div>

        {/* Module Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          <Link href="/ventas" style={{ textDecoration: 'none' }}>
            <div
              style={{
                background: '#131313', border: '1px solid rgba(212,175,55,0.2)',
                borderRadius: 18, padding: '18px 18px',
                display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              }}
              className="card-hover"
            >
              <div style={{
                width: 44, height: 44, borderRadius: 13,
                background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>📊</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 4 }}>Ventas</div>
                <div style={{ fontSize: 12, color: '#7A7268', lineHeight: 1.4 }}>
                  Dashboard, metas, clientes y mapa
                  {!isAdmin && (
                    <span style={{ display: 'block', color: '#D4AF37', fontWeight: 600, marginTop: 2 }}>
                      Vista personalizada
                    </span>
                  )}
                </div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#D4AF37', fontSize: 18, flexShrink: 0 }}>→</div>
            </div>
          </Link>

          {isAdmin ? (
            <Link href="/gestion" style={{ textDecoration: 'none' }}>
              <div
                style={{
                  background: '#131313', border: '1px solid rgba(91,138,168,0.25)',
                  borderRadius: 18, padding: '18px 18px',
                  display: 'flex', alignItems: 'center', gap: 18, cursor: 'pointer',
                }}
                className="card-hover"
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 13,
                  background: 'rgba(91,138,168,0.12)', border: '1px solid rgba(91,138,168,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, flexShrink: 0,
                }}>⊞</div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 4 }}>Gestión</div>
                  <div style={{ fontSize: 12, color: '#7A7268', lineHeight: 1.4 }}>
                    Tareas, áreas y sistema operativo ejecutivo
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', color: '#5B8AA8', fontSize: 18, flexShrink: 0 }}>→</div>
              </div>
            </Link>
          ) : (
            <div style={{
              background: '#0D0D0D', border: '1px solid rgba(255,255,255,0.04)',
              borderRadius: 18, padding: '18px 18px',
              display: 'flex', alignItems: 'center', gap: 14,
              opacity: 0.4, cursor: 'not-allowed',
            }}>
              <div style={{
                width: 44, height: 44, borderRadius: 13,
                background: 'rgba(255,255,255,0.03)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>🔒</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#6A6460', marginBottom: 4 }}>Gestión</div>
                <div style={{ fontSize: 12, color: '#3A3530', lineHeight: 1.4 }}>
                  Acceso restringido · Solo administradores
                </div>
              </div>
            </div>
          )}

          <Link href="/terreno" style={{ textDecoration: 'none' }}>
            <div
              style={{
                background: '#131313', border: '1px solid rgba(16,185,129,0.25)',
                borderRadius: 18, padding: '18px 18px',
                display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              }}
              className="card-hover"
            >
              <div style={{
                width: 44, height: 44, borderRadius: 13,
                background: 'rgba(16,185,129,0.12)', border: '1px solid rgba(16,185,129,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>📍</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 4 }}>Terreno</div>
                <div style={{ fontSize: 12, color: '#7A7268', lineHeight: 1.4 }}>
                  Rutas, auditorías y check-in GPS
                </div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#10b981', fontSize: 18, flexShrink: 0 }}>→</div>
            </div>
          </Link>

          <Link href="/flota" style={{ textDecoration: 'none' }}>
            <div
              style={{
                background: '#131313', border: '1px solid rgba(249,115,22,0.25)',
                borderRadius: 18, padding: '18px 18px',
                display: 'flex', alignItems: 'center', gap: 14, cursor: 'pointer',
              }}
              className="card-hover"
            >
              <div style={{
                width: 44, height: 44, borderRadius: 13,
                background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20, flexShrink: 0,
              }}>🚛</div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: '#F4EEDF', marginBottom: 4 }}>Flota</div>
                <div style={{ fontSize: 12, color: '#7A7268', lineHeight: 1.4 }}>
                  Bitácora, rutas y control de vehículos
                </div>
              </div>
              <div style={{ marginLeft: 'auto', color: '#F97316', fontSize: 18, flexShrink: 0 }}>→</div>
            </div>
          </Link>

        </div>

        <LogoutButton />

        <p style={{ textAlign: 'center', fontSize: 10, color: '#2A2520', marginTop: 20, letterSpacing: 1 }}>
          Cervecería El Regreso · Valdivia, Chile
        </p>
      </div>
    </div>
  )
}
