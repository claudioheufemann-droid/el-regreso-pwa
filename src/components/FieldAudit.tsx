"use client";

import { Camera, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { useState, useEffect } from "react";

interface FieldAuditProps {
  type: "NEW" | "EXISTING";
  onComplete: (isValid: boolean) => void;
}

export function FieldAudit({ type, onComplete }: FieldAuditProps) {
  const [photo1, setPhoto1] = useState<string | null>(null);
  const [photo2, setPhoto2] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Validate status to notify parent
  useEffect(() => {
    if (type === "NEW") {
      onComplete(!!photo1 && !!photo2);
    } else {
      onComplete(!!photo1);
    }
  }, [photo1, photo2, type, onComplete]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, slot: 1 | 2) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    
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
        
        const compressedBase64 = canvas.toDataURL("image/webp", 0.7);
        
        if (slot === 1) setPhoto1(compressedBase64);
        if (slot === 2) setPhoto2(compressedBase64);
        
        setIsCompressing(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {type === "NEW" ? (
        <>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", margin: 0 }}>
            Captura de Oportunidad (Cliente Nuevo). Sube fotos del exterior y de dónde exhibiremos nuestros productos.
          </p>

          <div style={{ border: "2px dashed #444", borderRadius: "12px", padding: "20px", textAlign: "center", backgroundColor: photo1 ? "#1a1a1a" : "#111", position: "relative", overflow: "hidden" }}>
            {photo1 ? (
              <>
                <img src={photo1} alt="Fachada" style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "8px", opacity: 0.8 }} />
                <div style={{ position: "absolute", top: "10px", right: "10px", backgroundColor: "#25D366", color: "white", borderRadius: "50%", padding: "4px" }}>
                  <CheckCircle2 size={20} />
                </div>
                <p style={{ color: "#25D366", fontWeight: "bold", marginTop: "12px", marginBottom: 0 }}>Fachada OK</p>
              </>
            ) : (
              <>
                <Camera size={40} color="var(--color-gray-light)" style={{ margin: "0 auto 12px auto", opacity: 0.5 }} />
                <h4 style={{ color: "white", margin: "0 0 8px 0" }}>Foto Fachada/Local</h4>
                <p style={{ color: "#888", fontSize: "0.8rem", margin: "0 0 16px 0" }}>(Obligatorio)</p>
                <label style={{ backgroundColor: "var(--color-yellow)", color: "black", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <Camera size={18} /> Tomar Foto
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, 1)} style={{ display: "none" }} />
                </label>
              </>
            )}
          </div>

          <div style={{ border: "2px dashed #444", borderRadius: "12px", padding: "20px", textAlign: "center", backgroundColor: photo2 ? "#1a1a1a" : "#111", position: "relative", overflow: "hidden" }}>
            {photo2 ? (
              <>
                <img src={photo2} alt="Exhibición Ideal" style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "8px", opacity: 0.8 }} />
                <div style={{ position: "absolute", top: "10px", right: "10px", backgroundColor: "#25D366", color: "white", borderRadius: "50%", padding: "4px" }}>
                  <CheckCircle2 size={20} />
                </div>
                <p style={{ color: "#25D366", fontWeight: "bold", marginTop: "12px", marginBottom: 0 }}>Punto de Exhibición OK</p>
              </>
            ) : (
              <>
                <ImageIcon size={40} color="var(--color-gray-light)" style={{ margin: "0 auto 12px auto", opacity: 0.5 }} />
                <h4 style={{ color: "white", margin: "0 0 8px 0" }}>Punto de Exhibición Ideal</h4>
                <p style={{ color: "#888", fontSize: "0.8rem", margin: "0 0 16px 0" }}>(Obligatorio)</p>
                <label style={{ backgroundColor: "#333", color: "white", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid #555" }}>
                  <ImageIcon size={18} /> Subir Foto
                  <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, 2)} style={{ display: "none" }} />
                </label>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", margin: 0 }}>
            Auditoría de Reposición. Toma una foto para documentar cómo están exhibidos nuestros productos actualmente.
          </p>

          <div style={{ border: "2px dashed #444", borderRadius: "12px", padding: "20px", textAlign: "center", backgroundColor: photo1 ? "#1a1a1a" : "#111", position: "relative", overflow: "hidden" }}>
            {photo1 ? (
              <>
                <img src={photo1} alt="Estado de Góndola" style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "8px", opacity: 0.8 }} />
                <div style={{ position: "absolute", top: "10px", right: "10px", backgroundColor: "#25D366", color: "white", borderRadius: "50%", padding: "4px" }}>
                  <CheckCircle2 size={20} />
                </div>
                <p style={{ color: "#25D366", fontWeight: "bold", marginTop: "12px", marginBottom: 0 }}>Estado de Góndola OK</p>
              </>
            ) : (
              <>
                <Camera size={40} color="var(--color-gray-light)" style={{ margin: "0 auto 12px auto", opacity: 0.5 }} />
                <h4 style={{ color: "white", margin: "0 0 8px 0" }}>Foto Estado de Góndola/Nevera</h4>
                <p style={{ color: "#888", fontSize: "0.8rem", margin: "0 0 16px 0" }}>(Obligatorio)</p>
                <label style={{ backgroundColor: "var(--color-yellow)", color: "black", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}>
                  <Camera size={18} /> Tomar Foto
                  <input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, 1)} style={{ display: "none" }} />
                </label>
              </>
            )}
          </div>
        </>
      )}

      {isCompressing && <p style={{ color: "var(--color-yellow)", textAlign: "center", fontStyle: "italic", fontSize: "0.9rem" }}>Comprimiendo imagen...</p>}
    </div>
  );
}
