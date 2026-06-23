export default function TerrenoLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 900, margin: '0 auto', width: '100%' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ flex: 1 }}>
          <div className="er-sk" style={{ height: 10, width: '28%', borderRadius: 6, marginBottom: 8 }} />
          <div className="er-sk" style={{ height: 26, width: '52%', borderRadius: 8 }} />
        </div>
        <div className="er-sk" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
      </div>

      {/* KPI chips */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
        {[68, 52, 60].map((w, i) => (
          <div key={i} className="er-sk" style={{ height: 34, width: w, borderRadius: 10 }} />
        ))}
      </div>

      {/* Visita cards */}
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="er-sk" style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="er-sk" style={{ height: 14, width: `${62 - i * 5}%`, borderRadius: 6, marginBottom: 7 }} />
              <div className="er-sk" style={{ height: 10, width: `${40 - i * 3}%`, borderRadius: 5 }} />
            </div>
            <div className="er-sk" style={{ width: 54, height: 22, borderRadius: 8, flexShrink: 0 }} />
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
