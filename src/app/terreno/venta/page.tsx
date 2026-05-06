"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Channel = "HORECA" | "RETAIL";
type Format = "BARRILES" | "LATAS";
type LataType = "DISPLAY_24" | "SUELTAS";
type ProductType = "CERVEZA" | "KOMBUCHA";

interface ProductPrices {
  id: string;
  name: string;
  type: ProductType;
  horecaLata: number;
  horecaBarril: number;
  retailLata: number;
  retailBarril: number;
}

const PRODUCTS: ProductPrices[] = [
  // Cervezas
  { id: "c1", name: "Kolsch", type: "CERVEZA", horecaLata: 2100, horecaBarril: 83000, retailLata: 1890, retailBarril: 0 },
  { id: "c2", name: "Red Ale", type: "CERVEZA", horecaLata: 2100, horecaBarril: 83000, retailLata: 1890, retailBarril: 0 },
  { id: "c3", name: "Porter", type: "CERVEZA", horecaLata: 2250, horecaBarril: 90000, retailLata: 2050, retailBarril: 0 },
  { id: "c4", name: "APA", type: "CERVEZA", horecaLata: 2250, horecaBarril: 90000, retailLata: 2025, retailBarril: 0 },
  { id: "c5", name: "West Coast IPA", type: "CERVEZA", horecaLata: 2750, horecaBarril: 110000, retailLata: 2475, retailBarril: 0 },
  { id: "c6", name: "Hazy IPA", type: "CERVEZA", horecaLata: 3000, horecaBarril: 125000, retailLata: 2700, retailBarril: 0 },
  // Kombuchas
  { id: "k1", name: "Lemon Fresh", type: "KOMBUCHA", horecaLata: 1500, horecaBarril: 75000, retailLata: 1350, retailBarril: 0 },
  { id: "k2", name: "Maracuyá Cardamomo", type: "KOMBUCHA", horecaLata: 1500, horecaBarril: 75000, retailLata: 1350, retailBarril: 0 },
  { id: "k3", name: "Berry Menta", type: "KOMBUCHA", horecaLata: 1500, horecaBarril: 75000, retailLata: 1350, retailBarril: 0 },
  { id: "k4", name: "Maqui Hops", type: "KOMBUCHA", horecaLata: 1500, horecaBarril: 75000, retailLata: 1350, retailBarril: 0 },
  { id: "k5", name: "Detox", type: "KOMBUCHA", horecaLata: 1500, horecaBarril: 75000, retailLata: 1350, retailBarril: 0 },
  { id: "k6", name: "Natural", type: "KOMBUCHA", horecaLata: 1500, horecaBarril: 75000, retailLata: 1350, retailBarril: 0 },
];

