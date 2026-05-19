export default function StatTile({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{
      flex: 1, padding: '14px 16px', borderRadius: 4,
      background: '#0E0E0E', border: '1px solid rgba(255,255,255,0.05)',
    }}>
      <div style={{ fontSize: 28, fontWeight: 900, color, letterSpacing: -1, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 9, color: '#3A3530', letterSpacing: 1.2, marginTop: 4, textTransform: 'uppercase' }}>
        {label}
      </div>
    </div>
  )
}
