"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SmartStepper } from "@/components/SmartStepper";
import { StoreAudit } from "@/components/StoreAudit";
import { ClientHealthCard } from "@/components/ClientHealthCard";

// --- Mocks para UI Rápida ---
const MOCK_CLIENTS = [
  { 
    id: "1", name: "Bar La Taberna", address: "Calle Falsa 123", rut: "76.123.456-7", 
    debt: 150000, daysLate: 35, 
    debtDetails: [
      { product: "Arboretum (Barril)", quantity: 2, amount: 60000 },
      { product: "Kombucha Lemon (Caja)", quantity: 5, amount: 90000 }
    ],
    recentOrders: [ 
      { date: "12 May", total: 45000 }, 
      { date: "05 May", total: 50000 }, 
      { date: "28 Abr", total: 90000 },
      { date: "15 Abr", total: 30000 },
      { date: "01 Abr", total: 45000 }
    ] 
  },
  { 
    id: "2", name: "Botillería El Paso", address: "Av. Siempre Viva 742", rut: "77.987.654-3", 
    debt: 0, daysLate: 0, debtDetails: [],
    recentOrders: [ { date: "10 May", total: 80000 } ] 
  },
  { 
    id: "3", name: "Cafetería Central", address: "Plaza de Armas 100", rut: "78.111.222-1", 
    debt: 25000, daysLate: 15, debtDetails: [{ product: "Descenso (West Coast IPA)", quantity: 1, amount: 25000 }], 
    recentOrders: [] 
  },
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

  // --- Paso 2: Auditoría ---
  const [isAuditValid, setIsAuditValid] = useState(false);

  // --- Paso 3: Carrito ---
  const [cart, setCart] = useState<Record<string, number>>({});
  const [productSearch, setProductSearch] = useState("");

  const filteredClients = searchTerm.length > 0 
    ? MOCK_CLIENTS.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.rut.includes(searchTerm))
    : [];

  const filteredProducts = productSearch.length > 0
    ? MOCK_PRODUCTS.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
    : MOCK_PRODUCTS;

  const handleUpdateCart = (productId: string, quantity: number) => {
    setCart(prev => ({ ...prev, [productId]: quantity }));
  };

  const calculateTotal = () => {
    let total = 0;
    Object.keys(cart).forEach(productId => {
      const product = MOCK_PRODUCTS.find(p => p.id === productId);
      if (product && cart[productId] > 0) {
        total += product.price * cart[productId];
      }
    });
    return total;
  };

  const handleCheckout = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => console.log("Silent GPS:", pos.coords),
        (err) => console.log("GPS Denied")
      );
    }
    
    const clientName = clientType === "EXISTING" ? selectedClient?.name : newClient.name;
    const total = calculateTotal();
    
    let itemsText = "";
    Object.keys(cart).forEach(id => {
      if (cart[id] > 0) {
        const p = MOCK_PRODUCTS.find(x => x.id === id);
        const subtotal = (p?.price || 0) * cart[id];
        itemsText += `%0A- ${cart[id]}x ${p?.name} ($${subtotal.toLocaleString("es-CL")})`;
      }
    });

    const msg = `*NUEVO PEDIDO - EL REGRESO*%0ACliente: ${clientName}%0A${itemsText}%0A%0A*TOTAL: $${total.toLocaleString("es-CL")}*`;
    
    alert(`Pedido confirmado en el sistema por $${total.toLocaleString("es-CL")}. Redirigiendo a WhatsApp...`);
    window.open(`https://wa.me/?text=${msg}`, "_blank");
    router.push('/ventas');
  };

  const renderStepContent = () => {
    switch(step) {
      case 1:
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "20px" }}>
            <section className="card" style={{ animation: "fadeIn 0.3s ease" }}>
              <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-yellow)" }}>1. Identificación del Cliente</h2>
              
              <div style={{ display: "flex", marginBottom: "20px", backgroundColor: "#111", borderRadius: "8px", overflow: "hidden", border: "1px solid #333" }}>
                <button 
                  onClick={() => setClientType("EXISTING")} 
                  style={{ flex: 1, padding: "12px", fontSize: "0.95rem", backgroundColor: clientType === "EXISTING" ? "var(--color-yellow)" : "transparent", color: clientType === "EXISTING" ? "black" : "var(--color-gray-light)", fontWeight: clientType === "EXISTING" ? "bold" : "normal", cursor: "pointer" }}
                >
                  Cliente Existente
                </button>
                <button 
                  onClick={() => setClientType("NEW")} 
                  style={{ flex: 1, padding: "12px", fontSize: "0.95rem", backgroundColor: clientType === "NEW" ? "var(--color-yellow)" : "transparent", color: clientType === "NEW" ? "black" : "var(--color-gray-light)", fontWeight: clientType === "NEW" ? "bold" : "normal", cursor: "pointer" }}
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
                    onChange={e => { setSearchTerm(e.target.value); setSelectedClient(null); }} 
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
                onClick={() => { setStep(2); setIsAuditValid(false); }} 
                disabled={clientType === "EXISTING" ? !selectedClient : !newClient.name || !newClient.address} 
                style={{ width: "100%", padding: "18px", marginTop: "24px", backgroundColor: "var(--color-yellow)", color: "black", fontWeight: "bold", fontSize: "1.1rem", borderRadius: "8px", opacity: (clientType === "EXISTING" ? !selectedClient : (!newClient.name || !newClient.address)) ? 0.5 : 1, transition: "all 0.3s", cursor: "pointer" }}
              >
                Continuar a Inteligencia Comercial ➔
              </button>
            </section>
          </div>
        );

      case 2:
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "20px", paddingBottom: "100px" }}>
            <section style={{ animation: "fadeIn 0.3s ease", display: "flex", flexDirection: "column", gap: "24px" }}>
              
              <StoreAudit onComplete={(isValid) => setIsAuditValid(isValid)} />

              {clientType === "EXISTING" && selectedClient && (
                <div className="card" style={{ marginBottom: "0" }}>
                  <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-yellow)" }}>Inteligencia de Cliente</h2>
                  <ClientHealthCard 
                    debt={selectedClient.debt} 
                    daysLate={selectedClient.daysLate} 
                    debtDetails={selectedClient.debtDetails}
                    recentOrders={selectedClient.recentOrders} 
                  />
                </div>
              )}

              <div style={{ display: "flex", gap: "12px" }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: "16px", backgroundColor: "#333", color: "white", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Atrás</button>
              </div>
              
              {/* STICKY ACTION BAR FOR AUDIT */}
              <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", backgroundColor: "rgba(17, 17, 17, 0.95)", backdropFilter: "blur(10px)", borderTop: "1px solid #333", zIndex: 50 }}>
                <button 
                  onClick={() => setStep(3)} 
                  disabled={!isAuditValid}
                  style={{ width: "100%", padding: "16px", backgroundColor: isAuditValid ? "#25D366" : "#555", color: "white", fontWeight: "bold", borderRadius: "8px", border: "none", fontSize: "1.1rem", transition: "all 0.3s", cursor: isAuditValid ? "pointer" : "not-allowed" }}
                >
                  Continuar a Pedido ➔
                </button>
              </div>
            </section>
          </div>
        );

      case 3:
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "20px", paddingBottom: "120px" }}>
            <section className="card" style={{ animation: "fadeIn 0.3s ease" }}>
              <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-yellow)" }}>3. El Carrito (Productos)</h2>
              
              <input 
                type="text" 
                placeholder="🔍 Filtrar productos..." 
                value={productSearch} 
                onChange={e => setProductSearch(e.target.value)} 
                style={{ width: "100%", padding: "12px", marginBottom: "20px", backgroundColor: "#222", color: "white", border: "1px solid #444", borderRadius: "8px" }} 
              />

              <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                {filteredProducts.map(p => {
                  const qty = cart[p.id] || 0;
                  const isSelected = qty > 0;
                  const subtotal = p.price * qty;
                  
                  return (
                    <div key={p.id} style={{ borderBottom: "1px solid #333", paddingBottom: "20px", opacity: (productSearch && !isSelected) ? 0.8 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "16px", alignItems: "flex-start" }}>
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
                          <span style={{ color: "var(--color-yellow)", fontWeight: "bold", fontSize: "1.05rem", whiteSpace: "nowrap" }}>${p.price.toLocaleString("es-CL")}<span style={{fontSize:"0.8rem", color:"#888"}}>/u</span></span>
                          {qty > 0 && (
                            <div style={{ fontSize: "0.9rem", color: "#00FF00", marginTop: "4px", fontWeight: "bold", animation: "fadeIn 0.2s ease", whiteSpace: "nowrap" }}>
                              Subtotal: ${subtotal.toLocaleString("es-CL")}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <SmartStepper 
                          value={qty} 
                          onChange={(val) => handleUpdateCart(p.id, val)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              <div style={{ display: "flex", gap: "12px", marginTop: "32px" }}>
                <button onClick={() => setStep(2)} style={{ flex: 1, padding: "16px", backgroundColor: "#333", color: "white", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Atrás</button>
                <button onClick={() => setStep(4)} style={{ flex: 2, padding: "16px", backgroundColor: "var(--color-yellow)", color: "black", fontWeight: "bold", borderRadius: "8px", fontSize: "1.1rem", cursor: "pointer" }}>Ir al Resumen</button>
              </div>
            </section>

            {/* STICKY BOTTOM BAR (Checkout) */}
            <div style={{ 
              position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", backgroundColor: "rgba(17, 17, 17, 0.95)", backdropFilter: "blur(10px)", borderTop: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.5)"
            }}>
              <div>
                <p style={{ margin: "0 0 4px 0", fontSize: "0.85rem", color: "var(--color-gray-light)", textTransform: "uppercase" }}>Total a Cobrar</p>
                <p style={{ margin: 0, fontSize: "1.8rem", fontWeight: "bold", color: "#00FF00" }}>${calculateTotal().toLocaleString("es-CL")}</p>
              </div>
              <button 
                onClick={() => setStep(4)} 
                disabled={calculateTotal() === 0}
                style={{ padding: "16px 24px", backgroundColor: calculateTotal() === 0 ? "#555" : "var(--color-yellow)", color: "black", fontWeight: "bold", borderRadius: "8px", border: "none", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem", boxShadow: calculateTotal() > 0 ? "0 4px 15px rgba(255, 204, 0, 0.3)" : "none", cursor: calculateTotal() > 0 ? "pointer" : "not-allowed" }}
              >
                <span>Resumen ➔</span>
              </button>
            </div>
          </div>
        );

      case 4:
        return (
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflowY: "auto", padding: "20px", paddingBottom: "120px" }}>
            <section className="card" style={{ animation: "fadeIn 0.3s ease" }}>
              <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-yellow)" }}>4. Validación y Cierre</h2>
              
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
                
                {Object.keys(cart).filter(id => cart[id] > 0).length === 0 ? (
                   <p style={{ color: "#FF3333", fontStyle: "italic" }}>No has agregado productos al carrito.</p>
                ) : (
                  <div style={{ border: "1px solid #333", borderRadius: "8px", overflow: "hidden" }}>
                    {Object.keys(cart).map(productId => {
                      if (cart[productId] > 0) {
                        const product = MOCK_PRODUCTS.find(p => p.id === productId);
                        const subtotal = (product?.price || 0) * cart[productId];

                        return (
                          <div key={productId} style={{ display: "flex", justifyContent: "space-between", padding: "12px 16px", borderBottom: "1px solid #333", backgroundColor: "#111" }}>
                            <div>
                              <div style={{ fontWeight: "bold", color: "white" }}>{product?.name}</div>
                              <div style={{ fontSize: "0.85rem", color: "var(--color-gray-light)" }}>
                                {cart[productId]} unidades
                              </div>
                            </div>
                            <div style={{ fontWeight: "bold", color: "var(--color-yellow)", whiteSpace: "nowrap" }}>
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
                <button onClick={() => setStep(3)} style={{ width: "100%", padding: "16px", backgroundColor: "#333", color: "white", borderRadius: "8px", fontWeight: "bold", cursor: "pointer" }}>Modificar Productos</button>
              </div>
            </section>

            {/* STICKY BOTTOM BAR (Checkout) */}
            <div style={{ 
              position: "fixed", bottom: 0, left: 0, right: 0, padding: "16px 20px", backgroundColor: "rgba(17, 17, 17, 0.95)", backdropFilter: "blur(10px)", borderTop: "1px solid #333", display: "flex", justifyContent: "space-between", alignItems: "center", zIndex: 50, boxShadow: "0 -4px 20px rgba(0,0,0,0.5)"
            }}>
              <div>
                <p style={{ margin: "0 0 4px 0", fontSize: "0.85rem", color: "var(--color-gray-light)", textTransform: "uppercase" }}>Total a Cobrar</p>
                <p style={{ margin: 0, fontSize: "1.8rem", fontWeight: "bold", color: "#00FF00" }}>${calculateTotal().toLocaleString("es-CL")}</p>
              </div>
              <button 
                onClick={handleCheckout} 
                disabled={calculateTotal() === 0}
                style={{ padding: "16px 24px", backgroundColor: calculateTotal() === 0 ? "#555" : "#25D366", color: "white", fontWeight: "bold", borderRadius: "8px", border: "none", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.1rem", boxShadow: calculateTotal() > 0 ? "0 4px 15px rgba(37, 211, 102, 0.3)" : "none", cursor: calculateTotal() > 0 ? "pointer" : "not-allowed" }}
              >
                <span>✅ Confirmar</span>
              </button>
            </div>
          </div>
        );
    }
  };

  return (
    <div style={{ height: "100vh", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      {/* Header Secundario */}
      <header style={{ padding: "20px 20px 16px 20px", borderBottom: "1px solid #333", backgroundColor: "#111", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "16px" }}>
          <button onClick={() => router.push("/ventas")} style={{ background: "none", border: "none", color: "var(--color-yellow)", fontSize: "1.5rem", cursor: "pointer", padding: 0 }}>←</button>
          <div>
            <h1 style={{ fontSize: "1.4rem", color: "white", margin: 0 }}>Nueva Venta</h1>
            <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", margin: "4px 0 0 0" }}>Paso {step} de 4</p>
          </div>
        </div>
        
        {/* Progress Bar */}
        <div style={{ width: "100%", height: "4px", backgroundColor: "#333", borderRadius: "2px", overflow: "hidden" }}>
          <div style={{ width: `${(step / 4) * 100}%`, height: "100%", backgroundColor: "var(--color-yellow)", transition: "width 0.3s ease" }} />
        </div>
      </header>

      {/* Main Content Area (Scrollable) */}
      <div style={{ flex: 1, overflowY: "hidden", backgroundColor: "#000" }}>
        {renderStepContent()}
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