export default function VentaDashboard() {
  const [step, setStep] = useState<"CONFIG" | "CATALOG">("CONFIG");
  const [channel, setChannel] = useState<Channel | null>(null);
  const [format, setFormat] = useState<Format | null>(null);
  const [lataType, setLataType] = useState<LataType | null>(null);
  
  const [cart, setCart] = useState<Record<string, number>>({});

  const getBasePrice = (p: ProductPrices) => {
    if (channel === "HORECA") {
      return format === "BARRILES" ? p.horecaBarril : p.horecaLata;
    } else {
      return format === "BARRILES" ? p.retailBarril : p.retailLata;
    }
  };

  // Solo mostramos productos que tengan un precio mayor a 0 en la configuración actual
  const availableProducts = PRODUCTS.filter(p => getBasePrice(p) > 0);

  const updateQuantity = (id: string, delta: number) => {
    setCart((prev) => {
      const current = prev[id] || 0;
      const next = Math.max(0, current + delta);
      const newCart = { ...prev };
      if (next === 0) {
        delete newCart[id];
      } else {
        newCart[id] = next;
      }
      return newCart;
    });
  };

  // Motor de Mix-Match, Costeos y Reglas
  const orderStats = useMemo(() => {
    let totalUnits = 0; // Unidades en carrito (displays, latas o barriles)
    let totalLatas = 0; // Cantidad real de latas para evaluar mix-match o múltiplos
    let baseNetTotal = 0;
    
    Object.entries(cart).forEach(([id, qty]) => {
      totalUnits += qty;
      if (format === "LATAS") {
         totalLatas += (lataType === "DISPLAY_24" ? qty * 24 : qty);
      }
    });

    const isMixMatchActive = format === "LATAS" && totalLatas >= 72;
    
    let finalNetTotal = 0;
    let totalDiscount = 0;

    Object.entries(cart).forEach(([id, qty]) => {
      const p = PRODUCTS.find((x) => x.id === id)!;
      let unitPrice = getBasePrice(p);
      let unitDiscount = 0;

      if (format === "LATAS") {
        if (lataType === "DISPLAY_24") {
          unitPrice = unitPrice * 24;
          if (isMixMatchActive) {
            unitDiscount = (p.type === "CERVEZA" ? 100 : 50) * 24;
          }
        } else {
          // SUELTAS
          if (isMixMatchActive) {
            unitDiscount = p.type === "CERVEZA" ? 100 : 50;
          }
        }
      }

      baseNetTotal += unitPrice * qty;
      totalDiscount += unitDiscount * qty;
      finalNetTotal += (unitPrice - unitDiscount) * qty;
    });

    const iva = Math.round(finalNetTotal * 0.19);
    const grossTotal = finalNetTotal + iva;

    let canEmit = totalUnits > 0;
    if (format === "LATAS" && lataType === "SUELTAS") {
      canEmit = totalUnits > 0 && totalLatas % 24 === 0;
    }

    return {
      totalUnits,
      totalLatas,
      baseNetTotal,
      totalDiscount,
      finalNetTotal,
      iva,
      grossTotal,
      isMixMatchActive,
      canEmit
    };
  }, [cart, format, lataType, channel]);

  const generateReceiptAndShare = async () => {
    const doc = new jsPDF();
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(255, 215, 0); 
    doc.rect(0, 0, 210, 30, 'F');
    doc.text("EL REGRESO", 14, 20);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(12);
    doc.setTextColor(0, 0, 0);
    doc.text(`Comprobante de Pedido - Canal: ${channel}`, 14, 40);
    doc.text(`Formato: ${format} ${format === "LATAS" ? `(${lataType === "DISPLAY_24" ? "Display Cerrado 24u" : "Sueltas"})` : ""}`, 14, 46);
    doc.text(`Fecha: ${new Date().toLocaleDateString("es-CL")}`, 14, 52);

    const tableBody = Object.entries(cart).map(([id, qty]) => {
      const p = PRODUCTS.find(x => x.id === id)!;
      let unitPrice = getBasePrice(p);
      let uDiscount = 0;
      
      if (format === "LATAS") {
        if (lataType === "DISPLAY_24") {
          unitPrice = unitPrice * 24;
          if (orderStats.isMixMatchActive) {
            uDiscount = (p.type === "CERVEZA" ? 100 : 50) * 24;
          }
        } else {
          if (orderStats.isMixMatchActive) {
            uDiscount = p.type === "CERVEZA" ? 100 : 50;
          }
        }
      }

      return [
        p.name,
        qty.toString(),
        `$${unitPrice.toLocaleString("es-CL")}`,
        `-$${uDiscount.toLocaleString("es-CL")}`,
        `$${((unitPrice - uDiscount) * qty).toLocaleString("es-CL")}`
      ];
    });

    autoTable(doc, {
      startY: 60,
      head: [['Producto', 'Cant.', 'Precio Base (Neto)', 'Descuento U.', 'Total (Neto)']],
      body: tableBody,
      theme: 'grid',
      headStyles: { fillColor: [0, 0, 0], textColor: [255, 215, 0] },
      styles: { fontSize: 10 }
    });

    const finalY = (doc as any).lastAutoTable.finalY || 65;
    
    doc.setFont("helvetica", "bold");
    doc.text(`Subtotal Neto: $${orderStats.baseNetTotal.toLocaleString("es-CL")}`, 130, finalY + 10);
    if (orderStats.totalDiscount > 0) {
      doc.setTextColor(0, 150, 0);
      doc.text(`Ahorro Mix-Match: -$${orderStats.totalDiscount.toLocaleString("es-CL")}`, 130, finalY + 18);
    }
    doc.setTextColor(0, 0, 0);
    doc.text(`Total Neto: $${orderStats.finalNetTotal.toLocaleString("es-CL")}`, 130, finalY + 26);
    doc.text(`IVA (19%): $${orderStats.iva.toLocaleString("es-CL")}`, 130, finalY + 34);
    
    doc.setFontSize(14);
    doc.text(`TOTAL BRUTO: $${orderStats.grossTotal.toLocaleString("es-CL")}`, 130, finalY + 45);

    const pdfBlob = doc.output("blob");
    const file = new File([pdfBlob], "Comprobante_Pedido_ElRegreso.pdf", { type: "application/pdf" });

    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "Comprobante de Pedido",
          text: `Pedido por $${orderStats.grossTotal.toLocaleString("es-CL")} bruto.`,
        });
      } catch (err) {
        console.error("Error compartiendo:", err);
      }
    } else {
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "Comprobante_Pedido_ElRegreso.pdf";
      a.click();
      const text = encodeURIComponent(`Hola! Tu pedido por $${orderStats.grossTotal.toLocaleString("es-CL")} bruto ha sido registrado. El comprobante fue descargado.`);
      window.open(`https://wa.me/?text=${text}`, "_blank");
    }
  };

  const handleStartCatalog = () => {
    setCart({}); // Reset cart on new config
    setStep("CATALOG");
  };

  if (step === "CONFIG") {
    return (
      <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto" }}>
        <header style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: "1.8rem", color: "var(--color-yellow)" }}>Configuración de Venta</h1>
          <Link href="/terreno" style={{ color: "var(--color-gray-light)", textDecoration: "underline" }}>Volver</Link>
        </header>

        <section className="card" style={{ marginBottom: "24px" }}>
          <h2 style={{ color: "var(--color-yellow)", marginBottom: "16px" }}>1. Canal de Venta</h2>
          <div className="flex-col-to-row">
            <button onClick={() => setChannel("HORECA")} style={{ flex: 1, backgroundColor: channel === "HORECA" ? "var(--color-yellow)" : "var(--color-black)", color: channel === "HORECA" ? "black" : "white" }}>HORECA</button>
            <button onClick={() => setChannel("RETAIL")} style={{ flex: 1, backgroundColor: channel === "RETAIL" ? "var(--color-yellow)" : "var(--color-black)", color: channel === "RETAIL" ? "black" : "white" }}>Retail</button>
          </div>
        </section>
        
        {channel && (
          <section className="card" style={{ marginBottom: "24px" }}>
            <h2 style={{ color: "var(--color-yellow)", marginBottom: "16px" }}>2. Formato</h2>
            <div className="flex-col-to-row">
              <button onClick={() => { setFormat("BARRILES"); setLataType(null); }} style={{ flex: 1, backgroundColor: format === "BARRILES" ? "var(--color-yellow)" : "var(--color-black)", color: format === "BARRILES" ? "black" : "white" }}>Barriles</button>
              <button onClick={() => setFormat("LATAS")} style={{ flex: 1, backgroundColor: format === "LATAS" ? "var(--color-yellow)" : "var(--color-black)", color: format === "LATAS" ? "black" : "white" }}>Latas</button>
            </div>
          </section>
        )}

        {format === "LATAS" && (
          <section className="card" style={{ marginBottom: "24px" }}>
            <h2 style={{ color: "var(--color-yellow)", marginBottom: "16px" }}>3. Tipo de Venta (Latas)</h2>
            <div className="flex-col-to-row">
              <button onClick={() => setLataType("DISPLAY_24")} style={{ flex: 1, backgroundColor: lataType === "DISPLAY_24" ? "var(--color-yellow)" : "var(--color-black)", color: lataType === "DISPLAY_24" ? "black" : "white" }}>Display Cerrado (24 un.)</button>
              <button onClick={() => setLataType("SUELTAS")} style={{ flex: 1, backgroundColor: lataType === "SUELTAS" ? "var(--color-yellow)" : "var(--color-black)", color: lataType === "SUELTAS" ? "black" : "white" }}>Latas Sueltas</button>
            </div>
            <p style={{ marginTop: "12px", fontSize: "0.85rem", color: "var(--color-gray-light)" }}>
              * Al elegir Latas Sueltas, el sistema obligará a que el pedido total sume múltiplos de 24.
            </p>
          </section>
        )}

        <button 
          disabled={!channel || !format || (format === "LATAS" && !lataType)} 
          onClick={handleStartCatalog}
          style={{ width: "100%", padding: "16px", fontSize: "1.2rem" }}
        >
          Confirmar y Ver Catálogo
        </button>
      </div>
    );
  }

  // CATALOG VIEW
  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", paddingBottom: "120px" }}>
      <header style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", color: "var(--color-yellow)" }}>Toma de Pedido</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.9rem" }}>{channel} | {format} {format === "LATAS" && `(${lataType === "DISPLAY_24" ? "Display 24u" : "Sueltas"})`}</p>
        </div>
        <button onClick={() => setStep("CONFIG")} style={{ backgroundColor: "transparent", color: "var(--color-gray-light)", textDecoration: "underline", padding: 0 }}>Volver a Configurar</button>
      </header>

      {/* Indicador de Mix-Match (Solo para Latas) */}
      {format === "LATAS" && (
        <div style={{ 
          padding: "16px", 
          borderRadius: "8px", 
          marginBottom: "24px",
          backgroundColor: orderStats.isMixMatchActive ? "rgba(255, 215, 0, 0.1)" : "var(--color-gray-dark)",
          border: `1px solid ${orderStats.isMixMatchActive ? "var(--color-yellow)" : "#333"}`,
          transition: "all 0.3s ease"
        }}>
          <h3 style={{ color: orderStats.isMixMatchActive ? "var(--color-yellow)" : "var(--color-text)", marginBottom: "4px" }}>
            {orderStats.isMixMatchActive ? "🎉 ¡Descuento Mix-Match Activado!" : "Regla Mix-Match"}
          </h3>
          <p style={{ fontSize: "0.9rem" }}>
            {orderStats.isMixMatchActive 
              ? `Se aplicó descuento (-$100 Cervezas / -$50 Kombuchas). Llevas ${orderStats.totalLatas} latas.`
              : `Suma 72 latas o más para activar descuentos por volumen. Te faltan ${Math.max(0, 72 - orderStats.totalLatas)} latas.`}
          </p>
          <div style={{ marginTop: "12px", width: "100%", height: "8px", backgroundColor: "var(--color-black)", borderRadius: "4px", overflow: "hidden" }}>
            <div style={{ 
              height: "100%", 
              backgroundColor: orderStats.isMixMatchActive ? "var(--color-yellow)" : "#555",
              width: `${Math.min(100, (orderStats.totalLatas / 72) * 100)}%`,
              transition: "width 0.3s ease"
            }} />
          </div>
        </div>
      )}

      {availableProducts.length === 0 ? (
        <div className="card" style={{ textAlign: "center", color: "#FF3333" }}>
          No hay productos disponibles para la configuración seleccionada (Ej: Barriles en Retail).
        </div>
      ) : (
        <div className="grid-1-to-2">
          {/* Catálogo de Cervezas */}
          <section className="card">
            <h2 style={{ color: "var(--color-yellow)", marginBottom: "16px", borderBottom: "1px solid #333", paddingBottom: "8px" }}>🍺 Cervezas</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {availableProducts.filter(p => p.type === "CERVEZA").map(product => (
                <div key={product.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ fontSize: "1.1rem" }}>{product.name}</h4>
                    <span style={{ color: "var(--color-gray-light)", fontSize: "0.85rem" }}>
                      ${getBasePrice(product)} neto 
                      {format === "LATAS" && lataType === "DISPLAY_24" ? " /lata (Venta Display)" : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: "var(--color-black)", padding: "4px", borderRadius: "8px" }}>
                    <button onClick={() => updateQuantity(product.id, -1)} style={{ padding: "8px 16px", fontSize: "1.2rem", backgroundColor: "#333", color: "white" }}>-</button>
                    <span style={{ width: "24px", textAlign: "center", fontSize: "1.2rem", fontWeight: "bold" }}>{cart[product.id] || 0}</span>
                    <button onClick={() => updateQuantity(product.id, 1)} style={{ padding: "8px 16px", fontSize: "1.2rem" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Catálogo de Kombuchas */}
          <section className="card">
            <h2 style={{ color: "var(--color-yellow)", marginBottom: "16px", borderBottom: "1px solid #333", paddingBottom: "8px" }}>🌿 Kombuchas</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {availableProducts.filter(p => p.type === "KOMBUCHA").map(product => (
                <div key={product.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <h4 style={{ fontSize: "1.1rem" }}>{product.name}</h4>
                    <span style={{ color: "var(--color-gray-light)", fontSize: "0.85rem" }}>
                      ${getBasePrice(product)} neto
                      {format === "LATAS" && lataType === "DISPLAY_24" ? " /lata (Venta Display)" : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", backgroundColor: "var(--color-black)", padding: "4px", borderRadius: "8px" }}>
                    <button onClick={() => updateQuantity(product.id, -1)} style={{ padding: "8px 16px", fontSize: "1.2rem", backgroundColor: "#333", color: "white" }}>-</button>
                    <span style={{ width: "24px", textAlign: "center", fontSize: "1.2rem", fontWeight: "bold" }}>{cart[product.id] || 0}</span>
                    <button onClick={() => updateQuantity(product.id, 1)} style={{ padding: "8px 16px", fontSize: "1.2rem" }}>+</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* Sticky Bottom Bar for Checkout */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, width: "100%", 
        backgroundColor: "var(--color-gray-dark)", 
        borderTop: "2px solid var(--color-yellow)",
        padding: "16px 24px",
        boxShadow: "0 -4px 10px rgba(0,0,0,0.5)",
        zIndex: 100
      }}>
        <div style={{ maxWidth: "800px", margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "16px" }}>
          <div>
            <div style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", display: "flex", gap: "12px" }}>
              <span>Subtotal: ${orderStats.baseNetTotal.toLocaleString("es-CL")}</span>
              {orderStats.totalDiscount > 0 && <span style={{ color: "#00FF00" }}>Ahorro: -${orderStats.totalDiscount.toLocaleString("es-CL")}</span>}
            </div>
            <div style={{ fontSize: "1.4rem", fontWeight: "bold", color: "white" }}>
              Total Neto: <span style={{ color: "var(--color-yellow)" }}>${orderStats.finalNetTotal.toLocaleString("es-CL")}</span>
            </div>
            <div style={{ fontSize: "0.85rem", color: "#888" }}>+ IVA (19%): ${orderStats.iva.toLocaleString("es-CL")} | Bruto: ${orderStats.grossTotal.toLocaleString("es-CL")}</div>
            {format === "LATAS" && lataType === "SUELTAS" && orderStats.totalLatas % 24 !== 0 && (
              <div style={{ color: "#FF3333", fontSize: "0.85rem", marginTop: "4px", fontWeight: "bold" }}>
                ⚠ Tienes {orderStats.totalLatas} latas. Faltan {24 - (orderStats.totalLatas % 24)} para armar caja.
              </div>
            )}
          </div>
          
          <button 
            disabled={!orderStats.canEmit}
            style={{ padding: "16px 32px", fontSize: "1.1rem" }}
            onClick={generateReceiptAndShare}
          >
            Emitir ({orderStats.totalUnits} {lataType === "DISPLAY_24" ? "Displays" : (format === "BARRILES" ? "Barriles" : "Latas")})
          </button>
        </div>
      </div>
    </div>
  );
}
