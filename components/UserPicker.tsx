'use client'

import { useState } from 'react'
import { Beer, Shield, User } from 'lucide-react'
import { useUser, AppUser } from '@/lib/userContext'

const OPCIONES: { nombre: string; role: AppUser['role']; desc: string; icon: React.ReactNode; color: string }[] = [
  {
    nombre: 'Javier Badilla',
    role: 'vendedor',
    desc: 'Vendedor Canal',
    icon: <User size={22} />,
    color: '#F59E0B',
  },
  {
    nombre: 'Carlos Urrejola',
    role: 'vendedor',
    desc: 'Vendedor Canal',
    icon: <User size={22} />,
    color: '#60A5FA',
  },
  {
    nombre: 'Administrador',
    role: 'admin',
    desc: 'Acceso completo',
    icon: <Shield size={22} />,
    color: '#A78BFA',
  },
]

export default function UserPicker() {
  const { setUser } = useUser()
  const [selected, setSelected] = useState<string | null>(null)

  function confirm() {
    const op = OPCIONES.find(o => o.nombre === selected)
    if (!op) return
    setUser({ nombre: op.nombre, role: op.role })
  }

  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
    }}>
      <div style={{ width: '100%', maxWidth: 380 }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            width: 64, height: 64, background: '#F59E0B', borderRadius: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Beer size={32} color="#080808" />
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 900, color: 'white', letterSpacing: '-0.5px' }}>
            El Regreso
          </h1>
          <p style={{ fontSize: 13, color: '#888', marginTop: 6 }}>
            Selecciona tu perfil para continuar
          </p>
        </div>

        {/* Opciones */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
          {OPCIONES.map(op => {
            const active = selected === op.nombre
            return (
              <button
                key={op.nombre}
                onClick={() => setSelected(op.nombre)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: '14px 18px', borderRadius: 14,
                  border: `2px solid ${active ? op.color : '#222'}`,
                  background: active ? `${op.color}12` : '#141414',
                  cursor: 'pointer', transition: 'all 0.15s', textAlign: 'left',
                  width: '100%',
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                  background: active ? `${op.color}20` : '#1E1E1E',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: active ? op.color : '#555',
                  transition: 'all 0.15s',
                }}>
                  {op.icon}
                </div>
                <div>
                  <p style={{ fontWeight: 700, fontSize: 15, color: active ? 'white' : '#aaa', lineHeight: 1.2 }}>
                    {op.nombre}
                  </p>
                  <p style={{ fontSize: 12, color: active ? op.color : '#555', marginTop: 2 }}>
                    {op.desc}
                  </p>
                </div>
                {active && (
                  <div style={{
                    marginLeft: 'auto', width: 20, height: 20, borderRadius: '50%',
                    background: op.color, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="#000" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
              </button>
            )
          })}
        </div>

        <button
          onClick={confirm}
          disabled={!selected}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 14,
            fontWeight: 800, fontSize: 15, border: 'none',
            cursor: selected ? 'pointer' : 'not-allowed',
            background: selected ? '#F59E0B' : '#1E1E1E',
            color: selected ? '#080808' : '#444',
            transition: 'all 0.15s',
          }}
        >
          Ingresar
        </button>

        <p style={{ fontSize: 11, color: '#444', textAlign: 'center', marginTop: 16 }}>
          Tu selección queda guardada en este dispositivo
        </p>
      </div>
    </div>
  )
}
