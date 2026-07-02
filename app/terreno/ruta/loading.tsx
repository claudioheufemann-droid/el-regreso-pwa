export default function RutaLoading() {
  return (
    <div style={{ minHeight: '100vh', background: '#080808', padding: '20px 16px', maxWidth: 960, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10 }}>
        <div className="er-sk" style={{ height: 10, width: 70, borderRadius: 6 }} />
      </div>
      <div className="er-sk" style={{ height: 10, width: '40%', borderRadius: 6, marginBottom: 8 }} />
      <div className="er-sk" style={{ height: 26, width: '60%', borderRadius: 8, marginBottom: 20 }} />

      <div className="er-sk" style={{ height: 48, width: '100%', borderRadius: 16, marginBottom: 14 }} />
      <div className="er-sk" style={{ height: 46, width: '100%', borderRadius: 12, marginBottom: 16 }} />

      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 6, background: 'rgba(255,255,255,0.025)', borderRadius: 12 }}>
          <div className="er-sk" style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="er-sk" style={{ height: 12, width: `${58 - i * 4}%`, borderRadius: 6, marginBottom: 5 }} />
            <div className="er-sk" style={{ height: 9, width: `${36 - i * 2}%`, borderRadius: 5 }} />
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
