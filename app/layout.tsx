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
        {/* Splash screens para iPhone — generados dinámicamente vía /api/splash */}
        <link rel="apple-touch-startup-image" media="(device-width:430px) and (device-height:932px) and (-webkit-device-pixel-ratio:3)" href="/api/splash?w=1290&h=2796" />
        <link rel="apple-touch-startup-image" media="(device-width:393px) and (device-height:852px) and (-webkit-device-pixel-ratio:3)" href="/api/splash?w=1179&h=2556" />
        <link rel="apple-touch-startup-image" media="(device-width:428px) and (device-height:926px) and (-webkit-device-pixel-ratio:3)" href="/api/splash?w=1284&h=2778" />
        <link rel="apple-touch-startup-image" media="(device-width:390px) and (device-height:844px) and (-webkit-device-pixel-ratio:3)" href="/api/splash?w=1170&h=2532" />
        <link rel="apple-touch-startup-image" media="(device-width:375px) and (device-height:812px) and (-webkit-device-pixel-ratio:3)" href="/api/splash?w=1125&h=2436" />
        <link rel="apple-touch-startup-image" media="(device-width:414px) and (device-height:896px) and (-webkit-device-pixel-ratio:2)" href="/api/splash?w=828&h=1792" />
        <link rel="apple-touch-startup-image" media="(device-width:375px) and (device-height:667px) and (-webkit-device-pixel-ratio:2)" href="/api/splash?w=750&h=1334" />
      </head>
      <body className="min-h-screen">
        {/* Forzar actualización del SW antes de que React monte */}
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            if (!('serviceWorker' in navigator)) return;
            // Recargar automáticamente cuando un nuevo SW toma control — PERO
            // como máximo una vez por sesión de pestaña. Sin este freno, un
            // reload dispara este mismo script de nuevo, que puede volver a
            // detectar "hay SW nuevo" y recargar otra vez: un módulo que se
            // toca justo cuando esto dispara se queda en loop de recarga y
            // nunca llega a cargar la pantalla de destino — eso reportaron
            // los vendedores como "toco y no carga" en el celular.
            navigator.serviceWorker.addEventListener('controllerchange', function() {
              if (sessionStorage.getItem('sw-reloaded') === '1') return;
              sessionStorage.setItem('sw-reloaded', '1');
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
