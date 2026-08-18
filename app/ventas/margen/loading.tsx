export default function MargenLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 1300, margin: '0 auto', width: '100%' }}>
      <div className="er-sk" style={{ height: 10, width: '26%', borderRadius: 6, marginBottom: 8 }} />
      <div className="er-sk" style={{ height: 26, width: '46%', borderRadius: 8, marginBottom: 16 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 14 }}>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="er-sk" style={{ height: 90, borderRadius: 14 }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="er-sk" style={{ height: 34, width: 90, borderRadius: 20, flexShrink: 0 }} />
        ))}
      </div>
      <div className="er-sk" style={{ height: 420, width: '100%', borderRadius: 16 }} />

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
