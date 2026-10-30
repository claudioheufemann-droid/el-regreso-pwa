// Esqueleto con la misma paleta clara de la pantalla (CarteraClient.tsx).
export default function ClientesLoading() {
  return (
    <div style={{ background: '#F1F5F9', minHeight: '100dvh', flex: 1 }}>
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="ct-skl" style={{ height: 36, width: 96, borderRadius: 100 }} />
        <div>
          <div className="ct-skl" style={{ height: 22, width: '40%', borderRadius: 8, marginBottom: 6 }} />
          <div className="ct-skl" style={{ height: 11, width: '62%', borderRadius: 6 }} />
        </div>
        <div className="ct-skl" style={{ height: 46, borderRadius: 12 }} />
        <div className="ct-skl" style={{ height: 130, borderRadius: 14 }} />
        <div className="ct-skl" style={{ height: 260, borderRadius: 14 }} />
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="ct-skl" style={{ height: 72, borderRadius: 12 }} />
        ))}
      </div>
      <style>{`
        @keyframes ctskl { 0% { opacity: .55 } 50% { opacity: 1 } 100% { opacity: .55 } }
        .ct-skl { background: #E2E8F0; animation: ctskl 1.3s ease-in-out infinite }
      `}</style>
    </div>
  )
}
