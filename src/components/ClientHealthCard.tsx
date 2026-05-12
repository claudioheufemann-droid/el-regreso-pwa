"use client";

import { AlertTriangle, Clock, DollarSign, History } from "lucide-react";

interface OrderHistory {
  date: string;
  product: string;
  total: number;
}

interface ClientHealthCardProps {
  debt: number;
  daysLate: number;
  recentOrders: OrderHistory[];
}

export function ClientHealthCard({ debt, daysLate, recentOrders }: ClientHealthCardProps) {
  const hasDebt = debt > 0;
  const isCriticalDebt = daysLate >= 30;

  return (
    <div style={{ marginTop: "16px", display: "flex", flexDirection: "column", gap: "12px" }}>
      
      {/* Módulo de Deuda (Alerta Visual) */}
      <div style={{ 
        padding: "16px", 
        backgroundColor: hasDebt ? (isCriticalDebt ? "rgba(255, 77, 77, 0.15)" : "rgba(255, 170, 0, 0.15)") : "rgba(37, 211, 102, 0.1)", 
        border: `1px solid ${hasDebt ? (isCriticalDebt ? "#FF4D4D" : "#FFAA00") : "#25D366"}`, 
        borderRadius: "8px" 
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          {hasDebt ? <AlertTriangle size={20} color={isCriticalDebt ? "#FF4D4D" : "#FFAA00"} /> : <DollarSign size={20} color="#25D366" />}
          <h4 style={{ margin: 0, color: "white", fontSize: "1.05rem" }}>Estado de Cuenta</h4>
        </div>
        
        {hasDebt ? (
          <div>
            <p style={{ margin: 0, fontSize: "1.6rem", fontWeight: "bold", color: isCriticalDebt ? "#FF4D4D" : "#FFAA00" }}>
              ${debt.toLocaleString("es-CL")}
            </p>
            <p style={{ margin: "4px 0 0 0", color: "#ccc", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "4px" }}>
              <Clock size={14} /> {daysLate} días de mora en la factura más antigua.
            </p>
          </div>
        ) : (
          <p style={{ margin: 0, color: "#25D366", fontWeight: "bold" }}>Cliente al día. Sin deuda vigente.</p>
        )}
      </div>

      {/* Historial Reciente (Sugerencias de Venta) */}
      <div style={{ padding: "16px", backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <History size={18} color="var(--color-gray-light)" />
          <h4 style={{ margin: 0, color: "white", fontSize: "0.95rem" }}>Últimas 3 Compras</h4>
        </div>
        
        {recentOrders.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {recentOrders.map((order, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: idx < recentOrders.length - 1 ? "10px" : "0", borderBottom: idx < recentOrders.length - 1 ? "1px solid #333" : "none" }}>
                <div>
                  <span style={{ color: "white", fontWeight: "bold", fontSize: "0.9rem", display: "block" }}>{order.product}</span>
                  <span style={{ color: "#888", fontSize: "0.75rem" }}>{order.date}</span>
                </div>
                <span style={{ color: "var(--color-yellow)", fontWeight: "bold", fontSize: "0.9rem" }}>
                  ${order.total.toLocaleString("es-CL")}
                </span>
              </div>
            ))}
            <div style={{ marginTop: "8px", padding: "8px", backgroundColor: "#222", borderRadius: "6px", borderLeft: "3px solid var(--color-yellow)" }}>
              <p style={{ margin: 0, fontSize: "0.8rem", color: "white", fontStyle: "italic" }}>
                💡 Sugerencia: Ofrece repetir el último pedido ({recentOrders[0].product}).
              </p>
            </div>
          </div>
        ) : (
          <p style={{ margin: 0, color: "#888", fontSize: "0.85rem", fontStyle: "italic" }}>No hay historial de compras reciente.</p>
        )}
      </div>

    </div>
  );
}
