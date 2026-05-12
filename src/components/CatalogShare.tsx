"use client";
import { useState } from 'react';
import { Send, Smartphone } from 'lucide-react';
import { z } from 'zod';

const phoneSchema = z.string().length(9, "El número debe tener exactamente 9 dígitos");

export function CatalogShare() {
  const [phone, setPhone] = useState("");
  const [clientName, setClientName] = useState("");
  const [error, setError] = useState("");

  const handleSend = () => {
    try {
      phoneSchema.parse(phone);
      setError("");
      
      const nameText = clientName ? `Hola ${clientName}, ` : `Hola, `;
      const message = `${nameText}te envío nuestro catálogo actualizado de Cervezas y Kombuchas El Regreso. ¡Quedo atento a tu pedido!`;
      const encodedMessage = encodeURIComponent(message);
      const waLink = `https://wa.me/56${phone}?text=${encodedMessage}`;
      
      window.open(waLink, "_blank");
    } catch (err) {
      if (err instanceof z.ZodError) {
        setError(err.errors[0].message);
      }
    }
  };

  return (
    <div style={{ backgroundColor: "#1a1a1a", borderTop: "1px solid #333", padding: "16px", zIndex: 50 }}>
      <h3 style={{ margin: "0 0 12px 0", fontSize: "1rem", color: "white", display: "flex", alignItems: "center", gap: "8px" }}>
        <Smartphone size={18} color="var(--color-yellow)" /> 
        Compartir Catálogo Digital
      </h3>
      
      <div style={{ display: "flex", gap: "12px", marginBottom: "12px" }}>
        <input 
          type="text" 
          placeholder="Nombre Cliente (Opcional)"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          style={{ flex: 1, padding: "12px", backgroundColor: "#222", border: "1px solid #444", borderRadius: "8px", color: "white" }}
        />
      </div>

      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <div style={{ display: "flex", alignItems: "center", backgroundColor: "#333", border: "1px solid #444", borderRadius: "8px", padding: "0 12px", color: "white", fontWeight: "bold" }}>
          +56
        </div>
        <input 
          type="number" 
          placeholder="912345678"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          style={{ flex: 1, padding: "12px", backgroundColor: "#222", border: error ? "1px solid #FF4D4D" : "1px solid #444", borderRadius: "8px", color: "white", letterSpacing: "2px", fontSize: "1.1rem" }}
        />
      </div>
      
      {error && <p style={{ color: "#FF4D4D", fontSize: "0.8rem", margin: "0 0 12px 0" }}>{error}</p>}

      <button 
        onClick={handleSend}
        style={{ width: "100%", padding: "14px", backgroundColor: "#25D366", color: "white", fontWeight: "bold", border: "none", borderRadius: "8px", display: "flex", justifyContent: "center", alignItems: "center", gap: "8px", fontSize: "1rem", cursor: "pointer" }}
      >
        <Send size={18} />
        Enviar Catálogo Digital
      </button>
    </div>
  );
}
