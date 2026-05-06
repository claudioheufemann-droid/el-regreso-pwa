"use client";

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    // Acceso libre temporal para desarrollo
    router.push('/terreno');
  };

  return (
    <main style={{ minHeight: '100vh', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '600px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', color: 'var(--color-yellow)', marginBottom: '16px' }}>El Regreso</h1>
        <p style={{ fontSize: '1.2rem', marginBottom: '32px' }}>Plataforma de Gestión Comercial y Auditoría en Terreno</p>
        
        <form onSubmit={handleLogin} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '16px', textAlign: 'center' }}>Portal de Acceso</h2>
          
          <input 
            type="email" 
            placeholder="Correo Electrónico" 
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#111', color: 'white' }}
          />
          <input 
            type="password" 
            placeholder="Contraseña" 
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            style={{ padding: '12px', borderRadius: '4px', border: '1px solid #333', backgroundColor: '#111', color: 'white' }}
          />
          
          <button type="submit" style={{ marginTop: '16px', padding: '12px', backgroundColor: 'var(--color-yellow)', color: 'black', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer' }}>
            Iniciar Sesión
          </button>
        </form>

        <div className="flex-col-to-row" style={{ marginTop: '32px', justifyContent: 'center', gap: '12px' }}>
          <Link href="/terreno" style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: 'var(--color-yellow)', color: 'black', borderRadius: '4px', fontWeight: 600 }}>
            Iniciar Visitas a Terreno
          </Link>
          <Link href="/terreno/catalogo" style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: 'transparent', border: '1px solid var(--color-yellow)', color: 'var(--color-yellow)', borderRadius: '4px', fontWeight: 600 }}>
            Catálogo & Social Selling
          </Link>
          <Link href="/admin/dashboard" style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: 'transparent', border: '1px solid var(--color-gray-light)', color: 'var(--color-gray-light)', borderRadius: '4px', fontWeight: 600 }}>
            Panel de Gerencia
          </Link>
        </div>
      </div>
    </main>
  );
}
