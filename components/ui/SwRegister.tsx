'use client'

import { useEffect } from 'react'

// Desinstala cualquier service worker viejo para evitar que sirva páginas cacheadas
export default function SwRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        for (const reg of registrations) {
          reg.unregister()
        }
      })
    }
  }, [])
  return null
}
