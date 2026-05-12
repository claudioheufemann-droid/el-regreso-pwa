"use client";

import { Camera, CheckCircle2, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

export function FieldAudit({ onComplete }: { onComplete: () => void }) {
  const [fachadaPreview, setFachadaPreview] = useState<string | null>(null);
  const [exhibicionPreview, setExhibicionPreview] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);

  // Frontend Image Compression (Simulating Cloudinary/Vercel Blob prep)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "fachada" | "exhibicion") => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    
    // Simulate compression process reading file via FileReader
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        // Compress using Canvas (Max Width 800px)
        const canvas = document.createElement("canvas");
        const MAX_WIDTH = 800;
        const scaleSize = MAX_WIDTH / img.width;
        canvas.width = MAX_WIDTH;
        canvas.height = img.height * scaleSize;
        
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Convert to WebP format with 70% quality to save bandwidth
        const compressedBase64 = canvas.toDataURL("image/webp", 0.7);
        
        if (type === "fachada") setFachadaPreview(compressedBase64);
        if (type === "exhibicion") setExhibicionPreview(compressedBase64);
        
        setIsCompressing(false);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      <p style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", margin: 0 }}>
        Por protocolo comercial, por favor captura la fachada y la exhibición de nuestros productos antes de iniciar la venta. Las imágenes se comprimirán automáticamente.
      </p>

      {/* Fachada Upload */}
      <div style={{ border: "2px dashed #444", borderRadius: "12px", padding: "20px", textAlign: "center", backgroundColor: fachadaPreview ? "#1a1a1a" : "#111", position: "relative", overflow: "hidden" }}>
        {fachadaPreview ? (
          <>
            <img src={fachadaPreview} alt="Fachada" style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "8px", opacity: 0.8 }} />
            <div style={{ position: "absolute", top: "10px", right: "10px", backgroundColor: "#25D366", color: "white", borderRadius: "50%", padding: "4px" }}>
              <CheckCircle2 size={20} />
            </div>
            <p style={{ color: "#25D366", fontWeight: "bold", marginTop: "12px", marginBottom: 0 }}>Fachada OK</p>
          </>
        ) : (
          <>
            <Camera size={40} color="var(--color-gray-light)" style={{ margin: "0 auto 12px auto", opacity: 0.5 }} />
            <h4 style={{ color: "white", margin: "0 0 8px 0" }}>Foto de Fachada</h4>
            <p style={{ color: "#888", fontSize: "0.8rem", margin: "0 0 16px 0" }}>(Obligatorio)</p>
            <label style={{ backgroundColor: "var(--color-yellow)", color: "black", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}>
              <Camera size={18} /> Tomar Foto
              <input type="file" accept="image/*" capture="environment" onChange={(e) => handleImageUpload(e, "fachada")} style={{ display: "none" }} />
            </label>
          </>
        )}
      </div>

      {/* Exhibición Upload */}
      <div style={{ border: "2px dashed #444", borderRadius: "12px", padding: "20px", textAlign: "center", backgroundColor: exhibicionPreview ? "#1a1a1a" : "#111", position: "relative", overflow: "hidden" }}>
        {exhibicionPreview ? (
          <>
            <img src={exhibicionPreview} alt="Exhibición" style={{ width: "100%", height: "160px", objectFit: "cover", borderRadius: "8px", opacity: 0.8 }} />
            <div style={{ position: "absolute", top: "10px", right: "10px", backgroundColor: "#25D366", color: "white", borderRadius: "50%", padding: "4px" }}>
              <CheckCircle2 size={20} />
            </div>
            <p style={{ color: "#25D366", fontWeight: "bold", marginTop: "12px", marginBottom: 0 }}>Exhibición OK</p>
          </>
        ) : (
          <>
            <ImageIcon size={40} color="var(--color-gray-light)" style={{ margin: "0 auto 12px auto", opacity: 0.5 }} />
            <h4 style={{ color: "white", margin: "0 0 8px 0" }}>Foto de Góndola/Nevera</h4>
            <p style={{ color: "#888", fontSize: "0.8rem", margin: "0 0 16px 0" }}>(Opcional)</p>
            <label style={{ backgroundColor: "#333", color: "white", padding: "10px 20px", borderRadius: "8px", fontWeight: "bold", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "8px", border: "1px solid #555" }}>
              <ImageIcon size={18} /> Subir Foto
              <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, "exhibicion")} style={{ display: "none" }} />
            </label>
          </>
        )}
      </div>

      {isCompressing && <p style={{ color: "var(--color-yellow)", textAlign: "center", fontStyle: "italic", fontSize: "0.9rem" }}>Comprimiendo imagen...</p>}

      <button 
        onClick={onComplete}
        disabled={!fachadaPreview}
        style={{ width: "100%", padding: "16px", backgroundColor: fachadaPreview ? "var(--color-yellow)" : "#333", color: fachadaPreview ? "black" : "#888", fontWeight: "bold", fontSize: "1.1rem", borderRadius: "8px", marginTop: "12px", transition: "all 0.3s" }}
      >
        Continuar ➔
      </button>
    </div>
  );
}
