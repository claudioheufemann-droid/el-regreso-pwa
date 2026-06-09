export default function MisionesLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 600, margin: '0 auto', width: '100%' }}>
      {/* Header skeleton */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 22 }}>
        <div style={{ flex: 1 }}>
          <div className="er-sk" style={{ height: 10, width: '24%', borderRadius: 6, marginBottom: 8 }} />
          <div className="er-sk" style={{ height: 26, width: '44%', borderRadius: 8 }} />
        </div>
        <div className="er-sk" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
      </div>

      {/* Progress banner */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
          <div className="er-sk" style={{ height: 12, width: '38%', borderRadius: 6 }} />
          <div className="er-sk" style={{ height: 22, width: '15%', borderRadius: 6 }} />
        </div>
        <div className="er-sk" style={{ height: 8, width: '100%', borderRadius: 8 }} />
      </div>

      {/* Misión cards */}
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 14, padding: '14px 16px', marginBottom: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
            <div className="er-sk" style={{ width: 36, height: 36, borderRadius: 10, flexShrink: 0 }} />
            <div style={{ flex: 1 }}>
              <div className="er-sk" style={{ height: 14, width: `${58 - i * 4}%`, borderRadius: 6, marginBottom: 7 }} />
              <div className="er-sk" style={{ height: 10, width: `${35 - i * 3}%`, borderRadius: 5 }} />
            </div>
            <div className="er-sk" style={{ width: 44, height: 20, borderRadius: 8, flexShrink: 0 }} />
          </div>
          <div className="er-sk" style={{ height: 6, width: '100%', borderRadius: 6 }} />
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
