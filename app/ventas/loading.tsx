// Fallback instantáneo de navegación (Suspense nativo de Next).
// Se muestra al toque al cambiar de sección mientras el servidor renderiza.
export default function VentasLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 1200, margin: '0 auto', width: '100%' }}>
      {/* Encabezado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 22 }}>
        <div style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid rgba(212,175,55,0.2)', borderTopColor: '#D4AF37', animation: 'erspin 0.8s linear infinite', flexShrink: 0 }} />
        <div style={{ flex: 1 }}>
          <div className="er-sk" style={{ height: 16, width: '38%', borderRadius: 7, marginBottom: 8 }} />
          <div className="er-sk" style={{ height: 11, width: '22%', borderRadius: 6 }} />
        </div>
      </div>

      {/* Fila de KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 16 }} className="kpi-grid-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px' }}>
            <div className="er-sk" style={{ height: 10, width: '55%', borderRadius: 6, marginBottom: 12 }} />
            <div className="er-sk" style={{ height: 24, width: '45%', borderRadius: 7 }} />
          </div>
        ))}
      </div>

      {/* Bloques de contenido */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 16px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 14 }}>
          <div className="er-sk" style={{ width: 44, height: 44, borderRadius: 12, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="er-sk" style={{ height: 13, width: `${55 - i * 6}%`, borderRadius: 6, marginBottom: 8 }} />
            <div className="er-sk" style={{ height: 10, width: `${38 - i * 4}%`, borderRadius: 6 }} />
          </div>
          <div className="er-sk" style={{ width: 60, height: 22, borderRadius: 8, flexShrink: 0 }} />
        </div>
      ))}

      <style>{`
        @keyframes erspin { to { transform: rotate(360deg) } }
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
