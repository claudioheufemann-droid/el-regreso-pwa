'use client'

import { useState } from 'react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Eye, EyeOff, Mail, Lock } from 'lucide-react'

export default function LoginPage() {
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [showPassword, setShowPass]   = useState(false)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(false)
  const [googleLoading, setGLoading]  = useState(false)
  const router   = useRouter()
  const supabase = createClient()

  async function handleGoogleLogin() {
    setGLoading(true)
    setError('')
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { hd: 'elregresobeer.com' },
      },
    })
    if (oauthError) {
      setError('Error al conectar con Google.')
      setGLoading(false)
    }
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })
    if (authError) {
      setError('Credenciales incorrectas. Verifica tu email y contraseña.')
      setLoading(false)
      return
    }
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('users').select('is_admin').eq('id', user.id).single()
      router.push(profile?.is_admin ? '/' : '/ventas')
    } else {
      router.push('/')
    }
    router.refresh()
  }

  return (
    <>
      <style>{`
        @keyframes lr-spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        .lr-input::placeholder { color: rgba(255,255,255,0.2); }
        .lr-input:-webkit-autofill,
        .lr-input:-webkit-autofill:hover,
        .lr-input:-webkit-autofill:focus {
          -webkit-box-shadow: 0 0 0px 1000px #0E0C09 inset;
          -webkit-text-fill-color: #E8DFC8;
          transition: background-color 5000s ease-in-out 0s;
        }
        .lr-input:focus { outline:none; border-color:rgba(212,175,55,0.45)!important; background:#141008!important; }
        .lr-submit:hover:not(:disabled) { background:#C8A42A!important; box-shadow:0 6px 20px rgba(212,175,55,0.25)!important; }
        .lr-google:hover:not(:disabled) { background:rgba(255,255,255,0.05)!important; border-color:rgba(255,255,255,0.18)!important; }
        .lr-forgot:hover { color:#D4AF37!important; }
      `}</style>

      {/* ── Contenedor fijo — sin scroll ── */}
      <div style={{
        height: '100dvh',
        minHeight: '100dvh',
        background: '#050402',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        fontFamily: "'system-ui',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      }}>

        {/* ══════════════════════════════════════
            HERO — 42% de la pantalla
            👉 Sube tu imagen del camión a:
               public/vehicles/hero-login.jpg
            (fondo oscuro de respaldo mientras no esté)
        ══════════════════════════════════════ */}
        <div style={{
          position: 'relative',
          flex: '0 0 38%',
          overflow: 'hidden',
          background: 'radial-gradient(ellipse at 50% 30%, #1a1610 0%, #0A0806 55%, #050402 100%)',
        }}>
          <Image
            src="/vehicles/hero-login.jpg"
            alt="El Regreso Beer Co."
            fill
            sizes="180vw"
            style={{ objectFit:'cover', objectPosition:'center center',
              transform:'scale(1.45)', transformOrigin:'center 6%',
              filter:'brightness(0.66) saturate(0.88) contrast(1.06)' }}
            priority
          />

          {/* Gradiente — oscuro arriba (texto), claro al medio (camión), oscuro abajo */}
          <div style={{ position:'absolute', inset:0,
            background:'linear-gradient(180deg, rgba(5,4,2,0.82) 0%, rgba(5,4,2,0.52) 30%, rgba(5,4,2,0.12) 54%, rgba(5,4,2,0.5) 82%, #0A0806 100%)' }} />
          <div style={{ position:'absolute', inset:0,
            background:'linear-gradient(90deg, rgba(5,4,2,0.4) 0%, transparent 28%, transparent 72%, rgba(5,4,2,0.4) 100%)' }} />

          {/* Overlay datos SVG */}
          <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}
            viewBox="0 0 400 200" preserveAspectRatio="none">
            <polyline points="0,155 40,148 80,138 115,143 155,122 190,115 225,108 260,95 295,80 330,66 365,55 400,45"
              fill="none" stroke="#D4AF37" strokeWidth="1.6" opacity="0.5" strokeLinecap="round" strokeLinejoin="round"/>
            <polygon points="0,155 40,148 80,138 115,143 155,122 190,115 225,108 260,95 295,80 330,66 365,55 400,45 400,200 0,200"
              fill="url(#gGrad)" opacity="0.07"/>
            <defs>
              <linearGradient id="gGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#D4AF37" stopOpacity="1"/>
                <stop offset="100%" stopColor="#D4AF37" stopOpacity="0"/>
              </linearGradient>
            </defs>
            {[[80,138],[190,115],[295,80],[400,45]].map(([cx,cy],i)=>(
              <circle key={i} cx={cx} cy={cy} r="2.8" fill="#D4AF37" opacity="0.7"/>
            ))}
            {[[284,168,10],[298,158,10],[312,172,10],[326,150,10],[340,164,10],[354,145,10],[368,158,10],[382,138,10]]
              .map(([x,y,h],i)=>(
              <rect key={i} x={x} y={y} width={8} height={h} fill="#D4AF37"
                opacity={i===7?0.48:0.25} rx="1.5"/>
            ))}
          </svg>

          {/* Logo + título — arriba, sobre el cielo oscuro */}
          <div style={{
            position:'absolute', inset:0,
            display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'flex-start',
            paddingTop:'max(env(safe-area-inset-top),12px)',
            gap: 6,
            zIndex: 2,
          }}>
            <div style={{ position:'relative', width:80, height:80 }}>
              <Image src="/logo.png" alt="El Regreso" fill sizes="80px"
                style={{ objectFit:'contain',
                  filter:'drop-shadow(0 0 18px rgba(212,175,55,0.6)) drop-shadow(0 2px 10px rgba(0,0,0,0.95))' }}
                priority/>
            </div>
            <div style={{ textAlign:'center', userSelect:'none' }}>
              <h1 style={{ fontSize:'clamp(28px,7vw,38px)', fontWeight:800, letterSpacing:'4px',
                color:'#FFFFFF', textTransform:'uppercase', margin:'0 0 3px', lineHeight:1,
                textShadow:'0 2px 18px rgba(0,0,0,0.95)' }}>EL REGRESO</h1>
              <p style={{ fontSize:'clamp(15px,3.8vw,20px)', fontWeight:400, letterSpacing:'13px',
                color:'#D4AF37', textTransform:'uppercase', margin:'0 0 0 13px', lineHeight:1,
                textShadow:'0 2px 14px rgba(0,0,0,0.95)' }}>CONTROL</p>
              <div style={{ width:40, height:2, background:'#D4AF37', borderRadius:2, margin:'9px auto 0' }}/>
              <p style={{ fontSize:12.5, color:'rgba(255,255,255,0.6)', margin:'9px 0 0', fontWeight:400,
                textShadow:'0 1px 10px rgba(0,0,0,0.95)' }}>
                Plataforma de Gestión Comercial y Operacional
              </p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════
            SECCIÓN INFERIOR — fondo negro
            Card con borde dorado + footer abajo afuera
        ══════════════════════════════════════ */}
        <div style={{
          flex: 1,
          background: '#0A0806',
          marginTop: -24,
          position: 'relative',
          zIndex: 2,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-between',
          overflow: 'hidden',
          padding: '0 16px 0',
        }}>
          {/* ── CARD borde dorado ── */}
          <div style={{
            width:'100%', maxWidth:440, display:'flex', flexDirection:'column',
            border:'1px solid rgba(212,175,55,0.4)',
            borderRadius:20,
            background:'#13110D',
            boxShadow:'0 10px 40px rgba(0,0,0,0.5)',
            padding:'20px 18px 18px',
          }}>

            {/* Bienvenido */}
            <div style={{ display:'flex', alignItems:'center', gap:14, marginBottom:18 }}>
              <div style={{ width:52, height:52, borderRadius:15, flexShrink:0,
                background:'rgba(212,175,55,0.07)', border:'1px solid rgba(212,175,55,0.22)',
                display:'flex', alignItems:'center', justifyContent:'center' }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none"
                  stroke="rgba(212,175,55,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <h2 style={{ fontSize:16, fontWeight:700, color:'#F0E8D4', margin:0, lineHeight:1.2 }}>Bienvenido</h2>
                <p style={{ fontSize:12, color:'rgba(255,255,255,0.28)', margin:'1px 0 0', fontWeight:400 }}>
                  Ingresa tus credenciales para continuar.
                </p>
              </div>
            </div>

            <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:10 }}>

              {/* Email */}
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'rgba(212,175,55,0.55)',
                  letterSpacing:'2.5px', textTransform:'uppercase', marginBottom:6 }}>
                  Correo Corporativo
                </label>
                <div style={{ position:'relative' }}>
                  <Mail size={13} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)',
                    color:'rgba(255,255,255,0.22)', pointerEvents:'none' }}/>
                  <input className="lr-input" type="email" value={email}
                    onChange={e=>setEmail(e.target.value)}
                    placeholder="tu@elregresobeer.com" required autoComplete="email"
                    style={{ width:'100%', padding:'11px 14px 11px 38px', background:'#0E0C09',
                      border:'1px solid rgba(255,255,255,0.08)', borderRadius:11,
                      fontSize:14, color:'#E8DFC8', boxSizing:'border-box',
                      fontFamily:'inherit', transition:'border-color 0.18s, background 0.18s' }}/>
                </div>
              </div>

              {/* Password */}
              <div>
                <label style={{ display:'block', fontSize:9, fontWeight:700, color:'rgba(212,175,55,0.55)',
                  letterSpacing:'2.5px', textTransform:'uppercase', marginBottom:6 }}>
                  Contraseña
                </label>
                <div style={{ position:'relative' }}>
                  <Lock size={13} style={{ position:'absolute', left:13, top:'50%', transform:'translateY(-50%)',
                    color:'rgba(255,255,255,0.22)', pointerEvents:'none' }}/>
                  <input className="lr-input" type={showPassword?'text':'password'} value={password}
                    onChange={e=>setPassword(e.target.value)}
                    placeholder="Ingresa tu contraseña" required autoComplete="current-password"
                    style={{ width:'100%', padding:'11px 44px 11px 38px', background:'#0E0C09',
                      border:'1px solid rgba(255,255,255,0.08)', borderRadius:11,
                      fontSize:14, color:'#E8DFC8', boxSizing:'border-box',
                      fontFamily:'inherit', transition:'border-color 0.18s, background 0.18s' }}/>
                  <button type="button" onClick={()=>setShowPass(v=>!v)}
                    style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                      background:'none', border:'none', cursor:'pointer',
                      color:'rgba(255,255,255,0.25)', padding:4, display:'flex', alignItems:'center' }}>
                    {showPassword ? <EyeOff size={14}/> : <Eye size={14}/>}
                  </button>
                </div>
              </div>

              {/* Forgot */}
              <div style={{ display:'flex', justifyContent:'flex-end', marginTop:-4 }}>
                <button type="button" className="lr-forgot"
                  style={{ background:'none', border:'none', cursor:'pointer',
                    fontSize:11, color:'rgba(212,175,55,0.42)', fontWeight:500,
                    padding:0, fontFamily:'inherit', transition:'color 0.15s' }}>
                  ¿Olvidaste tu contraseña?
                </button>
              </div>

              {/* Error */}
              {error && (
                <p style={{ fontSize:11.5, color:'#FF7575', textAlign:'center',
                  background:'rgba(255,107,107,0.06)', padding:'8px 12px', borderRadius:9, margin:0,
                  border:'1px solid rgba(255,107,107,0.14)' }}>{error}</p>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading||googleLoading} className="lr-submit"
                style={{ width:'100%', padding:'13px 20px',
                  background: loading?'rgba(212,175,55,0.4)':'#D4AF37',
                  border:'none', borderRadius:11, fontSize:12, fontWeight:700,
                  letterSpacing:'1.5px', textTransform:'uppercase', color:'#0A0700',
                  cursor: loading?'not-allowed':'pointer',
                  transition:'background 0.15s, box-shadow 0.15s',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:9,
                  marginTop:2 }}>
                {loading ? (
                  <>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" style={{ animation:'lr-spin 0.8s linear infinite', flexShrink:0 }}>
                      <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
                    </svg>
                    Verificando...
                  </>
                ) : (
                  <>Ingresar
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12h14M12 5l7 7-7 7"/>
                    </svg>
                  </>
                )}
              </button>

              {/* Divider */}
              <div style={{ display:'flex', alignItems:'center', gap:12, margin:'2px 0' }}>
                <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }}/>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.18)', letterSpacing:'1px' }}>o</span>
                <div style={{ flex:1, height:1, background:'rgba(255,255,255,0.06)' }}/>
              </div>

              {/* Google */}
              <button type="button" onClick={handleGoogleLogin}
                disabled={googleLoading||loading} className="lr-google"
                style={{ width:'100%', padding:'12px 16px', background:'transparent',
                  border:'1px solid rgba(255,255,255,0.1)', borderRadius:11,
                  fontSize:13, fontWeight:600, color:'#C8BEA4',
                  cursor: googleLoading?'not-allowed':'pointer',
                  display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                  transition:'background 0.15s, border-color 0.15s',
                  opacity: googleLoading?0.55:1 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" style={{ flexShrink:0 }}>
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                {googleLoading?'Redirigiendo...':'Continuar con Google Workspace'}
              </button>

            </form>
          </div>

          {/* ── FOOTER (afuera de la card, sobre fondo negro) ── */}
          <div style={{
            display:'flex', flexDirection:'column', alignItems:'center', gap:2,
            padding:'10px 0 max(env(safe-area-inset-bottom),10px)',
          }}>
            <div style={{ width:30, height:30, borderRadius:'50%',
              background:'rgba(212,175,55,0.07)', border:'1px solid rgba(212,175,55,0.14)',
              display:'flex', alignItems:'center', justifyContent:'center', marginBottom:4 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M12 2l3 9H9l3-9z" fill="rgba(212,175,55,0.55)"/>
                <path d="M12 11v10" stroke="rgba(212,175,55,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
                <path d="M9 15c-2-1-3-3-3-5h6" stroke="rgba(212,175,55,0.45)" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
                <path d="M15 15c2-1 3-3 3-5h-6" stroke="rgba(212,175,55,0.45)" strokeWidth="1.3" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <p style={{ fontSize:12, color:'rgba(244,238,223,0.5)', fontWeight:600, margin:0 }}>
              Cervecería El Regreso
            </p>
            <p style={{ fontSize:10.5, color:'rgba(255,255,255,0.18)', margin:0, fontWeight:400 }}>
              Plataforma Corporativa
            </p>
            <p style={{ fontSize:9.5, color:'rgba(212,175,55,0.38)', margin:'3px 0 0',
              fontWeight:600, letterSpacing:'1.5px' }}>v2.0</p>
          </div>

        </div>
      </div>
    </>
  )
}
