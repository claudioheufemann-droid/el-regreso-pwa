import { Minus, Plus } from "lucide-react";

interface QuantitySelectorProps {
  value: number;
  onChange: (newValue: number) => void;
  unit?: string;
  onUnitChange?: (newUnit: string) => void;
}

export function QuantitySelector({ value, onChange, unit, onUnitChange }: QuantitySelectorProps) {
  const handleDec = () => {
    if (value > 0) onChange(value - 1);
  };
  const handleInc = () => {
    onChange(value + 1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", alignItems: "flex-end" }}>
      {/* Selector de Unidad / Caja */}
      {unit && onUnitChange && (
        <div style={{ display: "flex", backgroundColor: "#222", borderRadius: "6px", overflow: "hidden", border: "1px solid #444", fontSize: "0.75rem" }}>
          {["UD", "SIX", "CAJA"].map(u => (
            <button
              key={u}
              onClick={() => onUnitChange(u)}
              style={{
                padding: "6px 10px",
                border: "none",
                backgroundColor: unit === u ? "var(--color-yellow)" : "transparent",
                color: unit === u ? "black" : "white",
                fontWeight: "bold",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
            >
              {u}
            </button>
          ))}
        </div>
      )}

      {/* Control Numérico Compacto */}
      <div style={{ display: "flex", alignItems: "center", backgroundColor: "#222", borderRadius: "8px", overflow: "hidden", border: "1px solid #444", flexShrink: 0 }}>
        <button 
          onClick={handleDec}
          style={{ width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#333", border: "none", color: "white", cursor: "pointer" }}
        >
          <Minus size={16} />
        </button>
        <input 
          type="number"
          value={value || ""}
          onChange={(e) => {
            const val = parseInt(e.target.value);
            if (!isNaN(val) && val >= 0) {
              onChange(val);
            } else if (e.target.value === "") {
              onChange(0);
            }
          }}
          style={{ width: "40px", height: "36px", textAlign: "center", backgroundColor: "transparent", border: "none", color: "white", fontWeight: "bold", fontSize: "1.1rem", padding: 0 }}
        />
        <button 
          onClick={handleInc}
          style={{ width: "36px", height: "36px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-yellow)", border: "none", color: "black", cursor: "pointer" }}
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
