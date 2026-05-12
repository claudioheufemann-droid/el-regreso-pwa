"use client";

import Link from 'next/link';

// Mock Data for Goals
const METAS_HOY = [
  { canal: "HORECA", meta: 500000, actual: 460000 },
  { canal: "TRADICIONAL", meta: 300000, actual: 120000 },
  { canal: "RETAIL", meta: 800000, actual: 150000 }
];

export default function VentasDashboard() {
  
  const getProgressColor = (percent: number) => {
    if (percent < 33) return "#FF4D4D"; // Rojo (Peligro)
    if (percent < 75) return "var(--color-yellow)"; // Amarillo (En Progreso)
    return "#00FF00"; // Verde (Meta Lograda)
  };

  return (
    <div style={{ padding: "16px", maxWidth: "800px", margin: "0 auto", animation: "fadeIn 0.4s ease" }}>
      {/* Header Compacto */}
      <header style={{ marginBottom: "20px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #333", paddingBottom: "12px" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", color: "var(--color-yellow)", margin: 0, letterSpacing: "1px" }}>EL REGRESO</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.75rem", margin: 0, textTransform: "uppercase", letterSpacing: "1px" }}>Dashboard Vendedor</p>
        </div>
        <Link href="/" style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", textDecoration: "underline" }}>Salir</Link>
      </header>

      {/* Metas del Día (Semáforos por Canal) */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <h2 style={{ fontSize: "1.1rem", color: "white", margin: 0 }}>Tus Metas de Hoy</h2>
        <span style={{ fontSize: "0.8rem", color: "var(--color-gray-light)" }}>Actualizado</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: "12px", marginBottom: "24px" }}>
        {METAS_HOY.map(meta => {
          const percent = Math.min(100, Math.round((meta.actual / meta.meta) * 100));
          const color = getProgressColor(percent);
          
          return (
            <div key={meta.canal} style={{ backgroundColor: "#1a1a1a", padding: "14px", borderRadius: "8px", border: "1px solid #333" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  {/* Círculo Semáforo */}
                  <div style={{ width: "10px", height: "10px", borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 8px ${color}` }} />
                  <span style={{ fontWeight: "bold", color: "white", fontSize: "0.95rem" }}>{meta.canal}</span>
                </div>
                <span style={{ fontWeight: "bold", color, fontSize: "0.95rem" }}>{percent}%</span>
              </div>
              
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.8rem", color: "var(--color-gray-light)" }}>
                <span>Actual: ${meta.actual.toLocaleString("es-CL")}</span>
                <span>Meta: ${meta.meta.toLocaleString("es-CL")}</span>
              </div>

              {/* Progress Bar */}
              <div style={{ width: "100%", height: "6px", backgroundColor: "#333", borderRadius: "3px", overflow: "hidden" }}>
                <div style={{ width: `${percent}%`, height: "100%", backgroundColor: color, borderRadius: "3px", transition: "width 0.5s ease" }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* KPI Widget Compacto: Visitas */}
      <h2 style={{ fontSize: "1.1rem", color: "white", marginBottom: "12px", margin: 0 }}>Progreso de Ruta</h2>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", backgroundColor: "#1a1a1a", padding: "16px", borderRadius: "8px", border: "1px solid #333", marginTop: "12px" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontSize: "1.5rem", color: "white", margin: 0, fontWeight: "bold" }}>8<span style={{ fontSize: "0.9rem", color: "#888" }}>/10</span></p>
          <p style={{ fontSize: "0.75rem", color: "var(--color-gray-light)", margin: "4px 0 0 0" }}>Visitas Logradas</p>
        </div>
        <div style={{ width: "1px", backgroundColor: "#333", margin: "0 10px" }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontSize: "1.5rem", color: "var(--color-yellow)", margin: 0, fontWeight: "bold" }}>2</p>
          <p style={{ fontSize: "0.75rem", color: "var(--color-gray-light)", margin: "4px 0 0 0" }}>Pendientes</p>
        </div>
      </div>

      {/* Acciones Rápidas (Botones Reducidos y Lado a Lado) */}
      <h2 style={{ fontSize: "1.1rem", color: "white", marginBottom: "12px", margin: 0 }}>Acciones</h2>
      <div style={{ display: "flex", gap: "12px", marginTop: "12px", paddingBottom: "20px" }}>
        <Link 
          href="/ventas/nueva" 
          style={{ 
            flex: 2, 
            padding: "16px", 
            backgroundColor: "var(--color-yellow)", 
            color: "black", 
            fontSize: "1.1rem", 
            fontWeight: "bold", 
            textAlign: "center", 
            borderRadius: "8px", 
            textDecoration: "none",
            boxShadow: "0 4px 10px rgba(255, 215, 0, 0.2)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <span style={{ fontSize: "1.4rem", lineHeight: "1" }}>+</span> Nueva Venta
        </Link>
        
        <Link 
          href="/ventas/catalogos"
          style={{ 
            flex: 1, 
            padding: "16px", 
            backgroundColor: "#222", 
            color: "white", 
            fontSize: "0.95rem", 
            fontWeight: "bold", 
            textAlign: "center", 
            borderRadius: "8px", 
            border: "1px solid #444",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px",
            textDecoration: "none"
          }}
        >
          <span>📦</span> Catálogo
        </Link>
      </div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
