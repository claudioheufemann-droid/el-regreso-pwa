export default function GestionLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 1500, margin: '0 auto', width: '100%' }}>
      <div className="er-sk" style={{ height: 10, width: '24%', borderRadius: 6, marginBottom: 8 }} />
      <div className="er-sk" style={{ height: 26, width: '38%', borderRadius: 8, marginBottom: 20 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 18 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="er-sk" style={{ height: 90, borderRadius: 14 }} />
        ))}
      </div>

      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', marginBottom: 6, background: 'rgba(255,255,255,0.025)', borderRadius: 12 }}>
          <div className="er-sk" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="er-sk" style={{ height: 12, width: `${60 - i * 4}%`, borderRadius: 6, marginBottom: 5 }} />
            <div className="er-sk" style={{ height: 9, width: `${34 - i * 2}%`, borderRadius: 5 }} />
          </div>
          <div className="er-sk" style={{ width: 60, height: 20, borderRadius: 8, flexShrink: 0 }} />
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
