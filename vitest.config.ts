import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Config mínima para correr los tests de lógica pura (motor de presupuesto, umbrales,
 * semana/fechas, sanitización de export) sin depender de Next.js ni de una base de
 * datos. 'server-only' se alía a un stub porque su implementación real sólo sabe fallar
 * fuera de un bundle de servidor de Next — en vitest (Node puro) esa protección no
 * aplica y el paquete real tira un error apenas se importa.
 */
export default defineConfig({
  resolve: {
    alias: {
      'server-only': path.resolve(__dirname, 'lib/testing/serverOnlyStub.ts'),
      '@': path.resolve(__dirname, '.'),
    },
  },
  test: {
    environment: 'node',
    include: ['**/*.test.ts'],
    exclude: ['node_modules', '.next'],
  },
})
