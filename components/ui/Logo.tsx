import Image from 'next/image'

interface LogoProps {
  size?: number
  className?: string
}

export default function Logo({ size = 48, className }: LogoProps) {
  return (
    <Image
      src="/logo.png"
      alt="El Regreso Beer Co."
      width={size}
      height={size}
      style={{
        objectFit: 'contain',
        // El logo es negro/blanco — invertimos para que quede dorado/blanco sobre fondo oscuro
        filter: 'invert(1) sepia(1) saturate(2) hue-rotate(5deg) brightness(0.9)',
      }}
      className={className}
      priority
    />
  )
}
