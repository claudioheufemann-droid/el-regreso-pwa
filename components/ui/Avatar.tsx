const PALETTE = ['#E67E22','#5B8AA8','#C8542A','#D4AF37','#9B59B6','#4A7A3A']

export default function Avatar({ iniciales, userId, size = 28 }: { iniciales: string; userId: string; size?: number }) {
  const idx = userId.charCodeAt(0) % PALETTE.length
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: PALETTE[idx], display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.36, fontWeight: 700, color: '#0A0A0A', flexShrink: 0,
    }}>
      {iniciales}
    </div>
  )
}
