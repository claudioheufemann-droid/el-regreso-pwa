"use client";

import Link from "next/link";

// Mock data para el Dashboard
const MOCK_STATS = {
  totalVentas: 1540000,
  margenTotal: 580000,
  costoTerreno: 120000,
  rentabilidad: 460000,
  clientesVisitados: 45,
  efectividad: "68%" // % de visitas que terminaron en venta
};

const MOCK_VISITAS = [
  { id: 1, vendedor: "Javier Badilla", cliente: "Botillería El Paso", duracionMin: 25, costoVisita: 4500, margenPedido: 18000, rentabilidad: 13500, status: "VENTA" },
  { id: 2, vendedor: "Carlos Urrejola", cliente: "Bar La Taberna", duracionMin: 40, costoVisita: 6000, margenPedido: 32000, rentabilidad: 26000, status: "VENTA" },
  { id: 3, vendedor: "Carlos Urrejola", cliente: "Restaurante El Faro", duracionMin: 15, costoVisita: 3500, margenPedido: 0, rentabilidad: -3500, status: "NO VENTA" },
  { id: 4, vendedor: "Javier Badilla", cliente: "Minimarket Los Andes", duracionMin: 20, costoVisita: 4000, margenPedido: 12500, rentabilidad: 8500, status: "VENTA" },
];

export default function AdminDashboard() {
  return (
    <div style={{ padding: "20px", maxWidth: "1200px", margin: "0 auto", paddingBottom: "80px" }}>
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "2rem", color: "var(--color-yellow)" }}>Dashboard Gerencial</h1>
          <p style={{ color: "var(--color-gray-light)" }}>Control de Gestión & Rentabilidad</p>
        </div>
        <Link href="/" style={{ color: "var(--color-yellow)", textDecoration: "underline" }}>Volver al Inicio</Link>
      </header>

      {/* KPI Cards */}
      <section className="grid-1-to-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", marginBottom: "32px" }}>
        <div className="card" style={{ borderTop: "4px solid var(--color-yellow)" }}>
          <h3 style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", marginBottom: "8px" }}>Margen Operativo Bruto</h3>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold" }}>${MOCK_STATS.margenTotal.toLocaleString("es-CL")}</div>
        </div>
        <div className="card" style={{ borderTop: "4px solid #FF3333" }}>
          <h3 style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", marginBottom: "8px" }}>Costos de Terreno</h3>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#FF3333" }}>-${MOCK_STATS.costoTerreno.toLocaleString("es-CL")}</div>
        </div>
        <div className="card" style={{ borderTop: "4px solid #00FF00" }}>
          <h3 style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", marginBottom: "8px" }}>Rentabilidad Neta (Real)</h3>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#00FF00" }}>${MOCK_STATS.rentabilidad.toLocaleString("es-CL")}</div>
        </div>
        <div className="card" style={{ borderTop: "4px solid #4da6ff" }}>
          <h3 style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", marginBottom: "8px" }}>Efectividad de Visitas</h3>
          <div style={{ fontSize: "1.8rem", fontWeight: "bold", color: "#4da6ff" }}>{MOCK_STATS.efectividad}</div>
        </div>
      </section>

      {/* Tabla de Visitas y Auditoría */}
      <section className="card">
        <h2 style={{ color: "var(--color-yellow)", marginBottom: "16px" }}>Auditoría de Visitas Recientes</h2>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #333", color: "var(--color-gray-light)" }}>
                <th style={{ padding: "12px 8px" }}>Vendedor</th>
                <th style={{ padding: "12px 8px" }}>Cliente</th>
                <th style={{ padding: "12px 8px" }}>Estado</th>
                <th style={{ padding: "12px 8px" }}>Duración</th>
                <th style={{ padding: "12px 8px" }}>Costo Visita</th>
                <th style={{ padding: "12px 8px" }}>Margen Pedido</th>
                <th style={{ padding: "12px 8px" }}>Rentabilidad</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_VISITAS.map(visita => (
                <tr key={visita.id} style={{ borderBottom: "1px solid #222" }}>
                  <td style={{ padding: "12px 8px" }}>{visita.vendedor}</td>
                  <td style={{ padding: "12px 8px" }}>{visita.cliente}</td>
                  <td style={{ padding: "12px 8px" }}>
                    <span style={{ 
                      padding: "4px 8px", 
                      borderRadius: "4px", 
                      fontSize: "0.8rem",
                      backgroundColor: visita.status === "VENTA" ? "rgba(0, 255, 0, 0.1)" : "rgba(255, 51, 51, 0.1)",
                      color: visita.status === "VENTA" ? "#00FF00" : "#FF3333"
                    }}>
                      {visita.status}
                    </span>
                  </td>
                  <td style={{ padding: "12px 8px" }}>{visita.duracionMin} min</td>
                  <td style={{ padding: "12px 8px", color: "#FF3333" }}>-${visita.costoVisita.toLocaleString("es-CL")}</td>
                  <td style={{ padding: "12px 8px" }}>${visita.margenPedido.toLocaleString("es-CL")}</td>
                  <td style={{ padding: "12px 8px", color: visita.rentabilidad >= 0 ? "#00FF00" : "#FF3333", fontWeight: "bold" }}>
                    ${visita.rentabilidad.toLocaleString("es-CL")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
