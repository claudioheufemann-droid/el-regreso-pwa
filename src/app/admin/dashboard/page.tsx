"use client";

import Link from "next/link";
import { useState } from "react";

// --- Mock Data: Aggregated Visits ---
const DASHBOARD_DATA = {
  kpis: {
    totalSalesRevenue: 4500000,
    totalFuelCost: 155000,
    totalVisits: 145,
    successfulVisits: 98,
    effectivityRate: 67.5,
  },
  salesmen: [
    { id: "v1", name: "Javier Badilla", totalVisits: 50, success: 38, rate: 76, revenue: 1800000, fuelCost: 45000, litersSold: 1100 },
    { id: "v2", name: "Carlos Urrejola", totalVisits: 45, success: 42, rate: 93, revenue: 2500000, fuelCost: 40000, litersSold: 1500 },
    { id: "v3", name: "Ana Terreno", totalVisits: 50, success: 28, rate: 56, revenue: 1200000, fuelCost: 60000, litersSold: 600 },
  ],
  heatMapPoints: [
    { zone: "Valdivia Centro", profit: 850000, visits: 30, color: "#00FF00" },
    { zone: "Isla Teja", profit: 450000, visits: 15, color: "#00FF00" },
    { zone: "Niebla", profit: -15000, visits: 12, color: "#FF3333" }, // High fuel cost, low sales
    { zone: "Corral", profit: -30000, visits: 5, color: "#FF3333" },
  ],
  compliance: [
    { category: "Bar", goal: 5000, current: 3200, status: "LAGGING" },
    { category: "Supermercado", goal: 10000, current: 9500, status: "ON_TRACK" },
    { category: "Minimarket", goal: 2000, current: 1100, status: "LAGGING" }
  ],
  gpsHistory: [
    { time: "09:15 AM", vendor: "Carlos Urrejola", client: "Bar La Taberna", kmCheck: "OK (±15m)", outcome: "SUCCESS" },
    { time: "11:30 AM", vendor: "Javier Badilla", client: "Botillería El Paso", kmCheck: "OK (±5m)", outcome: "NO_SALE" },
    { time: "13:45 PM", vendor: "Carlos Urrejola", client: "Cafetería Central", kmCheck: "WARN (±250m)", outcome: "SUCCESS" }
  ]
};

