/**
 * Esqueleto de carga de Administración y Finanzas. Claro y con la misma forma
 * que el módulo (encabezado, pestañas, franja de cifras, una tarjeta): antes
 * era negro y producía un destello oscuro justo antes de la pantalla clara.
 * Estilos en línea porque el reset global anula el padding de las clases.
 */
const bloque = (alto: number, ancho: number | string = '100%', extra: React.CSSProperties = {}) => (
  <div style={{ height: alto, width: ancho, borderRadius: 8, background: '#ECE7DD', ...extra }} className="animate-pulse" />
)

export default function AdministracionLoading() {
  return (
    <div className="adm-root" style={{ minHeight: '100dvh', margin: -1 }}>
      <div style={{ background: '#FFFFFF', borderBottom: '1px solid #E7E1D5' }}>
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '16px clamp(12px, 4vw, 32px) 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {bloque(11, 170)}
          {bloque(20, 300)}
          <div style={{ display: 'flex', gap: 18, marginTop: 6 }}>{bloque(14, 60)}{bloque(14, 80)}{bloque(14, 130)}</div>
        </div>
      </div>
      <div style={{ maxWidth: 1400, margin: '0 auto', padding: '22px clamp(12px, 4vw, 32px)', display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 1, background: '#E7E1D5', border: '1px solid #E7E1D5', borderRadius: 14, overflow: 'hidden' }}>
          {[0, 1, 2].map(i => (
            <div key={i} style={{ flex: '1 1 240px', background: '#FFFFFF', padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {bloque(10, 120)}
              {bloque(28, 180)}
              {bloque(10, 200)}
            </div>
          ))}
        </div>
        <div style={{ background: '#FFFFFF', border: '1px solid #E7E1D5', borderRadius: 14, padding: 20 }}>
          {bloque(14, 240, { marginBottom: 16 })}
          {bloque(260)}
        </div>
      </div>
    </div>
  )
}
