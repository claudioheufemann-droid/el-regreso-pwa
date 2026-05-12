"use client";

interface Props {
  value: number;
  onChange: (val: number) => void;
  unit: string;
  onUnitChange: (unit: string) => void;
}

export function QuantitySelector({ value, onChange, unit, onUnitChange }: Props) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "8px", width: "100%" }}>
      {/* Botón Menos */}
      <button 
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        style={{ 
          width: "48px", 
          height: "48px", 
          backgroundColor: "#222", 
          color: "white", 
          borderRadius: "8px", 
          fontSize: "1.5rem", 
          border: "1px solid #444",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer"
        }}
      >-</button>
      
      {/* Input Numérico Directo */}
      <input 
        type="number" 
        value={value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 0)}
        style={{ 
          flex: 1, 
          height: "48px", 
          textAlign: "center", 
          backgroundColor: "#111", 
          border: "1px solid #444", 
          color: "white", 
          borderRadius: "8px", 
          fontSize: "1.2rem",
          fontWeight: "bold"
        }}
        placeholder="0"
      />
      
      {/* Botón Más */}
      <button 
        type="button"
        onClick={() => onChange(value + 1)}
        style={{ 
          width: "48px", 
          height: "48px", 
          backgroundColor: "var(--color-yellow)", 
          color: "black", 
          borderRadius: "8px", 
          fontSize: "1.5rem", 
          border: "none",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontWeight: "bold",
          cursor: "pointer"
        }}
      >+</button>

      {/* Selector de Unidad */}
      <select 
        value={unit} 
        onChange={(e) => onUnitChange(e.target.value)}
        style={{ 
          height: "48px", 
          padding: "0 12px", 
          backgroundColor: "#222", 
          border: "1px solid #444", 
          color: "white", 
          borderRadius: "8px",
          fontSize: "0.95rem",
          outline: "none"
        }}
      >
        <option value="Unidad">Ud.</option>
        <option value="Six-pack">6-Pack</option>
        <option value="Caja">Caja</option>
        <option value="Barril">Barril</option>
      </select>
    </div>
  );
}