export default function AdminDashboard() {
  const { kpis, salesmen, heatMapPoints, compliance, gpsHistory } = DASHBOARD_DATA;

  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto", paddingBottom: "120px" }}>
      {/* HEADER */}
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #333", paddingBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", color: "var(--color-yellow)", letterSpacing: "1px" }}>EL REGRESO</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "2px" }}>Sales Intelligence Dashboard</p>
        </div>
        <Link href="/" style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", textDecoration: "underline" }}>Volver al Menú</Link>
      </header>

      {/* KPI CARDS */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "16px", marginBottom: "32px" }}>
        <div className="card" style={{ padding: "20px", borderLeft: "4px solid #00FF00" }}>
          <h3 style={{ fontSize: "0.9rem", color: "var(--color-gray-light)", textTransform: "uppercase", margin: "0 0 8px 0" }}>Revenue Total</h3>
          <p style={{ fontSize: "2rem", fontWeight: "bold", margin: 0, color: "white" }}>${kpis.totalSalesRevenue.toLocaleString("es-CL")}</p>
        </div>
        <div className="card" style={{ padding: "20px", borderLeft: "4px solid #FF3333" }}>
          <h3 style={{ fontSize: "0.9rem", color: "var(--color-gray-light)", textTransform: "uppercase", margin: "0 0 8px 0" }}>Costo Combustible Total</h3>
          <p style={{ fontSize: "2rem", fontWeight: "bold", margin: 0, color: "white" }}>${kpis.totalFuelCost.toLocaleString("es-CL")}</p>
        </div>
        <div className="card" style={{ padding: "20px", borderLeft: "4px solid var(--color-yellow)" }}>
          <h3 style={{ fontSize: "0.9rem", color: "var(--color-gray-light)", textTransform: "uppercase", margin: "0 0 8px 0" }}>Margen Operativo</h3>
          <p style={{ fontSize: "2rem", fontWeight: "bold", margin: 0, color: "var(--color-yellow)" }}>${(kpis.totalSalesRevenue - kpis.totalFuelCost).toLocaleString("es-CL")}</p>
        </div>
        <div className="card" style={{ padding: "20px", borderLeft: "4px solid #4D90FE" }}>
          <h3 style={{ fontSize: "0.9rem", color: "var(--color-gray-light)", textTransform: "uppercase", margin: "0 0 8px 0" }}>Efectividad Global</h3>
          <p style={{ fontSize: "2rem", fontWeight: "bold", margin: 0, color: "white" }}>{kpis.effectivityRate}%</p>
          <span style={{ fontSize: "0.8rem", color: "#888" }}>{kpis.successfulVisits} / {kpis.totalVisits} visitas</span>
        </div>
      </section>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(350px, 1fr))", gap: "24px" }}>
        
        {/* LEADERBOARD VENDEDORES */}
        <section className="card" style={{ border: "1px solid #333" }}>
          <h2 style={{ fontSize: "1.3rem", color: "var(--color-yellow)", marginBottom: "16px", borderBottom: "1px solid #333", paddingBottom: "12px" }}>Efectividad por Vendedor</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {salesmen.sort((a, b) => b.rate - a.rate).map((s, index) => {
              const kmTraveled = s.fuelCost / 120; // 120 CLP per km
              const litersPerKm = (s.litersSold / kmTraveled).toFixed(2);
              const isCarlos = s.name.includes("Carlos");

              return (
                <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px", backgroundColor: isCarlos ? "rgba(255, 215, 0, 0.1)" : "#111", border: isCarlos ? "1px solid var(--color-yellow)" : "1px solid transparent", borderRadius: "8px" }}>
                  <div>
                    <h4 style={{ margin: "0 0 4px 0", color: isCarlos ? "var(--color-yellow)" : "white", fontSize: "1.1rem" }}>{index + 1}. {s.name}</h4>
                    <p style={{ margin: 0, color: "var(--color-gray-light)", fontSize: "0.85rem" }}>Ratio: {s.success}/{s.totalVisits} Visitas</p>
                    <p style={{ margin: "4px 0 0 0", color: "#00FF00", fontSize: "0.8rem", fontWeight: "bold" }}>Eficiencia: {litersPerKm} L/KM</p>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <p style={{ margin: "0 0 4px 0", fontSize: "1.2rem", fontWeight: "bold", color: s.rate >= 70 ? "#00FF00" : s.rate >= 60 ? "var(--color-yellow)" : "#FF3333" }}>{s.rate}%</p>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "#888" }}>Neto: ${(s.revenue - s.fuelCost).toLocaleString("es-CL")}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* RENTABILIDAD LOGÍSTICA HEATMAP (ZONAS) */}
        <section className="card" style={{ border: "1px solid #333", gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "24px", padding: 0, background: "transparent" }}>
          
          <div className="card" style={{ border: "1px solid #333", margin: 0 }}>
            <h2 style={{ fontSize: "1.3rem", color: "var(--color-yellow)", marginBottom: "16px", borderBottom: "1px solid #333", paddingBottom: "12px" }}>Heatmap de Rentabilidad Logística</h2>
            <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", marginBottom: "16px" }}>Zonas rankeadas por Utilidad Neta Logística.</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {heatMapPoints.map((point, index) => (
                <div key={index} style={{ display: "flex", alignItems: "center", padding: "12px", borderLeft: `4px solid ${point.color}`, backgroundColor: "rgba(255,255,255,0.02)", borderRadius: "4px" }}>
                  <div style={{ flex: 1 }}>
                    <h4 style={{ margin: "0 0 4px 0", color: "white" }}>{point.zone}</h4>
                    <span style={{ fontSize: "0.8rem", color: "#888" }}>{point.visits} visitas registradas</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontWeight: "bold", fontSize: "1.1rem", color: point.color }}>
                      {point.profit > 0 ? "+" : ""}${point.profit.toLocaleString("es-CL")}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            
            <div style={{ marginTop: "16px", padding: "12px", backgroundColor: "rgba(255, 51, 51, 0.1)", border: "1px solid #FF3333", borderRadius: "4px" }}>
              <p style={{ margin: 0, fontSize: "0.85rem", color: "white" }}><strong>⚠️ Alerta de IA:</strong> Las zonas de Niebla y Corral generan pérdida operativa constante. Sugerimos modelo de Tele-Ventas.</p>
            </div>
          </div>

          <div className="card" style={{ border: "1px solid #333", margin: 0 }}>
            <h2 style={{ fontSize: "1.3rem", color: "var(--color-yellow)", marginBottom: "16px", borderBottom: "1px solid #333", paddingBottom: "12px" }}>Compliance Map (Categorías)</h2>
            <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", marginBottom: "16px" }}>Avance vs Metas "Optimistas" por canal comercial.</p>
            
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {compliance.map((c, i) => (
                <div key={i}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                    <span style={{ color: "white", fontWeight: "bold" }}>{c.category}</span>
                    <span style={{ color: c.status === "LAGGING" ? "#FF3333" : "#00FF00" }}>{((c.current/c.goal)*100).toFixed(1)}%</span>
                  </div>
                  <div style={{ width: "100%", height: "8px", backgroundColor: "#222", borderRadius: "4px", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${(c.current/c.goal)*100}%`, backgroundColor: c.status === "LAGGING" ? "#FF3333" : "#00FF00" }} />
                  </div>
                </div>
              ))}
            </div>

            <h2 style={{ fontSize: "1.3rem", color: "var(--color-yellow)", marginBottom: "16px", marginTop: "32px", borderBottom: "1px solid #333", paddingBottom: "12px" }}>GPS History & Anti-Fraud</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {gpsHistory.map((log, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", padding: "8px", borderBottom: "1px solid #222" }}>
                  <span style={{ color: "#888" }}>{log.time}</span>
                  <span style={{ color: "white" }}>{log.vendor}</span>
                  <span style={{ color: log.kmCheck.includes("OK") ? "#00FF00" : "var(--color-yellow)" }}>{log.kmCheck}</span>
                </div>
              ))}
            </div>
          </div>

        </section>

      </div>
    </div>
  );
}
