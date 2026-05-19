import React from 'react';
import Link from 'next/link';

export default function TerrenoPlaceholder() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6" style={{ background: '#080808' }}>
      <div className="w-full max-w-md text-center">
        <div style={{
          width: 80, height: 80, borderRadius: 24, margin: '0 auto 24px',
          background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.3)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 36
        }}>
          📍
        </div>
        
        <h1 style={{ fontSize: 28, fontWeight: 900, color: '#F4EEDF', marginBottom: 12, letterSpacing: '-0.5px' }}>
          Módulo de Terreno
        </h1>
        
        <p style={{ fontSize: 15, color: '#7A7268', lineHeight: 1.5, marginBottom: 32 }}>
          Este módulo está actualmente en preparación. Aquí integraremos las rutas, auditorías y check-in GPS para el equipo de ventas en la calle.
        </p>

        <div style={{ 
          background: '#131313', border: '1px dashed rgba(212,175,55,0.3)', 
          borderRadius: 16, padding: '24px', marginBottom: 32, textAlign: 'left'
        }}>
          <h3 style={{ color: '#D4AF37', fontSize: 14, fontWeight: 700, marginBottom: 8 }}>⚠️ Falta el código fuente</h3>
          <p style={{ color: '#9A9288', fontSize: 13, lineHeight: 1.4 }}>
            No se encontró el código de esta aplicación en los repositorios actuales. Si tienes el código de "Venta en Terreno" en otro chat o documento, por favor proporciónalo para unificarlo aquí.
          </p>
        </div>

        <Link href="/" style={{ textDecoration: 'none' }}>
          <button style={{
            background: 'rgba(212,175,55,0.1)', border: '1px solid rgba(212,175,55,0.4)',
            color: '#D4AF37', fontWeight: 600, padding: '14px 28px', borderRadius: 12,
            fontSize: 15, cursor: 'pointer', transition: 'all 0.2s ease'
          }}>
            ← Volver al Hub Central
          </button>
        </Link>
      </div>
    </div>
  );
}
