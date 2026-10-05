/* ────────────────────────────────────────────────────────────────────────
   Paleta del módulo Producción para lo que NO puede ir por clase CSS: trazos
   y rellenos de Recharts y del Gantt (atributos SVG) y algún estilo inline.

   Desde el rediseño del 4-oct-2026 sigue a Ventas: dorado de acción sobre
   carbón, con un azul de contraste para la segunda serie de los gráficos.
   Los valores son hex fijos (no var(--x)) porque Recharts los pasa como
   atributos SVG; están elegidos para leerse en modo oscuro y en claro.
   Las superficies, textos y avisos salen de los tokens --p-* de
   globals.css, nunca de acá.

   Vive en su propio archivo —y no dentro de ProduccionClient.tsx— porque lo
   usan varios componentes, y dejarlo en el cliente obligaría a importar del
   archivo que a su vez los importa a ellos.
   ──────────────────────────────────────────────────────────────────────── */
export const COLORS = {
  /** Acción principal, proyección del modelo, cerveza. */
  primario: '#D4AF37',
  /** Variante apagada del dorado: tendencias y segundo nivel. */
  primarioSuave: '#B8962E',
  /** Segunda serie (venta real, ritmo) y formatos. */
  contraste: '#60A5FA',
  /** Fondo de la temporada alta en los gráficos. */
  temporada: 'rgba(212,175,55,0.14)',
  kombucha: '#F59E0B',
  neutro: '#8A8378',
  ok: '#22C55E',
  bad: '#EF4444',
  /** Rejilla y ejes de los gráficos. */
  rejilla: 'rgba(138,131,120,0.22)',
  eje: '#8A8378',
}
