"use client";
import { Minus, Plus } from "lucide-react";

interface SmartStepperProps {
  value: number;
  onChange: (newValue: number) => void;
}

export function SmartStepper({ value, onChange }: SmartStepperProps) {
  const handleDec = () => {
    if (value > 0) onChange(value - 1);
  };
  const handleInc = () => {
    onChange(value + 1);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", backgroundColor: "#1e1e1e", borderRadius: "12px", overflow: "hidden", border: "1px solid #333", flexShrink: 0, boxShadow: "0 4px 6px rgba(0,0,0,0.3)" }}>
      <button 
        onClick={handleDec}
        style={{ width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#2a2a2a", border: "none", color: "white", cursor: "pointer", transition: "background-color 0.2s" }}
      >
        <Minus size={24} />
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
        style={{ width: "60px", height: "48px", textAlign: "center", backgroundColor: "transparent", border: "none", color: "white", fontWeight: "bold", fontSize: "1.4rem", padding: 0 }}
      />
      <button 
        onClick={handleInc}
        style={{ width: "48px", height: "48px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "var(--color-yellow)", border: "none", color: "black", cursor: "pointer", transition: "background-color 0.2s" }}
      >
        <Plus size={24} />
      </button>
    </div>
  );
}
