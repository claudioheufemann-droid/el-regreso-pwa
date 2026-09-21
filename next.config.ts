import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // sharp (lib/terreno/fotoServidor.ts) carga su binario nativo de libvips
  // con dlopen en vez de un require() normal — el file tracing automático
  // de Vercel no lo sigue y el .so nunca llega al deploy, aunque el import
  // esté en la lista de paquetes externos por defecto de Next. Sin esto,
  // /api/terreno/visitas/[id]/llegada tira "ERR_DLOPEN_FAILED:
  // libvips-cpp.so.8.18.6: cannot open shared object file" en producción
  // (nunca en local, porque ahí sharp SÍ está instalado directo en
  // node_modules sin pasar por tracing).
  outputFileTracingIncludes: {
    '/*': [
      'node_modules/sharp/**/*',
      'node_modules/@img/sharp-linux-x64/**/*',
      'node_modules/@img/sharp-libvips-linux-x64/**/*',
    ],
  },
  async headers() {
    return [
      {
        // El SW nunca debe ser cacheado — el browser siempre re-descarga
        // para detectar actualizaciones de versión
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Pragma',        value: 'no-cache' },
          { key: 'Expires',       value: '0' },
        ],
      },
      {
        // El manifest tampoco se cachea para que los cambios de ícono/nombre se vean
        source: '/manifest.json',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        ],
      },
    ]
  },
};

export default nextConfig;
