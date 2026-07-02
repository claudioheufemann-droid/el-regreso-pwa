export default function ActividadLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 1000, margin: '0 auto', width: '100%' }}>
      <div className="er-sk" style={{ height: 10, width: '30%', borderRadius: 6, marginBottom: 8 }} />
      <div className="er-sk" style={{ height: 26, width: '40%', borderRadius: 8, marginBottom: 16 }} />

      <div style={{ display: 'flex', gap: 6, marginBottom: 18 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="er-sk" style={{ height: 36, width: 80, borderRadius: 20, flexShrink: 0 }} />
        ))}
      </div>

      {[0, 1].map(g => (
        <div key={g} style={{ marginBottom: 16 }}>
          <div className="er-sk" style={{ height: 10, width: 60, borderRadius: 6, marginBottom: 8 }} />
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', marginBottom: 1, background: 'rgba(255,255,255,0.025)', borderRadius: i === 0 ? '14px 14px 0 0' : i === 2 ? '0 0 14px 14px' : 0 }}>
              <div className="er-sk" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div className="er-sk" style={{ height: 12, width: `${56 - i * 5}%`, borderRadius: 6, marginBottom: 5 }} />
                <div className="er-sk" style={{ height: 9, width: `${34 - i * 2}%`, borderRadius: 5 }} />
              </div>
            </div>
          ))}
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
