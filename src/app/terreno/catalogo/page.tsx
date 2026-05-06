"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

type Category = "CERVEZA" | "KOMBUCHA";

interface ProductCatalog {
  id: string;
  name: string;
  type: Category;
  style: string;
  volumeMl: number;
  ingredients: string | null;
  abv: number | null;
  ibu: number | null;
  phLevel: number | null;
  tastingNotes: string | null;
  dimensions: string | null;
  origin: string | null;
  conservation: string | null;
}

export default function CatalogoDigital() {
  const [activeFilter, setActiveFilter] = useState<Category | "ALL">("ALL");
  const [products, setProducts] = useState<ProductCatalog[]>([]);
  const [shareProduct, setShareProduct] = useState<ProductCatalog | null>(null);
  const [shareCategory, setShareCategory] = useState<Category | null>(null);
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("+569");

  useEffect(() => {
    fetch('/api/products')
      .then(res => res.json())
      .then(data => setProducts(data))
      .catch(err => console.error("Error fetching from Prisma:", err));
  }, []);

  const filteredProducts = products.filter(p => activeFilter === "ALL" || p.type === activeFilter);
  const isValidPhone = (phone: string) => /^\+569[0-9]{8}$/.test(phone);

  const handleSendWhatsApp = () => {
    if (!contactName.trim()) { alert("Ingresa el nombre del contacto."); return; }
    if (!isValidPhone(contactPhone)) { alert("Ingresa un celular válido (+569)."); return; }

    let message = `Hola ${contactName}, directo desde Valdivia te envío información de `;

    if (shareCategory) {
      // BULK SEND CATEGORY
      message += `nuestro portafolio de ${shareCategory === 'CERVEZA' ? 'Cervezas Artesanales El Regreso' : 'Kombuchas La Ida'}:\n\n`;
      const catProducts = products.filter(p => p.type === shareCategory);
      catProducts.forEach(p => {
        message += `*${p.name}* (${p.style || 'Original Specs Pending'})\n`;
        message += `Ingredientes: ${p.ingredients || 'Original Specs Pending'}\n`;
        message += `Notas: ${p.tastingNotes || 'Original Specs Pending'}\n`;
        message += `${p.abv ? `ABV: ${p.abv}% ` : 'ABV: Pending '}${p.ibu ? `IBU: ${p.ibu} ` : 'IBU: Pending '}${p.phLevel ? `pH: ${p.phLevel}` : 'pH: Pending'}\n`;
        message += `Ver Imagen Oficial: [Link a https://elregreso.cl/assets/catalogo/${p.id}.jpg]\n\n`;
      });
      message += `Para más detalles, contáctame por aquí.`;
    } else if (shareProduct) {
      // SEND SINGLE PRODUCT
      message += `nuestra ${shareProduct.name} (${shareProduct.style || 'Original Specs Pending'}).\n\n`;
      message += `Ingredientes: ${shareProduct.ingredients || 'Original Specs Pending'}\n`;
      message += `Notas: ${shareProduct.tastingNotes || 'Original Specs Pending'}\n`;
      message += `ABV: ${shareProduct.abv ? shareProduct.abv + '%' : 'Original Specs Pending'}\n`;
      message += `IBU: ${shareProduct.ibu ? shareProduct.ibu : 'Original Specs Pending'}\n`;
      message += `pH: ${shareProduct.phLevel ? shareProduct.phLevel : 'Original Specs Pending'}\n`;
      message += `Formato: ${shareProduct.volumeMl}ml (${shareProduct.dimensions || 'Original Specs Pending'})\n`;
      message += `Conservación: ${shareProduct.conservation || 'Original Specs Pending'}\n\n`;
      message += `Ver Imagen Oficial: [Link a https://elregreso.cl/assets/catalogo/${shareProduct.id}.jpg]\n`;
    }
    
    const whatsappUrl = `https://wa.me/${contactPhone.replace("+", "")}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, "_blank");
    setShareProduct(null);
    setShareCategory(null);
  };

  const renderSpecsPending = (value: any, append = "") => {
    return value ? value + append : <span style={{ color: "var(--color-yellow)", opacity: 0.7, fontStyle: "italic" }}>Original Specs Pending</span>;
  };

  return (
    <div style={{ padding: "20px", maxWidth: "1000px", margin: "0 auto", paddingBottom: "80px" }}>
      <header style={{ marginBottom: "32px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #333", paddingBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", color: "var(--color-yellow)", letterSpacing: "1px" }}>EL REGRESO</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "2px" }}>Catálogo Persistente & Social Selling</p>
        </div>
        <Link href="/" style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", textDecoration: "underline" }}>Volver al Menú</Link>
      </header>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "32px" }}>
        <button onClick={() => setActiveFilter("ALL")} style={{ padding: "12px 24px", borderRadius: "24px", backgroundColor: activeFilter === "ALL" ? "var(--color-yellow)" : "var(--color-black)", color: activeFilter === "ALL" ? "black" : "white", border: "1px solid #333" }}>Todo el Portafolio</button>
        <button onClick={() => setActiveFilter("CERVEZA")} style={{ padding: "12px 24px", borderRadius: "24px", backgroundColor: activeFilter === "CERVEZA" ? "var(--color-yellow)" : "var(--color-black)", color: activeFilter === "CERVEZA" ? "black" : "white", border: "1px solid #333" }}>🍺 Cervezas</button>
        <button onClick={() => setActiveFilter("KOMBUCHA")} style={{ padding: "12px 24px", borderRadius: "24px", backgroundColor: activeFilter === "KOMBUCHA" ? "var(--color-yellow)" : "var(--color-black)", color: activeFilter === "KOMBUCHA" ? "black" : "white", border: "1px solid #333" }}>🌿 Kombuchas</button>
      </div>

      {(activeFilter === "CERVEZA" || activeFilter === "KOMBUCHA") && (
        <div style={{ marginBottom: "32px", padding: "20px", backgroundColor: "var(--color-black)", border: "2px solid var(--color-yellow)", borderRadius: "8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h3 style={{ color: "var(--color-yellow)", margin: 0, fontSize: "1.5rem" }}>Catálogo {activeFilter}</h3>
            <p style={{ color: "var(--color-gray-light)", margin: "4px 0 0 0" }}>Acción Bulk: Enviar todo el catálogo categorizado</p>
          </div>
          <button onClick={() => setShareCategory(activeFilter)} style={{ padding: "16px 24px", backgroundColor: "#25D366", color: "white", borderRadius: "4px", fontWeight: "bold", fontSize: "1.1rem" }}>
            💬 ENVIAR CATEGORÍA COMPLETA
          </button>
        </div>
      )}

      <div className="grid-1-to-2" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "24px" }}>
        {filteredProducts.map(product => (
          <div key={product.id} className="card" style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", border: "1px solid #333", borderRadius: "8px", padding: "16px" }}>
            <div>
              {/* STRICT IMAGE INTEGRITY: Mapped directly via Product ID (.jpg as requested) */}
              <div style={{ width: "100%", height: "280px", backgroundColor: "#0f0f0f", marginBottom: "16px", borderRadius: "8px", overflow: "hidden", display: "flex", justifyContent: "center", alignItems: "center", border: "1px solid #222" }}>
                <img src={`/assets/catalogo/${product.id}.jpg`} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "contain" }} 
                  onError={(e) => { (e.target as HTMLImageElement).src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="%23FFD700"><text x="50%" y="50%" text-anchor="middle" dominant-baseline="middle" font-family="sans-serif" font-size="12">Imagen Pendiente</text></svg>'; }} 
                />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
                <h2 style={{ color: "white", fontSize: "1.4rem", margin: 0 }}>{product.name}</h2>
                <span style={{ backgroundColor: product.type === "CERVEZA" ? "rgba(255, 215, 0, 0.2)" : "rgba(0, 255, 0, 0.2)", color: product.type === "CERVEZA" ? "var(--color-yellow)" : "#00FF00", padding: "4px 8px", borderRadius: "4px", fontSize: "0.75rem", fontWeight: "bold" }}>
                  {renderSpecsPending(product.style)}
                </span>
              </div>
              
              <div style={{ marginBottom: "16px", display: "flex", flexWrap: "wrap", gap: "16px", padding: "12px", backgroundColor: "#111", borderRadius: "4px" }}>
                <div><span style={{ color: "var(--color-gray-light)", fontSize: "0.75rem", textTransform: "uppercase" }}>ABV</span><br/><strong style={{ color: "white" }}>{renderSpecsPending(product.abv, "%")}</strong></div>
                <div><span style={{ color: "var(--color-gray-light)", fontSize: "0.75rem", textTransform: "uppercase" }}>IBU</span><br/><strong style={{ color: "white" }}>{renderSpecsPending(product.ibu)}</strong></div>
                <div><span style={{ color: "var(--color-gray-light)", fontSize: "0.75rem", textTransform: "uppercase" }}>pH</span><br/><strong style={{ color: "white" }}>{renderSpecsPending(product.phLevel)}</strong></div>
                <div><span style={{ color: "var(--color-gray-light)", fontSize: "0.75rem", textTransform: "uppercase" }}>Formato</span><br/><strong style={{ color: "white" }}>{product.volumeMl}ml</strong></div>
              </div>

              <div style={{ marginBottom: "24px" }}>
                <p style={{ color: "var(--color-gray-light)", fontSize: "0.95rem", lineHeight: "1.5", fontStyle: "italic", marginBottom: "12px" }}>
                  "{renderSpecsPending(product.tastingNotes)}"
                </p>
                <div style={{ fontSize: "0.85rem", color: "#888", display: "flex", flexDirection: "column", gap: "6px" }}>
                  <p style={{ margin: 0 }}><strong>Ingredientes:</strong> {renderSpecsPending(product.ingredients)}</p>
                  <p style={{ margin: 0 }}><strong>Dimensiones:</strong> {renderSpecsPending(product.dimensions)}</p>
                  <p style={{ margin: 0 }}><strong>Conservación:</strong> {renderSpecsPending(product.conservation)}</p>
                  <p style={{ margin: 0 }}><strong>Origen:</strong> {renderSpecsPending(product.origin)}</p>
                </div>
              </div>
            </div>
            
            <button onClick={() => setShareProduct(product)} style={{ width: "100%", padding: "12px", backgroundColor: "transparent", border: "1px solid #25D366", color: "#25D366", borderRadius: "4px", fontWeight: "bold" }}>
              💬 Enviar Ficha Individual
            </button>
          </div>
        ))}
        {products.length === 0 && <p style={{ color: "white" }}>Sincronizando con PostgreSQL...</p>}
      </div>

      {/* MODAL SOCIAL SELLING - Mismo componente de antes */}
      {(shareProduct || shareCategory) && (
        <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", backgroundColor: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000, padding: "20px" }}>
          <div className="card" style={{ width: "100%", maxWidth: "400px", border: "1px solid var(--color-yellow)", position: "relative", padding: "24px", backgroundColor: "var(--color-black)", borderRadius: "8px" }}>
            <button onClick={() => { setShareProduct(null); setShareCategory(null); }} style={{ position: "absolute", top: "16px", right: "16px", background: "none", border: "none", color: "var(--color-gray-light)", fontSize: "1.5rem", padding: 0 }}>×</button>
            <h2 style={{ color: "var(--color-yellow)", marginBottom: "8px" }}>Social Selling</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginBottom: "24px", marginTop: "16px" }}>
              <input type="text" placeholder="Nombre del Cliente" value={contactName} onChange={e => setContactName(e.target.value)} style={{ padding: "12px", backgroundColor: "#111", border: "1px solid #333", color: "white", borderRadius: "4px" }} />
              <input type="text" placeholder="+569..." value={contactPhone} onChange={e => setContactPhone(e.target.value)} style={{ padding: "12px", backgroundColor: "#111", border: "1px solid #333", color: "white", borderRadius: "4px" }} />
            </div>
            <button onClick={handleSendWhatsApp} style={{ width: "100%", padding: "16px", backgroundColor: "#25D366", color: "white", fontSize: "1.1rem", borderRadius: "4px", fontWeight: "bold" }}>Generar Link y Enviar</button>
          </div>
        </div>
      )}
    </div>
  );
}
