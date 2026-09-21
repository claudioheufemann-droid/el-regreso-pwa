// Stub de 'server-only' para vitest (ver vitest.config.ts). El paquete real sólo existe
// para que Next.js falle el build si un módulo server-only se cuela en un bundle de
// cliente — en un test de Node puro esa protección no aplica y el paquete real lanza un
// error genérico apenas se importa. No exporta nada porque el import original tampoco lo hace.
export {}
