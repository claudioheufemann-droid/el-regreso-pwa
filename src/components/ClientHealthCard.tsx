"use client";

import { AlertTriangle, ChevronRight, FileText, CheckCircle2 } from "lucide-react";

interface DebtDetail {
  product: string;
  quantity: number;
  amount: number;
}

interface OrderHistory {
  date: string;
  total: number;
}

interface ClientHealthCardProps {
  debt: number;
  daysLate: number;
  debtDetails: DebtDetail[];
  recentOrders: OrderHistory[];
}

export function ClientHealthCard({ debt, daysLate, debtDetails, recentOrders }: ClientHealthCardProps) {
  const hasDebt = debt > 0;
  
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* 1. Estado Financiero */}
      <div>
        <h3 style={{ fontSize: "1.1rem", color: "white", margin: "0 0 12px 0", borderBottom: "1px solid #333", paddingBottom: "8px" }}>Estado Financiero</h3>
        
        {hasDebt ? (
          <div style={{ backgroundColor: "#111", border: "1px solid #333", borderRadius: "12px", overflow: "hidden" }}>
            <div style={{ padding: "16px", backgroundColor: "rgba(220, 38, 38, 0.1)", borderBottom: "1px solid #333" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                <AlertTriangle size={18} color="#DC2626" />
                <span style={{ color: "#DC2626", fontWeight: "bold", fontSize: "0.9rem" }}>DEUDA VENCIDA ({daysLate} días)</span>
              </div>
              <p style={{ margin: 0, fontSize: "2rem", fontWeight: "bold", color: "#DC2626", whiteSpace: "nowrap" }}>
                ${debt.toLocaleString("es-CL")}
              </p>
            </div>

            {/* Panel de Detalle de Deuda */}
            {debtDetails.length > 0 && (
              <div style={{ padding: "12px 16px", backgroundColor: "#1a1a1a" }}>
                <p style={{ margin: "0 0 12px 0", fontSize: "0.85rem", color: "#888", textTransform: "uppercase", fontWeight: "bold" }}>Detalle de facturas impagas</p>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                  {debtDetails.map((item, idx) => (
                    <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.9rem" }}>
                      <div style={{ display: "flex", gap: "8px", color: "white" }}>
                        <span style={{ color: "#888", width: "24px" }}>{item.quantity}x</span>
                        <span>{item.product}</span>
                      </div>
                      <span style={{ color: "#DC2626", fontWeight: "bold", whiteSpace: "nowrap" }}>${item.amount.toLocaleString("es-CL")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div style={{ padding: "16px", backgroundColor: "rgba(37, 211, 102, 0.1)", border: "1px solid #25D366", borderRadius: "12px" }}>
             <p style={{ margin: 0, color: "#25D366", fontWeight: "bold", display: "flex", alignItems: "center", gap: "8px" }}><CheckCircle2 size={18} /> Cliente al día. Sin deuda vigente.</p>
          </div>
        )}
      </div>

      {/* 2. Historial de Compras */}
      <div>
        <h3 style={{ fontSize: "1.1rem", color: "white", margin: "0 0 12px 0", borderBottom: "1px solid #333", paddingBottom: "8px" }}>Historial de Compras</h3>
        
        {recentOrders.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {recentOrders.map((order, idx) => (
              <div key={idx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px", backgroundColor: "#111", border: "1px solid #333", borderRadius: "12px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                  <div style={{ padding: "10px", backgroundColor: "#222", borderRadius: "8px" }}>
                    <FileText size={20} color="var(--color-gray-light)" />
                  </div>
                  <div>
                    <span style={{ color: "white", fontWeight: "bold", fontSize: "1rem", display: "block" }}>{order.date}</span>
                    <span style={{ color: "var(--color-yellow)", fontWeight: "bold", fontSize: "0.95rem", whiteSpace: "nowrap" }}>
                      ${order.total.toLocaleString("es-CL")}
                    </span>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "#888", fontSize: "0.85rem", fontWeight: "bold" }}>
                  Ver Detalle <ChevronRight size={16} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: "#888", fontSize: "0.85rem", fontStyle: "italic" }}>No hay historial de compras reciente.</p>
        )}
      </div>

    </div>
  );
}
