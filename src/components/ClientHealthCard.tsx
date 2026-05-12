"use client";

import { AlertTriangle, Clock, DollarSign, History, Leaf, Beer } from "lucide-react";

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
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      
      {/* Módulo de Deuda (Alerta Visual) */}
      <div style={{ 
        padding: "16px", 
        backgroundColor: hasDebt ? (isCriticalDebt ? "rgba(255, 77, 77, 0.15)" : "rgba(255, 170, 0, 0.15)") : "rgba(37, 211, 102, 0.1)", 
        border: `1px solid ${hasDebt ? (isCriticalDebt ? "#FF4D4D" : "#FFAA00") : "#25D366"}`, 
        borderRadius: "12px" 
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
          {hasDebt ? <AlertTriangle size={20} color={isCriticalDebt ? "#FF4D4D" : "#FFAA00"} /> : <DollarSign size={20} color="#25D366" />}
          <h4 style={{ margin: 0, color: "white", fontSize: "1.05rem" }}>Estado Financiero</h4>
        </div>
        
        {hasDebt ? (
          <div>
            <p style={{ margin: 0, fontSize: "1.8rem", fontWeight: "bold", color: isCriticalDebt ? "#FF4D4D" : "#FFAA00" }}>
              ${debt.toLocaleString("es-CL")}
            </p>
            <p style={{ margin: "4px 0 0 0", color: "#ccc", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "4px" }}>
              <Clock size={14} /> {daysLate} días de mora en facturación.
            </p>
          </div>
        ) : (
          <p style={{ margin: 0, color: "#25D366", fontWeight: "bold" }}>Cliente al día. Sin deuda vigente.</p>
        )}
      </div>

      {/* Historial Reciente (Smart History Carousel) */}
      <div style={{ padding: "16px", backgroundColor: "#111", border: "1px solid #333", borderRadius: "12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
          <History size={18} color="var(--color-gray-light)" />
          <h4 style={{ margin: 0, color: "white", fontSize: "0.95rem" }}>Smart History (Últimas compras)</h4>
        </div>
        
        {recentOrders.length > 0 ? (
          <div style={{ display: "flex", overflowX: "auto", gap: "12px", paddingBottom: "8px", snapType: "x mandatory" }}>
            {recentOrders.map((order, idx) => {
              const isKombucha = order.product.toLowerCase().includes("kombucha");
              return (
                <div key={idx} style={{ minWidth: "200px", padding: "16px", backgroundColor: "#1a1a1a", border: "1px solid #444", borderRadius: "8px", snapAlign: "start", flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                    {isKombucha ? <Leaf size={16} color="var(--color-yellow)" /> : <Beer size={16} color="#4D90FE" />}
                    <span style={{ color: "#888", fontSize: "0.75rem", fontWeight: "bold" }}>{order.date}</span>
                  </div>
                  <span style={{ color: "white", fontWeight: "bold", fontSize: "1rem", display: "block", marginBottom: "8px" }}>{order.product}</span>
                  <span style={{ color: "var(--color-yellow)", fontWeight: "bold", fontSize: "0.95rem", display: "block" }}>
                    ${order.total.toLocaleString("es-CL")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#888", fontSize: "0.85rem", fontStyle: "italic" }}>No hay historial de compras reciente.</p>
        )}
      </div>

    </div>
  );
}
