'use client'

export default function OfflinePage() {
  return (
    <div style={{
      minHeight: '100vh', background: '#0A0A0A',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      padding: '24px', fontFamily: 'system-ui, -apple-system, sans-serif',
      color: '#F4EEDF', textAlign: 'center',
    }}>
      <div style={{ fontSize: 64, marginBottom: 24 }}>📡</div>
      <h1 style={{ fontSize: 24, fontWeight: 900, color: '#D4AF37', letterSpacing: 2, textTransform: 'uppercase', margin: '0 0 12px' }}>
        Sin Conexión
      </h1>
      <p style={{ fontSize: 14, color: '#7A7268', maxWidth: 300, lineHeight: 1.6 }}>
        No hay conexión a internet. Verifica tu red y vuelve a intentarlo.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 32, padding: '14px 28px', background: '#D4AF37',
          border: 'none', borderRadius: 12, fontSize: 13,
          fontWeight: 800, color: '#0A0A0A', cursor: 'pointer',
          letterSpacing: 1, textTransform: 'uppercase',
        }}
      >
        Reintentar
      </button>
    </div>
  )
}
