"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { signIn } from 'next-auth/react';

export default function Home() {
  const router = useRouter();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // --- TEMPORAL: Bypass directo para pruebas ---
    router.push('/terreno');
    
    /* --- CÓDIGO ORIGINAL DE AUTENTICACIÓN (GUARDADO PARA DESPUÉS) ---
    setError('');
    setLoading(true);

    if (isRegister) {
      if (!email.endsWith('@elregresobeer.com')) {
        setError('Solo se permiten correos corporativos (@elregresobeer.com).');
        setLoading(false);
        return;
      }
      if (password !== confirmPassword) {
        setError('Las contraseñas no coinciden.');
        setLoading(false);
        return;
      }
      
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, password })
        });
        
        const data = await res.json();
        
        if (res.ok) {
          alert('Cuenta creada exitosamente. Iniciando sesión automáticamente...');
          const signInRes = await signIn('credentials', { email, password, redirect: false });
          if (signInRes?.error) setError(signInRes.error);
          else router.push('/terreno');
        } else {
          setError(data.message || 'Error al crear la cuenta');
        }
      } catch (err) {
        setError('Error de red al intentar registrar');
      }
      setLoading(false);
      
    } else {
      if (!email.endsWith('@elregresobeer.com')) {
        setError('Solo se permiten correos corporativos (@elregresobeer.com).');
        setLoading(false);
        return;
      }
      
      const res = await signIn('credentials', { email, password, redirect: false });
      if (res?.error) setError(res.error);
      else router.push('/terreno');
      setLoading(false);
    }
    */
  };

  return (
    <main style={{ minHeight: '100vh', padding: '24px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ maxWidth: '450px', width: '100%', textAlign: 'center' }}>
        <h1 style={{ fontSize: '3rem', color: 'var(--color-yellow)', marginBottom: '16px' }}>El Regreso</h1>
        <p style={{ fontSize: '1.2rem', marginBottom: '32px' }}>Plataforma de Gestión Comercial y Auditoría en Terreno</p>
        
        <form onSubmit={handleSubmit} className="card" style={{ display: 'flex', flexDirection: 'column', gap: '16px', textAlign: 'left', backgroundColor: '#1a1a1a', padding: '32px', borderRadius: '8px' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '8px', textAlign: 'center' }}>
            Portal de Acceso
          </h2>
          
          <p style={{ textAlign: 'center', color: '#888', marginBottom: '16px', fontSize: '0.9rem' }}>
            Autenticación temporalmente desactivada para facilitar pruebas rápidas.
          </p>

          <button type="submit" style={{ marginTop: '8px', padding: '12px', backgroundColor: 'var(--color-yellow)', color: 'black', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', border: 'none', fontSize: '1rem' }}>
            Ingresar a Terreno (Modo Pruebas)
          </button>
        </form>
      </div>
    </main>
  );
}
