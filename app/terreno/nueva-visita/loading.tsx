export default function NuevaVisitaLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#080808', padding: '20px 16px', maxWidth: 1300, margin: '0 auto', width: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <div className="er-sk" style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="er-sk" style={{ height: 10, width: '30%', borderRadius: 6, marginBottom: 7 }} />
          <div className="er-sk" style={{ height: 20, width: '55%', borderRadius: 8 }} />
        </div>
      </div>

      {/* Step bar */}
      <div className="er-sk" style={{ height: 3, width: '100%', borderRadius: 2, marginBottom: 24 }} />

      {/* Buscador */}
      <div className="er-sk" style={{ height: 46, width: '100%', borderRadius: 12, marginBottom: 16 }} />

      {/* Lista de clientes */}
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="er-sk" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="er-sk" style={{ height: 12, width: `${60 - i * 4}%`, borderRadius: 6, marginBottom: 5 }} />
            <div className="er-sk" style={{ height: 9, width: `${38 - i * 2}%`, borderRadius: 5 }} />
          </div>
        </div>
      ))}

      <style>{`
        @keyframes ershimmer { 0% { background-position: -360px 0 } 100% { background-position: 360px 0 } }
        .er-sk {
          background: linear-gradient(90deg, rgba(255,255,255,0.04) 25%, rgba(255,255,255,0.10) 37%, rgba(255,255,255,0.04) 63%);
          background-size: 720px 100%;
          animation: ershimmer 1.3s ease-in-out infinite;
        }
      `}</style>
    </div>
  )
}
