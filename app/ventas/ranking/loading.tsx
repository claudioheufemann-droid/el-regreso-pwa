export default function RankingLoading() {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(180deg, #0A090F 0%, #080808 100%)', padding: '20px 16px', maxWidth: 640, margin: '0 auto', width: '100%' }}>
      <div className="er-sk" style={{ height: 10, width: '30%', borderRadius: 6, marginBottom: 8 }} />
      <div className="er-sk" style={{ height: 26, width: '40%', borderRadius: 8, marginBottom: 20 }} />

      <div className="er-sk" style={{ height: 80, width: '100%', borderRadius: 18, marginBottom: 14 }} />
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <div className="er-sk" style={{ height: 38, flex: 1, borderRadius: 11 }} />
        <div className="er-sk" style={{ height: 38, flex: 1, borderRadius: 11 }} />
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="er-sk" style={{ height: 38, width: 90, borderRadius: 20, flexShrink: 0 }} />
        ))}
      </div>

      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="er-sk" style={{ height: 64, width: '100%', borderRadius: 16, marginBottom: 7 }} />
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
