import type { Metadata, Viewport } from 'next'
import './globals.css'
import Providers from '@/components/Providers'
import { getServerUser } from '@/lib/auth'

const APP_NAME = 'El Regreso Control'
const APP_DESCRIPTION = 'Plataforma de gestión y ventas · Cervecería El Regreso'

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: { default: APP_NAME, template: `%s · El Regreso` },
  description: APP_DESCRIPTION,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'El Regreso',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon-32x32.png',        sizes: '32x32',   type: 'image/png' },
      { url: '/icons/icon-192x192.png',   sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512x512.png',   sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: '(prefers-color-scheme: dark)',  color: '#0A0A0A' },
    { media: '(prefers-color-scheme: light)', color: '#D4AF37' },
  ],
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getServerUser()

  return (
    <html lang="es">
      <head>
        {/* PWA iOS */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="El Regreso" />
        <link rel="apple-touch-startup-image" href="/icons/icon-512x512.png" />
      </head>
      <body className="min-h-screen">
        {/* Forzar actualización del SW antes de que React monte */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (!('serviceWorker' in navigator)) return;
            // Recargar automáticamente cuando un nuevo SW toma control
            navigator.serviceWorker.addEventListener('controllerchange', function() {
              window.location.reload();
            });
            // Forzar búsqueda de nueva versión inmediatamente
            navigator.serviceWorker.ready.then(function(reg) {
              reg.update().catch(function(){});
            }).catch(function(){});
          })();
        `}} />
        <Providers initialUser={user}>
          {children}
        </Providers>
      </body>
    </html>
  )
}
