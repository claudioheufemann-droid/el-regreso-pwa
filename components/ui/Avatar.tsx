'use client'

import Image from 'next/image'
import { useState } from 'react'

const PALETTE = ['#E67E22','#5B8AA8','#C8542A','#D4AF37','#9B59B6','#4A7A3A']

interface AvatarProps {
  iniciales: string
  userId: string
  size?: number
  avatarUrl?: string | null
  className?: string
}

export default function Avatar({ iniciales, userId, size = 28, avatarUrl, className }: AvatarProps) {
  const [imgError, setImgError] = useState(false)
  const idx = userId.charCodeAt(0) % PALETTE.length
  const showPhoto = !!avatarUrl && !imgError

  if (showPhoto) {
    return (
      <div
        className={className}
        style={{
          width: size, height: size, borderRadius: '50%',
          overflow: 'hidden', flexShrink: 0, position: 'relative',
          border: '2px solid rgba(255,255,255,0.12)',
        }}
      >
        <Image
          src={avatarUrl!}
          alt={iniciales}
          fill
          sizes={`${size}px`}
          style={{ objectFit: 'cover', objectPosition: 'center top' }}
          onError={() => setImgError(true)}
          unoptimized
        />
      </div>
    )
  }

  return (
    <div
      className={className}
      style={{
        width: size, height: size, borderRadius: '50%',
        background: PALETTE[idx],
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.36, fontWeight: 700, color: '#0A0A0A',
        flexShrink: 0,
        border: '2px solid rgba(255,255,255,0.12)',
      }}
    >
      {iniciales}
    </div>
  )
}
