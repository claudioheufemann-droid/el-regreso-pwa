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
          width: "38px", 
          height: "38px", 
          backgroundColor: "#222", 
          color: "white", 
          borderRadius: "6px", 
          fontSize: "1.2rem", 
          border: "1px solid #444",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          cursor: "pointer",
          flexShrink: 0
        }}
      >-</button>
      
      {/* Input Numérico Directo */}
      <input 
        type="number" 
        value={value === 0 ? "" : value}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : 0)}
        style={{ 
          width: "60px", 
          height: "38px", 
          textAlign: "center", 
          backgroundColor: "#111", 
          border: "1px solid #444", 
          color: "white", 
          borderRadius: "6px", 
          fontSize: "1.1rem",
          fontWeight: "bold",
          padding: 0
        }}
        placeholder="0"
      />
      
      {/* Botón Más */}
      <button 
        type="button"
        onClick={() => onChange(value + 1)}
        style={{ 
          width: "38px", 
          height: "38px", 
          backgroundColor: "var(--color-yellow)", 
          color: "black", 
          borderRadius: "6px", 
          fontSize: "1.2rem", 
          border: "none",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontWeight: "bold",
          cursor: "pointer",
          flexShrink: 0
        }}
      >+</button>

      {/* Selector de Unidad */}
      <select 
        value={unit} 
        onChange={(e) => onUnitChange(e.target.value)}
        style={{ 
          flex: 1, 
          height: "38px", 
          padding: "0 8px", 
          backgroundColor: "#222", 
          border: "1px solid #444", 
          color: "white", 
          borderRadius: "6px",
          fontSize: "0.95rem",
          outline: "none",
          cursor: "pointer"
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
