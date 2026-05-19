'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'

interface Props {
  onClose: () => void
  userName: string
  userEmail: string
}

type Section = 'main' | 'password'

export default function SettingsPanel({ onClose, userName, userEmail }: Props) {
  const [section, setSection] = useState<Section>('main')
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  // Contraseña
  const [currentPwd, setCurrentPwd] = useState('')
  const [newPwd, setNewPwd] = useState('')
  const [confirmPwd, setConfirmPwd] = useState('')
  const [showPwds, setShowPwds] = useState(false)
  const [pwdLoading, setPwdLoading] = useState(false)
  const [pwdError, setPwdError] = useState('')
  const [pwdSuccess, setPwdSuccess] = useState(false)

  // Notificaciones push
  const [notifStatus, setNotifStatus] = useState<'idle' | 'granted' | 'denied' | 'unsupported' | 'loading'>('idle')

  // Logout
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    const saved = (document.documentElement.getAttribute('data-theme') as 'dark' | 'light') ?? 'dark'
    setTheme(saved)
    // Verificar estado actual de notificaciones
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setNotifStatus('unsupported')
    } else if (Notification.permission === 'granted') {
      setNotifStatus('granted')
    } else if (Notification.permission === 'denied') {
      setNotifStatus('denied')
    }
  }, [])

  async function subscribeNotifications() {
    if (!('serviceWorker' in navigator)) return
    setNotifStatus('loading')
    try {
      const reg = await navigator.serviceWorker.register('/sw.js')
      await navigator.serviceWorker.ready
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') { setNotifStatus('denied'); return }
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (!vapidKey) { setNotifStatus('unsupported'); return }
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      })
      setNotifStatus('granted')
    } catch { setNotifStatus('idle') }
  }

  function urlBase64ToUint8Array(base64String: string) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = window.atob(base64)
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
  }

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('rc-theme', next)
  }

  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault()
    setPwdError('')
    if (newPwd.length < 6) { setPwdError('La contraseña debe tener al menos 6 caracteres.'); return }
    if (newPwd !== confirmPwd) { setPwdError('Las contraseñas no coinciden.'); return }

    setPwdLoading(true)
    try {
      const supabase = createClient()
      // Verificar contraseña actual reautenticando
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: userEmail, password: currentPwd })
      if (signInErr) { setPwdError('Contraseña actual incorrecta.'); setPwdLoading(false); return }

      const { error } = await supabase.auth.updateUser({ password: newPwd })
      if (error) { setPwdError('Error al actualizar. Intenta nuevamente.'); setPwdLoading(false); return }

      // Marcar must_change_password = false
      await fetch('/api/user/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ must_change_password: false }) })

      setPwdSuccess(true)
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('')
      setTimeout(() => { setPwdSuccess(false); setSection('main') }, 2000)
    } catch {
      setPwdError('Error inesperado. Intenta nuevamente.')
    }
    setPwdLoading(false)
  }

  async function handleLogout() {
    setLoggingOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const inputStyle: React.CSSProperties = {
    fontSize: 14, padding: '12px 14px', borderRadius: 10,
    width: '100%', marginTop: 6,
  }
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, color: 'var(--muted)',
    letterSpacing: 1.4, textTransform: 'uppercase', display: 'block',
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end"
      style={{ background: 'rgba(0,0,0,0.7)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="sheet-up w-full safe-bottom" style={{
        background: 'var(--surface)', borderTop: '2px solid rgba(212,175,55,0.25)',
        borderRadius: '20px 20px 0 0', maxHeight: '88vh', display: 'flex', flexDirection: 'column',
      }}>

        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 6px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(128,128,128,0.25)' }} />
        </div>

        {/* Header */}
        <div style={{ padding: '4px 20px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(128,128,128,0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {section !== 'main' && (
              <button onClick={() => { setSection('main'); setPwdError(''); setPwdSuccess(false) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--gold)', fontSize: 18, padding: '2px 6px 2px 0' }}>←</button>
            )}
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: 'var(--cream)' }}>
                {section === 'main' ? '⚙ Configuración' : '🔑 Cambiar Contraseña'}
              </div>
              {section === 'main' && <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 1 }}>{userName}</div>}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(128,128,128,0.1)', border: 'none', color: 'var(--cream)', cursor: 'pointer', fontSize: 16, padding: 8, borderRadius: '50%' }}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>

          {/* ── SECCIÓN PRINCIPAL ── */}
          {section === 'main' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* Cambiar contraseña */}
              <button
                onClick={() => setSection('password')}
                className="touch-active"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px', borderRadius: 14, cursor: 'pointer',
                  background: 'var(--surface2)', border: '1px solid rgba(128,128,128,0.1)',
                  textAlign: 'left', width: '100%',
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(212,175,55,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🔑</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>Cambiar Contraseña</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Actualiza tu contraseña de acceso</div>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: 16 }}>›</span>
              </button>

              {/* Tema */}
              <div
                onClick={toggleTheme}
                className="touch-active"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px', borderRadius: 14, cursor: 'pointer',
                  background: 'var(--surface2)', border: '1px solid rgba(128,128,128,0.1)',
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, background: theme === 'light' ? 'rgba(255,220,50,0.15)' : 'rgba(100,100,180,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                  {theme === 'dark' ? '🌙' : '☀️'}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>
                    {theme === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
                    {theme === 'dark' ? 'Toca para cambiar a modo claro' : 'Toca para cambiar a modo oscuro'}
                  </div>
                </div>
                {/* Toggle switch */}
                <div style={{
                  width: 44, height: 26, borderRadius: 13, flexShrink: 0, position: 'relative',
                  background: theme === 'light' ? '#D4AF37' : 'rgba(128,128,128,0.3)',
                  transition: 'background 0.2s',
                }}>
                  <div style={{
                    position: 'absolute', top: 3, left: theme === 'light' ? 21 : 3,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s',
                    boxShadow: '0 1px 4px rgba(0,0,0,0.3)',
                  }} />
                </div>
              </div>

              {/* Notificaciones push */}
              {notifStatus !== 'unsupported' && (
                <div
                  onClick={notifStatus === 'idle' || notifStatus === 'loading' ? subscribeNotifications : undefined}
                  className={notifStatus === 'idle' ? 'touch-active' : ''}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '16px', borderRadius: 14,
                    cursor: notifStatus === 'idle' ? 'pointer' : 'default',
                    background: notifStatus === 'granted' ? 'rgba(74,154,58,0.07)' : 'var(--surface2)',
                    border: `1px solid ${notifStatus === 'granted' ? 'rgba(74,154,58,0.2)' : 'rgba(128,128,128,0.1)'}`,
                  }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 12, background: notifStatus === 'granted' ? 'rgba(74,154,58,0.15)' : 'rgba(128,128,128,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
                    {notifStatus === 'granted' ? '🔔' : notifStatus === 'denied' ? '🔕' : '🔔'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--cream)' }}>Notificaciones</div>
                    <div style={{ fontSize: 11, color: notifStatus === 'granted' ? '#4A9A3A' : notifStatus === 'denied' ? '#FF6B6B' : 'var(--muted)', marginTop: 2 }}>
                      {notifStatus === 'granted' && '✓ Activadas — recibirás alertas de tareas'}
                      {notifStatus === 'denied' && 'Bloqueadas — actívalas en ajustes del navegador'}
                      {notifStatus === 'idle' && 'Toca para activar alertas de tareas'}
                      {notifStatus === 'loading' && 'Activando...'}
                    </div>
                  </div>
                  {notifStatus === 'idle' && (
                    <div style={{ width: 44, height: 26, borderRadius: 13, flexShrink: 0, background: 'rgba(128,128,128,0.3)' }}>
                      <div style={{ position: 'relative', top: 3, left: 3, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                    </div>
                  )}
                  {notifStatus === 'granted' && (
                    <div style={{ width: 44, height: 26, borderRadius: 13, flexShrink: 0, background: '#4A9A3A', position: 'relative' }}>
                      <div style={{ position: 'absolute', top: 3, left: 21, width: 20, height: 20, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,0.3)' }} />
                    </div>
                  )}
                </div>
              )}

              {/* Divider */}
              <div style={{ height: 1, background: 'rgba(128,128,128,0.1)', margin: '4px 0' }} />

              {/* Cerrar sesión */}
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="touch-active"
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '16px', borderRadius: 14, cursor: 'pointer',
                  background: 'rgba(255,68,68,0.06)', border: '1px solid rgba(255,68,68,0.15)',
                  textAlign: 'left', width: '100%',
                  opacity: loggingOut ? 0.5 : 1,
                }}
              >
                <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>🚪</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#FF6B6B' }}>Cerrar Sesión</div>
                  <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{userEmail}</div>
                </div>
              </button>

            </div>
          )}

          {/* ── SECCIÓN CONTRASEÑA ── */}
          {section === 'password' && (
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={labelStyle}>Contraseña Actual</label>
                <div style={{ position: 'relative' }}>
                  <input type={showPwds ? 'text' : 'password'} value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} placeholder="Tu contraseña actual" required style={{ ...inputStyle, paddingRight: 44 }} />
                  <button type="button" onClick={() => setShowPwds(v => !v)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'var(--muted)', marginTop: 3 }} tabIndex={-1}>{showPwds ? '🙈' : '👁'}</button>
                </div>
              </div>

              <div>
                <label style={labelStyle}>Nueva Contraseña</label>
                <input type={showPwds ? 'text' : 'password'} value={newPwd} onChange={e => setNewPwd(e.target.value)} placeholder="Mínimo 6 caracteres" required style={inputStyle} />
              </div>

              <div>
                <label style={labelStyle}>Confirmar Nueva Contraseña</label>
                <input type={showPwds ? 'text' : 'password'} value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} placeholder="Repite la nueva contraseña" required style={inputStyle} />
              </div>

              {pwdError && (
                <div style={{ fontSize: 12, color: '#FF7070', padding: '10px 14px', background: 'rgba(255,68,68,0.08)', borderRadius: 10, border: '1px solid rgba(255,68,68,0.2)' }}>
                  {pwdError}
                </div>
              )}
              {pwdSuccess && (
                <div style={{ fontSize: 12, color: '#4A9A3A', padding: '10px 14px', background: 'rgba(74,154,58,0.08)', borderRadius: 10, border: '1px solid rgba(74,154,58,0.25)', textAlign: 'center', fontWeight: 700 }}>
                  ✓ Contraseña actualizada correctamente
                </div>
              )}

              <button type="submit" disabled={pwdLoading || !currentPwd || !newPwd || !confirmPwd} className="touch-active" style={{
                padding: '14px', borderRadius: 12, cursor: 'pointer',
                background: 'rgba(212,175,55,0.12)', border: '1px solid rgba(212,175,55,0.35)',
                fontSize: 13, fontWeight: 700, color: 'var(--gold)',
                opacity: pwdLoading || !currentPwd || !newPwd || !confirmPwd ? 0.4 : 1,
              }}>
                {pwdLoading ? 'Actualizando...' : 'Actualizar Contraseña'}
              </button>
            </form>
          )}

        </div>
      </div>
    </div>
  )
}
