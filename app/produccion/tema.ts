/* ────────────────────────────────────────────────────────────────────────
   Paleta corporativa del módulo Producción.

   Vive en su propio archivo —y no dentro de ProduccionClient.tsx— desde que
   el menú lateral se extrajo a su propio componente: los dos la necesitan, y
   dejarla en el cliente obligaría a que el menú importara del archivo que a
   su vez importa el menú. Un ciclo que en ESM a veces funciona y a veces no,
   según el orden en que el bundler resuelva.

   Estos colores van inline porque no existen como tokens del tema de
   Tailwind; el resto de la paleta sale de las utilidades normales.
   ──────────────────────────────────────────────────────────────────────── */
export const COLORS = {
  darkGreen: '#0F3D2E',
  lightGreen: '#1A5441',
  amber: '#E5A922',
  lightAmber: '#FDE68A',
  kombucha: '#B45309',
  gray: '#9CA3AF',
}
