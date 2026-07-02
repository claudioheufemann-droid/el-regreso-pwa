import { ImageResponse } from 'next/og'

export const runtime = 'edge'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const w = parseInt(searchParams.get('w') ?? '1170')
  const h = parseInt(searchParams.get('h') ?? '2532')

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0A0A0A',
          gap: 0,
        }}
      >
        {/* Gold ring */}
        <div style={{
          width: 160,
          height: 160,
          borderRadius: '50%',
          border: '3px solid #D4AF37',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 36,
        }}>
          <div style={{
            width: 130,
            height: 130,
            borderRadius: '50%',
            background: 'rgba(212,175,55,0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <div style={{
              fontSize: 72,
              color: '#D4AF37',
              fontWeight: 900,
              letterSpacing: -2,
            }}>ER</div>
          </div>
        </div>

        {/* Name */}
        <div style={{
          fontSize: 52,
          fontWeight: 900,
          color: '#F4EEDF',
          letterSpacing: -1,
          marginBottom: 12,
        }}>El Regreso</div>

        <div style={{
          fontSize: 22,
          fontWeight: 600,
          color: '#D4AF37',
          letterSpacing: 6,
          textTransform: 'uppercase',
        }}>Control</div>

        {/* Tagline */}
        <div style={{
          position: 'absolute',
          bottom: 80,
          fontSize: 18,
          color: '#3A3530',
          letterSpacing: 1,
        }}>Cervecería El Regreso · Valdivia</div>
      </div>
    ),
    { width: w, height: h }
  )
}
