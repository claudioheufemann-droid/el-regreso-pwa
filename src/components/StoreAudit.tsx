"use client";

import { Camera, CheckCircle2 } from "lucide-react";
import { useState, useEffect } from "react";

interface StoreAuditProps {
  onComplete: (isValid: boolean) => void;
}

export function StoreAudit({ onComplete }: StoreAuditProps) {
  const [photo, setPhoto] = useState<string | null>(null);

  useEffect(() => {
    onComplete(!!photo);
  }, [photo, onComplete]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        setPhoto(canvas.toDataURL("image/webp", 0.7));
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px", backgroundColor: "#111", border: "1px solid #333", borderRadius: "12px", gap: "16px", marginBottom: "20px" }}>
      <div style={{ flex: 1 }}>
        <h4 style={{ margin: "0 0 4px 0", color: "white", fontSize: "1.05rem", display: "flex", alignItems: "center", gap: "6px" }}>
          <Camera size={18} color="var(--color-yellow)" /> Auditoría de Local
        </h4>
        <p style={{ margin: 0, color: "#888", fontSize: "0.85rem" }}>Toma una foto de fachada/exhibición obligatoria.</p>
      </div>

      <div style={{ position: "relative" }}>
        {photo ? (
          <div style={{ position: "relative" }}>
            <img src={photo} alt="Local" style={{ width: "64px", height: "64px", objectFit: "cover", borderRadius: "8px", border: "2px solid #25D366" }} />
            <div style={{ position: "absolute", top: "-8px", right: "-8px", backgroundColor: "#25D366", color: "white", borderRadius: "50%", padding: "2px" }}>
              <CheckCircle2 size={16} />
            </div>
          </div>
        ) : (
          <label style={{ width: "64px", height: "64px", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "#222", border: "1px solid #444", borderRadius: "8px", cursor: "pointer", transition: "all 0.2s" }}>
            <Camera size={26} color="#888" />
            <input type="file" accept="image/*" capture="environment" onChange={handleImageUpload} style={{ display: "none" }} />
          </label>
        )}
      </div>
    </div>
  );
}
