"use client";

import Link from 'next/link';

export default function VentasDashboard() {
  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", animation: "fadeIn 0.4s ease" }}>
      <header style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #333", paddingBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", color: "var(--color-yellow)", letterSpacing: "1px" }}>EL REGRESO</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "2px" }}>Dashboard Vendedor</p>
        </div>
        <Link href="/" style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", textDecoration: "underline" }}>Salir</Link>
      </header>

      {/* KPI Widget: Resumen Rápido */}
      <h2 style={{ fontSize: "1.2rem", color: "white", marginBottom: "16px" }}>Resumen de Hoy</h2>
      <div className="card" style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", backgroundColor: "#1a1a1a", padding: "20px", borderRadius: "12px", border: "1px solid #333" }}>
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontSize: "2.2rem", color: "white", margin: 0, fontWeight: "bold" }}>8<span style={{ fontSize: "1.2rem", color: "#888" }}>/10</span></p>
          <p style={{ fontSize: "0.85rem", color: "var(--color-gray-light)", margin: "4px 0 0 0" }}>Visitas Logradas</p>
        </div>
        
        <div style={{ width: "1px", backgroundColor: "#333", margin: "0 10px" }} />
        
        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontSize: "2.2rem", color: "#00FF00", margin: 0, fontWeight: "bold" }}>$450<span style={{ fontSize: "1.2rem" }}>k</span></p>
          <p style={{ fontSize: "0.85rem", color: "var(--color-gray-light)", margin: "4px 0 0 0" }}>Ventas del Día</p>
        </div>

        <div style={{ width: "1px", backgroundColor: "#333", margin: "0 10px" }} />

        <div style={{ textAlign: "center", flex: 1 }}>
          <p style={{ fontSize: "2.2rem", color: "var(--color-yellow)", margin: 0, fontWeight: "bold" }}>2</p>
          <p style={{ fontSize: "0.85rem", color: "var(--color-gray-light)", margin: "4px 0 0 0" }}>Pendientes</p>
        </div>
      </div>

      {/* Acceso Directo Principal */}
      <h2 style={{ fontSize: "1.2rem", color: "white", marginBottom: "16px" }}>Acciones Rápidas</h2>
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        <Link 
          href="/ventas/nueva" 
          style={{ 
            width: "100%", 
            padding: "24px", 
            backgroundColor: "var(--color-yellow)", 
            color: "black", 
            fontSize: "1.3rem", 
            fontWeight: "bold", 
            textAlign: "center", 
            borderRadius: "12px", 
            textDecoration: "none",
            boxShadow: "0 4px 15px rgba(255, 215, 0, 0.2)",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px"
          }}
        >
          <span style={{ fontSize: "1.8rem" }}>+</span> Nueva Venta
        </Link>
        
        <Link 
          href="/ventas/catalogos"
          style={{ 
            width: "100%", 
            padding: "20px", 
            backgroundColor: "#222", 
            color: "white", 
            fontSize: "1.1rem", 
            fontWeight: "bold", 
            textAlign: "center", 
            borderRadius: "12px", 
            border: "1px solid #444",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "12px",
            textDecoration: "none"
          }}
        >
          <span>📦</span> Ver Catálogos
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
