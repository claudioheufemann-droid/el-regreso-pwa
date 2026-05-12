"use client";

import Link from 'next/link';
import { useState } from 'react';

// --- MOCK DATA PARA METAS ---
const METAS_DATA = {
  HOY: [
    { canal: "HORECA", meta: 500000, actual: 460000 },
    { canal: "TRADICIONAL", meta: 300000, actual: 120000 },
    { canal: "RETAIL", meta: 800000, actual: 150000 }
  ],
  SEMANA: [
    { canal: "HORECA", meta: 3500000, actual: 2800000 },
    { canal: "TRADICIONAL", meta: 2100000, actual: 1500000 },
    { canal: "RETAIL", meta: 5600000, actual: 2000000 }
  ],
  MES: {
    "-1": [ // Mes Anterior (Abril)
      { canal: "HORECA", meta: 15000000, actual: 16500000 }, // 110%
      { canal: "TRADICIONAL", meta: 9000000, actual: 8500000 }, // 94%
      { canal: "RETAIL", meta: 24000000, actual: 20000000 } // 83%
    ],
    "0": [ // Mes Actual (Mayo)
      { canal: "HORECA", meta: 15000000, actual: 6000000 }, // 40% (En curso)
      { canal: "TRADICIONAL", meta: 9000000, actual: 3500000 }, // 38%
      { canal: "RETAIL", meta: 24000000, actual: 5000000 } // 20%
    ],
    "1": [ // Próximo Mes (Junio)
      { canal: "HORECA", meta: 16000000, actual: 0 },
      { canal: "TRADICIONAL", meta: 9500000, actual: 0 },
      { canal: "RETAIL", meta: 25000000, actual: 0 }
    ]
  }
};

