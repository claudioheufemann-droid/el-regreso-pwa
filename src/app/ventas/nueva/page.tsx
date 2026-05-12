"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { QuantitySelector } from "@/components/QuantitySelector";

// --- Mocks para UI Rápida ---
const MOCK_CLIENTS = [
  { id: "1", name: "Bar La Taberna", address: "Calle Falsa 123", rut: "76.123.456-7" },
  { id: "2", name: "Botillería El Paso", address: "Av. Siempre Viva 742", rut: "77.987.654-3" },
  { id: "3", name: "Cafetería Central", address: "Plaza de Armas 100", rut: "78.111.222-1" },
];

const MOCK_PRODUCTS = [
  { id: "c1", name: "Arboretum (Kölsch)", price: 2100, type: "CERVEZA", image: "/assets/catalogo/arboretum.png" },
  { id: "c2", name: "Mocho (Red Ale)", price: 2100, type: "CERVEZA", image: "/assets/catalogo/mocho.png" },
  { id: "c3", name: "Fisura (Porter)", price: 2250, type: "CERVEZA", image: "/assets/catalogo/fisura.png" },
  { id: "c4", name: "La Barra (APA)", price: 2250, type: "CERVEZA", image: "/assets/catalogo/la-barra.png" },
  { id: "c5", name: "Descenso (West Coast IPA)", price: 2750, type: "CERVEZA", image: "/assets/catalogo/descenso.png" },
  { id: "c6", name: "Aguas Blancas (Hazy IPA)", price: 3000, type: "CERVEZA", image: "/assets/catalogo/aguas-blancas.png" },
  { id: "k1", name: "Kombucha Lemon", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg" },
  { id: "k2", name: "Kombucha Maracuyá", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg" },
  { id: "k3", name: "Kombucha Berry", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg" },
  { id: "k4", name: "Kombucha Maqui", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg" },
  { id: "k5", name: "Kombucha Detox", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg" },
  { id: "k6", name: "Kombucha Natural", price: 1500, type: "KOMBUCHA", image: "/assets/catalogo/k1.jpg" },
];

export default function NuevaVentaSteper() {
  const router = useRouter();
  
  // --- Estados del Stepper ---
  const [step, setStep] = useState(1);
  
  // --- Paso 1: Cliente ---
  const [clientType, setClientType] = useState<"EXISTING" | "NEW">("EXISTING");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<any>(null);
  const [newClient, setNewClient] = useState({ name: "", rut: "", address: "" });

  // --- Paso 2: Carrito (React State) ---
  const [cart, setCart] = useState<Record<string, { quantity: number; unit: string }>>({});
  const [productSearch, setProductSearch] = useState("");

  // --- Lógica de Búsqueda ---
  const filteredClients = searchTerm.length > 0 
    ? MOCK_CLIENTS.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.rut.includes(searchTerm))
    : [];

  const filteredProducts = productSearch.length > 0
    ? MOCK_PRODUCTS.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : MOCK_PRODUCTS;

  // --- Manejo del Carrito ---
  const handleUpdateCart = (productId: string, quantity: number, unit: string) => {
    setCart(prev => ({
      ...prev,
      [productId]: { quantity, unit }
    }));
  };

  const calculateTotal = () => {
    let total = 0;
    Object.keys(cart).forEach(productId => {
      const product = MOCK_PRODUCTS.find(p => p.id === productId);
      if (product) {
        let multiplier = 1;
        if (cart[productId].unit === "Six-pack") multiplier = 6;
        if (cart[productId].unit === "Caja") multiplier = 24;
        if (cart[productId].unit === "Barril") multiplier = 30; // Aproximación para precio base
        total += product.price * multiplier * cart[productId].quantity;
      }
    });
    return total;
  };

  // --- Cierre de Venta ---
  const handleCheckout = () => {
    // 1. Silent Geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => console.log("Silent GPS:", pos.coords),
        (err) => console.log("GPS Denied")
      );
    }
    
    // 2. WhatsApp Format
    const clientName = clientType === "EXISTING" ? selectedClient?.name : newClient.name;
    const total = calculateTotal();
    
    let itemsText = "";
    Object.keys(cart).forEach(id => {
      if (cart[id].quantity > 0) {
        const p = MOCK_PRODUCTS.find(x => x.id === id);
        let multiplier = 1;
        if (cart[id].unit === "Six-pack") multiplier = 6;
        if (cart[id].unit === "Caja") multiplier = 24;
        if (cart[id].unit === "Barril") multiplier = 30;
        const subtotal = (p?.price || 0) * multiplier * cart[id].quantity;
        itemsText += `%0A- ${cart[id].quantity}x ${cart[id].unit} de ${p?.name} ($${subtotal.toLocaleString("es-CL")})`;
      }
    });

    const msg = `*NUEVO PEDIDO - EL REGRESO*%0ACliente: ${clientName}%0A${itemsText}%0A%0A*TOTAL: $${total.toLocaleString("es-CL")}*`;
    
    // 3. Redirect
    alert(`Pedido confirmado en el sistema por $${total.toLocaleString("es-CL")}. Redirigiendo a WhatsApp...`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
    router.push('/ventas');
  };

  // --- Renderizado Condicional del Contenido Principal ---
  const renderStepContent = () => {
    switch(step) {
      case 1:
        return (
          <section className="card" style={{ animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-yellow)" }}>1. Identificación del Cliente</h2>
            
            <div style={{ display: "flex", marginBottom: "20px", backgroundColor: "#111", borderRadius: "8px", overflow: "hidden", border: "1px solid #333" }}>
              <button 
                onClick={() => setClientType("EXISTING")} 
                style={{ flex: 1, padding: "12px", fontSize: "0.95rem", backgroundColor: clientType === "EXISTING" ? "var(--color-yellow)" : "transparent", color: clientType === "EXISTING" ? "black" : "var(--color-gray-light)", fontWeight: clientType === "EXISTING" ? "bold" : "normal" }}
              >
                Cliente Existente
              </button>
              <button 
                onClick={() => setClientType("NEW")} 
                style={{ flex: 1, padding: "12px", fontSize: "0.95rem", backgroundColor: clientType === "NEW" ? "var(--color-yellow)" : "transparent", color: clientType === "NEW" ? "black" : "var(--color-gray-light)", fontWeight: clientType === "NEW" ? "bold" : "normal" }}
              >
                Nuevo Cliente
              </button>
            </div>

            {clientType === "EXISTING" ? (
              <div>
                <input 
                  type="text" 
                  placeholder="🔍 Buscar por nombre o RUT..." 
                  value={searchTerm} 
                  onChange={e => setSearchTerm(e.target.value)} 
                  style={{ width: "100%", padding: "16px", marginBottom: "12px", backgroundColor: "#222", color: "white", border: "1px solid #444", borderRadius: "8px", fontSize: "1.1rem" }} 
                />
                
                {searchTerm.length > 0 && filteredClients.length === 0 && (
                  <p style={{ color: "var(--color-gray-light)", textAlign: "center", padding: "16px" }}>No se encontraron clientes.</p>
                )}

                {filteredClients.length > 0 && !selectedClient && (
                  <ul style={{ listStyle: "none", padding: 0, margin: 0, border: "1px solid #333", borderRadius: "8px", overflow: "hidden" }}>
                    {filteredClients.map(c => (
                      <li key={c.id} onClick={() => { setSelectedClient(c); setSearchTerm(c.name); }} style={{ padding: "16px", borderBottom: "1px solid #222", cursor: "pointer", backgroundColor: "#111", color: "white" }}>
                        <div style={{ fontWeight: "bold" }}>{c.name}</div>
                        <div style={{ fontSize: "0.85rem", color: "var(--color-gray-light)", marginTop: "4px" }}>{c.rut} • {c.address}</div>
                      </li>
                    ))}
                  </ul>
                )}

                {selectedClient && (
                  <div style={{ padding: "16px", backgroundColor: "rgba(0, 255, 0, 0.1)", border: "1px solid #00FF00", borderRadius: "8px", marginTop: "12px" }}>
                    <strong style={{ color: "#00FF00" }}>✓ Cliente Seleccionado:</strong>
                    <p style={{ margin: "4px 0 0 0", color: "white" }}>{selectedClient.name} ({selectedClient.rut})</p>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                <input type="text" placeholder="Razón Social o Nombre *" value={newClient.name} onChange={e => setNewClient({...newClient, name: e.target.value})} style={{ padding: "16px", backgroundColor: "#222", color: "white", border: "1px solid #444", borderRadius: "8px", fontSize: "1rem" }} />
                <input type="text" placeholder="RUT (Opcional)" value={newClient.rut} onChange={e => setNewClient({...newClient, rut: e.target.value})} style={{ padding: "16px", backgroundColor: "#222", color: "white", border: "1px solid #444", borderRadius: "8px", fontSize: "1rem" }} />
                <input type="text" placeholder="Dirección de Despacho *" value={newClient.address} onChange={e => setNewClient({...newClient, address: e.target.value})} style={{ padding: "16px", backgroundColor: "#222", color: "white", border: "1px solid #444", borderRadius: "8px", fontSize: "1rem" }} />
              </div>
            )}

            <button 
              onClick={() => setStep(2)} 
              disabled={clientType === "EXISTING" ? !selectedClient : !newClient.name || !newClient.address} 
              style={{ width: "100%", padding: "18px", marginTop: "24px", backgroundColor: "var(--color-yellow)", color: "black", fontWeight: "bold", fontSize: "1.1rem", borderRadius: "8px", opacity: (clientType === "EXISTING" ? !selectedClient : (!newClient.name || !newClient.address)) ? 0.5 : 1 }}
            >
              Continuar a Productos ➔
            </button>
          </section>
        );
      
      case 2:
        return (
          <section className="card" style={{ animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-yellow)" }}>2. El Carrito (Productos)</h2>
            
            <input 
              type="text" 
              placeholder="🔍 Filtrar productos..." 
              value={productSearch} 
              onChange={e => setProductSearch(e.target.value)} 
              style={{ width: "100%", padding: "12px", marginBottom: "20px", backgroundColor: "#222", color: "white", border: "1px solid #444", borderRadius: "8px" }} 
            />

            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {filteredProducts.map(p => {
                const qty = cart[p.id]?.quantity || 0;
                const unit = cart[p.id]?.unit || "Unidad";
                const isSelected = qty > 0;
                
                let multiplier = 1;
                if (unit === "Six-pack") multiplier = 6;
                if (unit === "Caja") multiplier = 24;
                if (unit === "Barril") multiplier = 30;
                const subtotal = p.price * multiplier * qty;
                
                return (
                  <div key={p.id} style={{ borderBottom: "1px solid #333", paddingBottom: "20px", opacity: (productSearch && !isSelected) ? 0.8 : 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", alignItems: "flex-start" }}>
                      <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                        <img 
                          src={p.image} 
                          alt={p.name} 
                          style={{ width: "48px", height: "48px", objectFit: "contain", backgroundColor: "#000", borderRadius: "8px", border: "1px solid #333", padding: "4px" }} 
                        />
                        <div>
                          <span style={{ fontWeight: "bold", fontSize: "1.05rem", color: isSelected ? "white" : "var(--color-gray-light)" }}>{p.name}</span>
                          <span style={{ display: "block", fontSize: "0.8rem", color: "#888", marginTop: "2px" }}>{p.type}</span>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <span style={{ color: "var(--color-yellow)", fontWeight: "bold", fontSize: "1.05rem" }}>${p.price.toLocaleString("es-CL")}<span style={{fontSize:"0.8rem", color:"#888"}}>/u</span></span>
                        {qty > 0 && (
                          <div style={{ fontSize: "0.9rem", color: "#00FF00", marginTop: "4px", fontWeight: "bold", animation: "fadeIn 0.2s ease" }}>
                            Subtotal: ${subtotal.toLocaleString("es-CL")}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <QuantitySelector 
                      value={qty} 
                      onChange={(val) => handleUpdateCart(p.id, val, unit)}
                      unit={unit}
                      onUnitChange={(newUnit) => handleUpdateCart(p.id, qty, newUnit)}
                    />
                  </div>
                );
              })}
            </div>

            <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
              <button onClick={() => setStep(1)} style={{ flex: 1, padding: "16px", backgroundColor: "#333", color: "white", borderRadius: "8px", fontWeight: "bold" }}>Atrás</button>
              <button onClick={() => setStep(3)} style={{ flex: 2, padding: "16px", backgroundColor: "var(--color-yellow)", color: "black", fontWeight: "bold", borderRadius: "8px", fontSize: "1.1rem" }}>Ir al Resumen</button>
            </div>
          </section>
        );

      case 3:
        return (
          <section className="card" style={{ animation: "fadeIn 0.3s ease" }}>
            <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-yellow)" }}>3. Validación y Cierre</h2>
            
            <div style={{ marginBottom: "24px", padding: "16px", backgroundColor: "#222", borderRadius: "8px", borderLeft: "4px solid var(--color-yellow)" }}>
              <h3 style={{ fontSize: "0.9rem", color: "var(--color-gray-light)", margin: "0 0 8px 0", textTransform: "uppercase" }}>Cliente Final</h3>
              <p style={{ margin: 0, fontWeight: "bold", fontSize: "1.1rem", color: "white" }}>
                {clientType === "EXISTING" ? selectedClient?.name : newClient.name}
              </p>
              <p style={{ margin: "4px 0 0 0", fontSize: "0.9rem", color: "#aaa" }}>
                {clientType === "EXISTING" ? selectedClient?.address : newClient.address}
              </p>
            </div>

            <div style={{ marginBottom: "24px" }}>
              <h3 style={{ fontSize: "0.9rem", color: "var(--color-gray-light)", margin: "0 0 12px 0", textTransform: "uppercase" }}>Detalle del Pedido</h3>
              
              {Object.keys(cart).filter(id => cart[id].quantity > 0).length === 0 ? (
                 <p style={{ color: "#FF3333", fontStyle: "italic" }}>No has agregado productos al carrito.</p>
              ) : (
                <div style={{ border: "1px solid #333", borderRadius: "8px", overflow: "hidden" }}>
                  {Object.keys(cart).map(productId => {
                    if (cart[productId].quantity > 0) {
                      const product = MOCK_PRODUCTS.find(p => p.id === productId);
                      
                      let multiplier = 1;
                      if (cart[productId].unit === "Six-pack") multiplier = 6;
                      if (cart[productId].unit === "Caja") multiplier = 24;
                      if (cart[productId].unit === "Barril") multiplier = 30;

                      const subtotal = (product?.price || 0) * multiplier * cart[productId].quantity;

                      return (
                        <div key={productId} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #333", backgroundColor: "#111" }}>
                          <div>
                            <div style={{ fontWeight: "bold", color: "white" }}>{product?.name}</div>
                            <div style={{ fontSize: "0.85rem", color: "var(--color-gray-light)" }}>
                              {cart[productId].quantity} {cart[productId].unit}
                            </div>
                          </div>
                          <div style={{ fontWeight: "bold", color: "var(--color-yellow)" }}>
                            ${subtotal.toLocaleString("es-CL")}
                          </div>
                        </div>
                      );
                    }
                    return null;
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: "12px" }}>
              <button onClick={() => setStep(2)} style={{ width: "100%", padding: "16px", backgroundColor: "#333", color: "white", borderRadius: "8px", fontWeight: "bold" }}>Modificar Productos</button>
            </div>
          </section>
        );
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", paddingBottom: "140px" }}>
      {/* Header Secundario */}
      <header style={{ marginBottom: "24px", display: "flex", alignItems: "center", gap: "12px" }}>
        <button onClick={() => router.push("/ventas")} style={{ background: "none", border: "none", color: "var(--color-yellow)", fontSize: "1.5rem", cursor: "pointer", padding: 0 }}>←</button>
        <div>
          <h1 style={{ fontSize: "1.4rem", color: "white", margin: 0 }}>Nueva Venta</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", margin: "4px 0 0 0" }}>Paso {step} de 3</p>
        </div>
      </header>

      {/* Progress Bar */}
      <div style={{ width: "100%", height: "4px", backgroundColor: "#333", borderRadius: "2px", marginBottom: "24px", overflow: "hidden" }}>
        <div style={{ width: `${(step / 3) * 100}%`, height: "100%", backgroundColor: "var(--color-yellow)", transition: "width 0.3s ease" }} />
      </div>

      {renderStepContent()}

      {/* STICKY BOTTOM BAR */}
      {step > 1 && (
        <div style={{ 
          position: "fixed", 
          bottom: 0, 
          left: 0, 
          right: 0, 
          padding: "16px 20px", 
          backgroundColor: "rgba(17, 17, 17, 0.95)", 
          backdropFilter: "blur(10px)",
          borderTop: "1px solid #333", 
          display: "flex", 
          justifyContent: "space-between", 
          alignItems: "center", 
          zIndex: 50,
          boxShadow: "0 -4px 20px rgba(0,0,0,0.5)"
        }}>
          <div>
            <p style={{ margin: "0 0 4px 0", fontSize: "0.85rem", color: "var(--color-gray-light)", textTransform: "uppercase" }}>Total a Cobrar</p>
            <p style={{ margin: 0, fontSize: "1.8rem", fontWeight: "bold", color: "#00FF00" }}>${calculateTotal().toLocaleString("es-CL")}</p>
          </div>
          {step === 3 && (
            <button 
              onClick={handleCheckout} 
              disabled={calculateTotal() === 0}
              style={{ 
                padding: "16px 24px", 
                backgroundColor: calculateTotal() === 0 ? "#555" : "#25D366", 
                color: "white", 
                fontWeight: "bold", 
                borderRadius: "8px", 
                border: "none", 
                display: "flex", 
                alignItems: "center", 
                gap: "8px",
                fontSize: "1.1rem",
                boxShadow: calculateTotal() > 0 ? "0 4px 15px rgba(37, 211, 102, 0.3)" : "none"
              }}
            >
              <span>✅ Finalizar Venta</span>
            </button>
          )}
        </div>
      )}
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
