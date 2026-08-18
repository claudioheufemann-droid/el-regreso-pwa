export default function ClientesLoading() {
  return (
    <div style={{ padding: '20px 16px', maxWidth: 1700, margin: '0 auto', width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <div style={{ flex: 1 }}>
          <div className="er-sk" style={{ height: 10, width: '26%', borderRadius: 6, marginBottom: 8 }} />
          <div className="er-sk" style={{ height: 26, width: '46%', borderRadius: 8 }} />
        </div>
        <div className="er-sk" style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0 }} />
      </div>

      <div className="er-sk" style={{ height: 46, width: '100%', borderRadius: 12, marginBottom: 16 }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, marginBottom: 18 }}>
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="er-sk" style={{ height: 64, borderRadius: 12 }} />
        ))}
      </div>

      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div className="er-sk" style={{ width: 30, height: 30, borderRadius: '50%', flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div className="er-sk" style={{ height: 12, width: `${62 - i * 4}%`, borderRadius: 6, marginBottom: 5 }} />
            <div className="er-sk" style={{ height: 9, width: `${36 - i * 2}%`, borderRadius: 5 }} />
          </div>
          <div className="er-sk" style={{ width: 56, height: 18, borderRadius: 8, flexShrink: 0 }} />
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
