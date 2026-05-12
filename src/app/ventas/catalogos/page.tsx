"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CatalogShare } from "@/components/CatalogShare";
import { Beer, Jellyfish, LayoutGrid } from "lucide-react";

// Catálogo Oficial 2026
const CATALOGO_PRODUCTOS = [
  { id: "c1", name: "Arboretum (Kölsch)", price: 2100, type: "CERVEZA", image: "/assets/catalogo/arboretum.png", desc: "Suave, refrescante, dorada y ligera." },
  { id: "c2", name: "Mocho (Red Ale)", price: 2100, type: "CERVEZA", image: "/assets/catalogo/mocho.png", desc: "Notas a caramelo, cuerpo medio, ámbar." },
  { id: "c3", name: "Fisura (Porter)", price: 2250, type: "CERVEZA", image: "/assets/catalogo/fisura.png", desc: "Oscura, notas a café y chocolate negro." },
  { id: "c4", name: "La Barra (APA)", price: 2250, type: "CERVEZA", image: "/assets/catalogo/la-barra.png", desc: "Amargor medio, aromas frutales y cítricos." },
  { id: "c5", name: "Descenso (West Coast IPA)", price: 2750, type: "CERVEZA", image: "/assets/catalogo/descenso.png", desc: "Amargor intenso, notas resinosas." },
  { id: "c6", name: "Aguas Blancas (Hazy IPA)", price: 3000, type: "CERVEZA", image: "/assets/catalogo/aguas-blancas.png", desc: "Sedosa, turbia, explosión de lúpulos frutales." },
  { id: "k1", name: "Kombucha Lemon", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg", desc: "Kombucha cítrica refrescante." },
  { id: "k2", name: "Kombucha Maracuyá", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg", desc: "Sabor tropical vibrante." },
  { id: "k3", name: "Kombucha Berry", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg", desc: "Infusión de frutos rojos y antioxidantes." },
  { id: "k4", name: "Kombucha Maqui", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg", desc: "Kombucha con superalimento del sur." },
  { id: "k5", name: "Kombucha Detox", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg", desc: "Purificante con ingredientes activos." },
  { id: "k6", name: "Kombucha Natural", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg", desc: "El sabor clásico y original." },
];

export default function CatalogoPage() {
  const router = useRouter();
  const [filter, setFilter] = useState<"ALL" | "CERVEZA" | "KOMBUCHA">("ALL");

  const filteredProducts = filter === "ALL" 
    ? CATALOGO_PRODUCTOS 
    : CATALOGO_PRODUCTOS.filter(p => p.type === filter);

  return (
    <div style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "black" }}>
      
      {/* Header Fijo */}
      <header style={{ flexShrink: 0, padding: "16px 20px", display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid #333", backgroundColor: "black", zIndex: 10 }}>
        <button onClick={() => router.push("/ventas")} style={{ background: "none", border: "none", color: "var(--color-yellow)", fontSize: "1.5rem", cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <h1 style={{ fontSize: "1.4rem", color: "white", margin: 0 }}>Catálogo de Productos</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", margin: "4px 0 0 0" }}>Tarifado Oficial 2026 (HORECA)</p>
        </div>
      </header>

      {/* Botones de Filtro Fijos */}
      <div style={{ flexShrink: 0, display: "flex", gap: "12px", padding: "16px 20px 8px 20px", overflowX: "auto", backgroundColor: "black", zIndex: 10 }}>
        <button 
          onClick={() => setFilter("ALL")}
          style={{ padding: "10px 20px", borderRadius: "20px", border: "none", backgroundColor: filter === "ALL" ? "var(--color-yellow)" : "#222", color: filter === "ALL" ? "black" : "white", fontWeight: "bold", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
        >
          <LayoutGrid size={16} /> Todos
        </button>
        <button 
          onClick={() => setFilter("CERVEZA")}
          style={{ padding: "10px 20px", borderRadius: "20px", border: "none", backgroundColor: filter === "CERVEZA" ? "#4D90FE" : "#222", color: filter === "CERVEZA" ? "white" : "white", fontWeight: "bold", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
        >
          <Beer size={16} /> Cervezas
        </button>
        <button 
          onClick={() => setFilter("KOMBUCHA")}
          style={{ padding: "10px 20px", borderRadius: "20px", border: "none", backgroundColor: filter === "KOMBUCHA" ? "var(--color-yellow)" : "#222", color: filter === "KOMBUCHA" ? "black" : "white", fontWeight: "bold", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: "6px", cursor: "pointer" }}
        >
          <Jellyfish size={16} /> Kombuchas
        </button>
      </div>

      {/* Listado de Productos Scrollable (Overflow-Y Auto) */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px", display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: "16px", alignContent: "start", paddingBottom: "32px" }}>
        {filteredProducts.map(product => (
          <div key={product.id} style={{ padding: "0", overflow: "hidden", border: "1px solid #333", backgroundColor: "#111", display: "flex", flexDirection: "column", borderRadius: "8px" }}>
            <div style={{ position: "relative", width: "100%", paddingTop: "100%", backgroundColor: "#000" }}>
              <img 
                src={product.image} 
                alt={product.name} 
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "contain", padding: "12px" }}
              />
            </div>
            <div style={{ padding: "16px", flex: 1, display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "0.7rem", color: product.type === "CERVEZA" ? "#4D90FE" : "var(--color-yellow)", fontWeight: "bold", textTransform: "uppercase", marginBottom: "4px" }}>
                {product.type}
              </span>
              <h3 style={{ fontSize: "1.1rem", color: "white", margin: "0 0 8px 0" }}>{product.name}</h3>
              <p style={{ fontSize: "0.8rem", color: "#888", margin: "0 0 16px 0", flex: 1 }}>{product.desc}</p>
              
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: "auto" }}>
                <span style={{ color: "white", fontWeight: "bold", fontSize: "1.2rem" }}>
                  ${product.price.toLocaleString("es-CL")}
                </span>
                <span style={{ fontSize: "0.8rem", color: "#666" }}>/lata</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer Fijo con Formulario de WhatsApp */}
      <div style={{ flexShrink: 0 }}>
        <CatalogShare />
      </div>

    </div>
  );
}
