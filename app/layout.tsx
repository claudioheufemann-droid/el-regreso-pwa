import type { Metadata, Viewport } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import { getServerUser } from '@/lib/auth'

export const metadata: Metadata = {
  title: 'El Regreso – Control',
  description: 'Plataforma de gestión y ventas · Cervecería El Regreso',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#0F0F0F',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()

  return (
    <html lang="es">
      <body className="min-h-screen">
        <Providers initialUser={user}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