const NOMBRES_MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function VentasDashboard() {
  const [timeFrame, setTimeFrame] = useState<"HOY" | "SEMANA" | "MES">("HOY");
  const [monthOffset, setMonthOffset] = useState<number>(0); // 0 = Actual, -1 = Anterior, etc.

  // Lógica para obtener el mes a mostrar
  const currentDate = new Date();
  let targetMonth = currentDate.getMonth() + monthOffset;
  let targetYear = currentDate.getFullYear();
  
  while (targetMonth < 0) {
    targetMonth += 12;
    targetYear -= 1;
  }
  while (targetMonth > 11) {
    targetMonth -= 12;
    targetYear += 1;
  }

  // Obtener datos actuales según selección
  let displayData: any[] = [];
  if (timeFrame === "HOY") displayData = METAS_DATA.HOY;
  if (timeFrame === "SEMANA") displayData = METAS_DATA.SEMANA;
  if (timeFrame === "MES") {
    // Para simplificar el mock, limitamos el offset a los que tenemos en duro, pero el calendario fluye.
    const mockKey = monthOffset === 0 ? "0" : monthOffset < 0 ? "-1" : "1";
    displayData = METAS_DATA.MES[mockKey as keyof typeof METAS_DATA.MES] || METAS_DATA.MES["0"];
  }

  const getProgressColor = (percent: number) => {
    if (percent < 33) return "#FF4D4D"; // Rojo (Peligro)
    if (percent < 75) return "var(--color-yellow)"; // Amarillo (En Progreso)
    return "#00FF00"; // Verde (Meta Lograda)
  };

  return (
    <div style={{ padding: "16px", maxWidth: "800px", margin: "0 auto", animation: "fadeIn 0.4s ease" }}>
      {/* Header Compacto */}
      <header style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #333", paddingBottom: "12px" }}>
        <div>
          <h1 style={{ fontSize: "1.4rem", color: "var(--color-yellow)", margin: 0, letterSpacing: "1px" }}>EL REGRESO</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.75rem", margin: 0, textTransform: "uppercase", letterSpacing: "1px" }}>Dashboard Vendedor</p>
        </div>
        <Link href="/" style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", textDecoration: "underline" }}>Salir</Link>
      </header>

      {/* --- SECCIÓN: TUS METAS --- */}
      <div style={{ marginBottom: "24px" }}>
        <h2 style={{ fontSize: "1.2rem", color: "white", margin: "0 0 16px 0" }}>Tus Metas de Ventas</h2>
        
        {/* Segmented Control (Píldoras) */}
        <div style={{ display: "flex", backgroundColor: "#222", borderRadius: "12px", padding: "4px", marginBottom: "16px", border: "1px solid #333" }}>
          {["HOY", "SEMANA", "MES"].map((tf) => (
            <button 
              key={tf}
              onClick={() => setTimeFrame(tf as any)}
              style={{ 
                flex: 1, 
                padding: "10px", 
                backgroundColor: timeFrame === tf ? "#444" : "transparent", 
                color: timeFrame === tf ? "white" : "#888", 
                borderRadius: "8px", 
                border: "none", 
                fontWeight: "bold",
                fontSize: "0.9rem",
                transition: "all 0.2s ease"
              }}
            >
              {tf.charAt(0) + tf.slice(1).toLowerCase()}
            </button>
          ))}
        </div>

        {/* Navegador de Meses (Solo si está en MES) */}
        {timeFrame === "MES" && (
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px", backgroundColor: "#1a1a1a", padding: "12px 16px", borderRadius: "12px", border: "1px solid #333" }}>
            <button onClick={() => setMonthOffset(p => p - 1)} style={{ background: "none", border: "none", color: "var(--color-yellow)", fontSize: "1.5rem", cursor: "pointer" }}>←</button>
            <div style={{ textAlign: "center" }}>
              <span style={{ display: "block", fontWeight: "bold", color: "white", fontSize: "1.1rem" }}>{NOMBRES_MESES[targetMonth]} {targetYear}</span>
              {monthOffset === 0 && <span style={{ fontSize: "0.75rem", color: "var(--color-yellow)" }}>Mes Actual</span>}
            </div>
            <button onClick={() => setMonthOffset(p => p + 1)} style={{ background: "none", border: "none", color: "var(--color-yellow)", fontSize: "1.5rem", cursor: "pointer" }}>→</button>
          </div>
        )}

        {/* Tarjetas de Metas por Canal */}
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {displayData.map((meta, index) => {
            const percent = meta.meta > 0 ? Math.min(100, Math.round((meta.actual / meta.meta) * 100)) : 0;
            const color = getProgressColor(percent);
            
            return (
              <div key={meta.canal} style={{ backgroundColor: "#1a1a1a", padding: "16px", borderRadius: "12px", border: "1px solid #333", animation: `fadeIn 0.3s ease ${index * 0.1}s both` }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    {/* Círculo Semáforo con Glow */}
                    <div style={{ width: "12px", height: "12px", borderRadius: "50%", backgroundColor: color, boxShadow: `0 0 10px ${color}` }} />
                    <span style={{ fontWeight: "bold", color: "white", fontSize: "1rem" }}>{meta.canal}</span>
                  </div>
                  <span style={{ fontWeight: "bold", color, fontSize: "1.1rem" }}>{percent}%</span>
                </div>
                
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px", fontSize: "0.85rem", color: "var(--color-gray-light)" }}>
                  <span>Logrado: <strong style={{color: "white"}}>${meta.actual.toLocaleString("es-CL")}</strong></span>
                  <span>Meta: <strong>${meta.meta.toLocaleString("es-CL")}</strong></span>
                </div>

                {/* Progress Bar */}
                <div style={{ width: "100%", height: "8px", backgroundColor: "#333", borderRadius: "4px", overflow: "hidden" }}>
                  <div style={{ width: `${percent}%`, height: "100%", backgroundColor: color, borderRadius: "4px", transition: "width 0.8s cubic-bezier(0.4, 0, 0.2, 1)" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- SECCIÓN: KPIs DIARIOS Y ACCIONES --- */}
      <h2 style={{ fontSize: "1.2rem", color: "white", marginBottom: "16px", margin: "0 0 12px 0" }}>Progreso de Ruta (Hoy)</h2>
      <div style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", backgroundColor: "#1a1a1a", padding: "20px", borderRadius: "12px", border: "1px solid #333" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontSize: "1.8rem", color: "white", margin: 0, fontWeight: "bold" }}>8<span style={{ fontSize: "1rem", color: "#888" }}>/10</span></p>
          <p style={{ fontSize: "0.8rem", color: "var(--color-gray-light)", margin: "4px 0 0 0" }}>Visitas Logradas</p>
        </div>
        <div style={{ width: "1px", backgroundColor: "#333", margin: "0 10px" }} />
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontSize: "1.8rem", color: "var(--color-yellow)", margin: 0, fontWeight: "bold" }}>2</p>
          <p style={{ fontSize: "0.8rem", color: "var(--color-gray-light)", margin: "4px 0 0 0" }}>Pendientes</p>
        </div>
      </div>

      {/* Acciones Rápidas (Botones Lado a Lado) */}
      <div style={{ display: "flex", gap: "12px", marginTop: "12px", paddingBottom: "24px" }}>
        <Link 
          href="/ventas/nueva" 
          style={{ 
            flex: 2, 
            padding: "18px", 
            backgroundColor: "var(--color-yellow)", 
            color: "black", 
            fontSize: "1.1rem", 
            fontWeight: "bold", 
            textAlign: "center", 
            borderRadius: "12px", 
            textDecoration: "none",
            boxShadow: "0 4px 15px rgba(255, 215, 0, 0.2)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "8px"
          }}
        >
          <span style={{ fontSize: "1.5rem", lineHeight: "1" }}>+</span> Nueva Venta
        </Link>
        
        <Link 
          href="/ventas/catalogos"
          style={{ 
            flex: 1, 
            padding: "18px", 
            backgroundColor: "#222", 
            color: "white", 
            fontSize: "1rem", 
            fontWeight: "bold", 
            textAlign: "center", 
            borderRadius: "12px", 
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
