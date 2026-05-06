"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

const MOTIVOS_NO_VENTA = [
  "Inventario Lleno",
  "Competencia Agresiva",
  "Objeción de Precio",
  "Deuda / Insolvencia",
  "Ausencia del Decisor",
  "Local Cerrado",
  "No le interesa / Rechazo"
];

export default function NoVentaDashboard() {
  const [selectedReason, setSelectedReason] = useState("");
  const [comments, setComments] = useState("");
  const router = useRouter();

  const handleRegister = () => {
    if (!selectedReason) {
      alert("Debes seleccionar un motivo principal.");
      return;
    }
    alert(`No Venta Registrada.\nMotivo: ${selectedReason}\nComentarios: ${comments}`);
    router.push("/terreno");
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", paddingBottom: "80px" }}>
      <header style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", color: "#FF3333" }}>Registrar No Venta</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.9rem" }}>Auditoría Obligatoria</p>
        </div>
        <Link href="/terreno" style={{ color: "var(--color-gray-light)", textDecoration: "underline" }}>Volver</Link>
      </header>

      <section className="card" style={{ marginBottom: "24px" }}>
        <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-gray-light)" }}>Motivo Principal (Obligatorio)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {MOTIVOS_NO_VENTA.map(motivo => (
            <label key={motivo} style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: "12px",
              padding: "16px",
              backgroundColor: selectedReason === motivo ? "rgba(255, 51, 51, 0.1)" : "var(--color-black)",
              border: `1px solid ${selectedReason === motivo ? "#FF3333" : "#333"}`,
              borderRadius: "4px",
              cursor: "pointer",
              transition: "all 0.2s ease"
            }}>
              <input 
                type="radio" 
                name="motivo" 
                value={motivo}
                checked={selectedReason === motivo}
                onChange={() => setSelectedReason(motivo)}
                style={{ width: "20px", height: "20px" }}
              />
              <span style={{ fontSize: "1.1rem", color: selectedReason === motivo ? "#FF3333" : "var(--color-text)" }}>{motivo}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="card" style={{ marginBottom: "24px" }}>
        <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-gray-light)" }}>Comentarios Adicionales (Opcional)</h2>
        <textarea 
          placeholder="Ej: El administrador vuelve el jueves. Tienen promo de la marca competidora."
          rows={4}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
        />
      </section>

      <button 
        onClick={handleRegister}
        disabled={!selectedReason}
        style={{ width: "100%", padding: "16px", fontSize: "1.1rem", backgroundColor: "#FF3333", color: "white" }}
      >
        Guardar Auditoría y Volver
      </button>
    </div>
  );
}
