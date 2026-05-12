"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

// --- Funciones Utilitarias ---
function getDistanceFromLatLonInM(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; 
  const dLat = deg2rad(lat2 - lat1);
  const dLon = deg2rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function deg2rad(deg: number) {
  return deg * (Math.PI / 180);
}

const isValidEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const isValidPhone = (phone: string) => /^\+56[0-9]{9}$/.test(phone);

// --- Mock Data ---
const MOCK_CLIENTS = [
  { 
    id: "1", name: "Bar La Taberna", lat: -33.4489, lng: -70.6693, channel: "HORECA",
    history: "3x Arboretum (Display), 2x Descenso (Display)", accountStatus: "Al Día ($0 Deuda)", visitDay: "Martes",
    contact: "Juan Pérez (+56912345678)",
    lastVisitDate: new Date(new Date().setDate(new Date().getDate() - 16)).toISOString(), // Overdue
    purchaseFrequency: "Quincenal",
    orderedProducts: ["c1", "c2"]
  },
  { 
    id: "2", name: "Botillería El Paso", lat: -33.4500, lng: -70.6700, channel: "RETAIL",
    history: "10x Aguas Blancas, 10x Arboretum", accountStatus: "Deuda Pendiente ($45.000)", visitDay: "Viernes",
    contact: "María González (+56987654321)",
    lastVisitDate: new Date(new Date().setDate(new Date().getDate() - 14)).toISOString(), // Due Today
    purchaseFrequency: "Quincenal",
    orderedProducts: ["c3", "c1"]
  },
  { 
    id: "3", name: "Cafetería Central", lat: -33.4510, lng: -70.6710, channel: "HORECA",
    history: "5x Lemon, 2x Maracuyá", accountStatus: "Al Día ($0 Deuda)", visitDay: "Lunes",
    contact: "Pedro Lara (+56911223344)",
    lastVisitDate: new Date(new Date().setDate(new Date().getDate() - 5)).toISOString(), // Active
    purchaseFrequency: "Semanal",
    orderedProducts: ["k1", "k2"]
  },
];

// --- Algoritmos Inteligentes ---
const getClientAura = (lastVisitDate: string) => {
  const daysSinceVisit = (new Date().getTime() - new Date(lastVisitDate).getTime()) / (1000 * 3600 * 24);
  if (daysSinceVisit > 15) return { bg: "rgba(255, 51, 51, 0.15)", border: "#FF3333", label: "Vencido (>15 días)" };
  if (daysSinceVisit >= 13) return { bg: "rgba(255, 215, 0, 0.15)", border: "var(--color-yellow)", label: "Visita Sugerida Hoy" };
  return { bg: "rgba(0, 255, 0, 0.1)", border: "#00FF00", label: "Activo / Al Día" };
};

const getSmartPitch = (orderedProducts: string[]) => {
  const allProducts = [
    { id: "c1", name: "Arboretum" }, { id: "c2", name: "Descenso" }, { id: "c3", name: "Aguas Blancas" },
    { id: "k1", name: "Lemon" }, { id: "k2", name: "Maracuyá" }, { id: "k3", name: "Maqui" }, { id: "k4", name: "Detox" }, { id: "k5", name: "Natural" }
  ];
  const unpurchased = allProducts.filter(p => !orderedProducts.includes(p.id));
  return unpurchased.length > 0 ? unpurchased[0].name : "Nuevos formatos";
};

export default function TerrenoDashboard() {
  const router = useRouter();
  
  // --- Estados Generales ---
  const [activeTab, setActiveTab] = useState<"EXISTING" | "PROSPECT" | "GOALS">("GOALS");
  
  // --- Time Navigation Engine ---
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1; // 1-12
  const currentWeek = Math.min(5, Math.ceil(currentDate.getDate() / 7));
  
  const [selectedMonth, setSelectedMonth] = useState<number>(currentMonth >= 5 && currentMonth <= 7 ? currentMonth : 5);
  const [selectedWeek, setSelectedWeek] = useState<number>(currentWeek);

  const isFuture = (m: number, w: number) => {
    if (m > currentMonth) return true;
    if (m === currentMonth && w > currentWeek) return true;
    return false;
  };

  const isPast = (m: number, w: number) => {
    if (m < currentMonth) return true;
    if (m === currentMonth && w < currentWeek) return true;
    return false;
  };

  const getWeekRange = (m: number, w: number) => {
    const monthNames = ["", "Ene", "Feb", "Mar", "Abr", "Mayo", "Junio", "Julio"];
    const name = monthNames[m] || "";
    if (w === 1) return `Semana 1 (01 al 07 de ${name})`;
    if (w === 2) return `Semana 2 (08 al 14 de ${name})`;
    if (w === 3) return `Semana 3 (15 al 21 de ${name})`;
    if (w === 4) return `Semana 4 (22 al 28 de ${name})`;
    if (w === 5) return `Semana 5 (29 al Fin de ${name})`;
    return `Semana ${w}`;
  };

  // --- Mock Data Dinámico: Metas de Venta ---
  const getSalesTargetsForWeek = (m: number, w: number) => {
    const fut = isFuture(m, w);
    const past = isPast(m, w);
    
    // Cuotas varían por mes para Javier Badilla
    const baseBar = m === 5 ? 350 : m === 6 ? 400 : 450;
    const baseSuper = m === 5 ? 800 : m === 6 ? 850 : 900;
    const baseMini = m === 5 ? 200 : m === 6 ? 220 : 250;

    return [
      { id: `t1-${m}-${w}`, category: "Bar", targetLiters: baseBar, currentLiters: fut ? 0 : past ? baseBar : 120 }, 
      { id: `t2-${m}-${w}`, category: "Supermercado", targetLiters: baseSuper, currentLiters: fut ? 0 : past ? baseSuper : 800 }, 
      { id: `t3-${m}-${w}`, category: "Minimarket", targetLiters: baseMini, currentLiters: fut ? 0 : past ? baseMini - 20 : 80 }, 
    ];
  };

  const [salesTargets, setSalesTargets] = useState(getSalesTargetsForWeek(selectedMonth, selectedWeek));

  useEffect(() => {
    setSalesTargets(getSalesTargetsForWeek(selectedMonth, selectedWeek));
  }, [selectedMonth, selectedWeek]);

  // Hook Lógico: Determinar restante y alertas
  const calculateTargetProgress = (targetLiters: number, currentLiters: number, fut: boolean, past: boolean) => {
    if (fut) return { percentage: "0.0", remainingLiters: targetLiters, status: "NORMAL" };
    
    const percentage = (currentLiters / targetLiters) * 100;
    const remainingLiters = targetLiters - currentLiters;
    const currentDayOfWeek = new Date().getDay(); // 0: Dom, 3: Mie
    
    let status = "NORMAL";
    if (percentage >= 100) status = "ACHIEVED";
    else if (!past && percentage < 50 && currentDayOfWeek >= 3) status = "ALERT";
    
    return {
      percentage: Math.min(percentage, 100).toFixed(1),
      remainingLiters: Math.max(remainingLiters, 0),
      status
    };
  };

  // --- Estados Cliente Existente ---
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedClient, setSelectedClient] = useState<typeof MOCK_CLIENTS[0] | null>(null);
  
  // --- Estados GPS y Auditoría Visual ---
  const [gpsStatus, setGpsStatus] = useState<"IDLE" | "LOCATING" | "LOCATED">("IDLE");
  const [distance, setDistance] = useState<number | null>(null);
  const [frontisPhoto, setFrontisPhoto] = useState<string | null>(null);
  const [exhibitionPhoto, setExhibitionPhoto] = useState<string | null>(null);

  // --- Estados Logística & Efectividad ---
  const [kmStart, setKmStart] = useState<number | "">("");
  const [kmEnd, setKmEnd] = useState<number | "">("");
  const [visitOutcome, setVisitOutcome] = useState<"SUCCESS" | "FOLLOW_UP" | "NO_SALE" | "">("");
  const [noSaleReason, setNoSaleReason] = useState("");
  const [saleAmount, setSaleAmount] = useState<number | "">("");
  const [saleCervezaLiters, setSaleCervezaLiters] = useState<number | "">("");
  const [saleKombuchaLiters, setSaleKombuchaLiters] = useState<number | "">("");
  const FUEL_RATE_PER_KM = 120; // CLP per km, configurable

  // --- Estados Nuevo Prospecto ---
  const [prospectData, setProspectData] = useState({
    lat: null as number | null,
    lng: null as number | null,
    fantasyName: "",
    address: "",
    localPhone: "",
    localEmail: "",
    contactName: "",
    contactRole: "",
    contactPhone: "+56",
    contactEmail: ""
  });

  // Filtrado Type-ahead
  const filteredClients = searchTerm.length > 1 
    ? MOCK_CLIENTS.filter(c => c.name.toLowerCase().includes(searchTerm.toLowerCase()))
    : [];

  const handleCheckInExisting = () => {
    if (!selectedClient) return;
    setGpsStatus("LOCATING");
    if (!navigator.geolocation) {
      alert("Geolocalización no soportada.");
      setGpsStatus("IDLE");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const dist = getDistanceFromLatLonInM(position.coords.latitude, position.coords.longitude, selectedClient.lat, selectedClient.lng);
        setDistance(Math.round(dist));
        setGpsStatus("LOCATED");
      },
      (error) => {
        alert("Error obteniendo GPS: " + error.message);
        setGpsStatus("IDLE");
      },
      { enableHighAccuracy: true }
    );
  };

  const handleCaptureProspectGPS = () => {
    if (!navigator.geolocation) {
      alert("Geolocalización no soportada.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setProspectData(prev => ({
          ...prev,
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          address: "Dirección sugerida (Simulada por API)" // Aquí iría Reverse Geocoding
        }));
      },
      (error) => {
        alert("Error obteniendo GPS: " + error.message);
      },
      { enableHighAccuracy: true }
    );
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "FRONTIS" | "EXHIBICION") => {
    const file = e.target.files?.[0];
    if (file) {
      const previewUrl = URL.createObjectURL(file);
      if (type === "FRONTIS") setFrontisPhoto(previewUrl);
      if (type === "EXHIBICION") setExhibitionPhoto(previewUrl);
    }
  };

  const saveProspectOffline = () => {
    if (!prospectData.lat || !prospectData.fantasyName || !prospectData.contactName || !isValidPhone(prospectData.contactPhone)) {
      alert("Por favor completa los campos obligatorios y asegura que el teléfono empiece con +56 y tenga 12 caracteres en total.");
      return;
    }
    if (prospectData.contactEmail && !isValidEmail(prospectData.contactEmail)) {
      alert("El correo electrónico del decisor no es válido.");
      return;
    }
    
    // Simulación de guardado en LocalStorage
    alert(`Prospecto "${prospectData.fantasyName}" guardado localmente (Offline First). Se sincronizará al tener red.`);
    router.push("/terreno/venta"); // Navegar al wizard de venta directamente
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", paddingBottom: "120px" }}>
      {/* HEADER PREMIUM */}
      <header style={{ marginBottom: "24px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #333", paddingBottom: "16px" }}>
        <div>
          <h1 style={{ fontSize: "1.8rem", color: "var(--color-yellow)", letterSpacing: "1px" }}>EL REGRESO</h1>
          <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem", textTransform: "uppercase", letterSpacing: "2px" }}>Last Mile Sales</p>
        </div>
        <Link href="/" style={{ color: "var(--color-gray-light)", fontSize: "0.9rem" }}>Cerrar Sesión</Link>
      </header>

      {/* SEGMENTED CONTROL */}
      <div style={{ display: "flex", backgroundColor: "var(--color-black)", borderRadius: "8px", border: "1px solid #333", overflow: "hidden", marginBottom: "24px" }}>
        <button 
          onClick={() => setActiveTab("GOALS")}
          style={{ flex: 1, padding: "12px", fontSize: "0.95rem", borderRadius: 0, backgroundColor: activeTab === "GOALS" ? "var(--color-yellow)" : "transparent", color: activeTab === "GOALS" ? "black" : "var(--color-gray-light)" }}
        >
          Mis Metas
        </button>
        <button 
          onClick={() => setActiveTab("EXISTING")}
          style={{ flex: 1, padding: "12px", fontSize: "0.95rem", borderRadius: 0, backgroundColor: activeTab === "EXISTING" ? "var(--color-yellow)" : "transparent", color: activeTab === "EXISTING" ? "black" : "var(--color-gray-light)" }}
        >
          Cliente Existente
        </button>
        <button 
          onClick={() => setActiveTab("PROSPECT")}
          style={{ flex: 1, padding: "12px", fontSize: "0.95rem", borderRadius: 0, backgroundColor: activeTab === "PROSPECT" ? "var(--color-yellow)" : "transparent", color: activeTab === "PROSPECT" ? "black" : "var(--color-gray-light)" }}
        >
          Nuevo Prospecto
        </button>
      </div>

      {/* =======================
          TAB 0: MIS METAS
          ======================= */}
      {activeTab === "GOALS" && (
        <section style={{ animation: "fadeIn 0.3s ease" }}>
          
          {/* Sticky Header Selector */}
          <div style={{ position: "sticky", top: 0, zIndex: 10, backgroundColor: "var(--color-black)", paddingBottom: "16px", borderBottom: "1px solid #333", marginBottom: "24px", paddingTop: "8px" }}>
            <h2 style={{ fontSize: "1.3rem", color: "var(--color-yellow)", margin: "0 0 16px 0" }}>Mis Metas: {getWeekRange(selectedMonth, selectedWeek)}</h2>
            
            <div style={{ display: "flex", gap: "8px", marginBottom: "12px", overflowX: "auto", paddingBottom: "4px" }}>
              {[5, 6, 7].map(m => (
                <button key={m} onClick={() => setSelectedMonth(m)} style={{ padding: "8px 16px", borderRadius: "16px", border: "1px solid var(--color-yellow)", backgroundColor: selectedMonth === m ? "var(--color-yellow)" : "transparent", color: selectedMonth === m ? "black" : "var(--color-yellow)", flexShrink: 0, fontWeight: "bold" }}>
                  {m === 5 ? "Mayo" : m === 6 ? "Junio" : "Julio"}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "4px" }}>
              {[1, 2, 3, 4, 5].map(w => (
                <button key={w} onClick={() => setSelectedWeek(w)} style={{ padding: "8px 16px", borderRadius: "8px", border: "1px solid #333", backgroundColor: selectedWeek === w ? "#222" : "transparent", color: selectedWeek === w ? "white" : "#888", flexShrink: 0 }}>
                  S{w}
                </button>
              ))}
            </div>
          </div>

          <p style={{ color: "var(--color-gray-light)", fontSize: "0.9rem", marginBottom: "24px" }}>
            {isFuture(selectedMonth, selectedWeek) ? "⏳ Modo Lectura: Cuota asignada para el futuro." : isPast(selectedMonth, selectedWeek) ? "✅ Histórico de semana finalizada." : "🔥 Progreso en vivo basado en ventas cerradas (SUCCESS)."}
          </p>

          <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {salesTargets.map(target => {
              const fut = isFuture(selectedMonth, selectedWeek);
              const past = isPast(selectedMonth, selectedWeek);
              const progress = calculateTargetProgress(target.targetLiters, target.currentLiters, fut, past);
              
              let barColor = "var(--color-yellow)";
              if (target.category === "Bar") barColor = "#4D90FE"; // Blue for Bars
              if (target.category === "Minimarket") barColor = "var(--color-yellow)"; // Yellow for Minimarkets
              
              if (progress.status === "ALERT") barColor = "#FF3333";
              if (progress.status === "ACHIEVED") barColor = "#00FF00";

              return (
                <div key={target.id} className="card" style={{ border: `1px solid ${progress.status === "ALERT" ? "#FF3333" : "#333"}`, position: "relative", overflow: "hidden", opacity: fut ? 0.7 : 1 }}>
                  
                  {progress.status === "ACHIEVED" && (
                    <div style={{ position: "absolute", top: 0, right: 0, padding: "4px 12px", backgroundColor: "#00FF00", color: "black", fontSize: "0.8rem", fontWeight: "bold", borderBottomLeftRadius: "8px" }}>
                      🏆 GOAL ACHIEVED!
                    </div>
                  )}
                  {progress.status === "ALERT" && (
                    <div style={{ position: "absolute", top: 0, right: 0, padding: "4px 12px", backgroundColor: "#FF3333", color: "white", fontSize: "0.8rem", fontWeight: "bold", borderBottomLeftRadius: "8px" }}>
                      ⚠️ PERFORMANCE ALERT
                    </div>
                  )}

                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "12px", marginTop: "12px" }}>
                    <h3 style={{ margin: 0, fontSize: "1.1rem", color: "white" }}>Meta {target.category}</h3>
                    <span style={{ fontWeight: "bold", color: barColor }}>{progress.percentage}%</span>
                  </div>

                  <div style={{ width: "100%", height: "16px", backgroundColor: "#222", borderRadius: "8px", overflow: "hidden", marginBottom: "12px" }}>
                    <div style={{ height: "100%", width: `${progress.percentage}%`, backgroundColor: barColor, transition: "width 0.5s ease" }} />
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem", color: "var(--color-gray-light)" }}>
                    <span>Vendidos: <strong>{target.currentLiters}L</strong></span>
                    <span>Meta Total: <strong>{target.targetLiters}L</strong></span>
                  </div>
                  
                  {progress.remainingLiters > 0 && (
                    <p style={{ marginTop: "12px", fontSize: "0.85rem", color: "#888", fontStyle: "italic" }}>
                      {fut ? `Debes vender ${progress.remainingLiters}L durante esta semana.` : `Te faltan ${progress.remainingLiters}L para alcanzar la meta.`}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* =======================
          TAB 1: CLIENTE EXISTENTE
          ======================= */}
      {activeTab === "EXISTING" && (
        <section>
          {/* 1. Buscador Inteligente */}
          <div className="card" style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.1rem", color: "var(--color-gray-light)", marginBottom: "12px" }}>Buscador de Clientes</h2>
            <input 
              type="text" 
              placeholder="Buscar por nombre o razón social..." 
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                if (selectedClient && e.target.value !== selectedClient.name) setSelectedClient(null);
              }}
              style={{ padding: "16px", fontSize: "1.1rem" }}
            />
            {filteredClients.length > 0 && !selectedClient && (
              <ul style={{ listStyle: "none", padding: 0, margin: "8px 0 0 0", border: "1px solid #333", borderRadius: "4px", backgroundColor: "var(--color-black)" }}>
                {filteredClients.map(c => (
                  <li 
                    key={c.id} 
                    onClick={() => { setSelectedClient(c); setSearchTerm(c.name); setGpsStatus("IDLE"); setDistance(null); }}
                    style={{ padding: "12px 16px", borderBottom: "1px solid #222", cursor: "pointer", color: "var(--color-yellow)" }}
                  >
                    {c.name} <span style={{ fontSize: "0.8rem", color: "#888" }}>({c.channel})</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* 2. Ficha 360 y Auditoría */}
          {selectedClient && (
            <div style={{ animation: "fadeIn 0.3s ease" }}>
              <div className="card" style={{ marginBottom: "16px", border: `2px solid ${getClientAura(selectedClient.lastVisitDate).border}`, backgroundColor: getClientAura(selectedClient.lastVisitDate).bg }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                  <h2 style={{ fontSize: "1.4rem", color: "white", margin: 0 }}>Ficha 360°: {selectedClient.name}</h2>
                  <span style={{ fontSize: "0.8rem", padding: "4px 8px", backgroundColor: getClientAura(selectedClient.lastVisitDate).border, color: "black", fontWeight: "bold", borderRadius: "4px" }}>
                    {getClientAura(selectedClient.lastVisitDate).label}
                  </span>
                </div>
                
                <div className="grid-1-to-2">
                  <div>
                    <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem" }}>Pedidos Recientes</p>
                    <p style={{ marginBottom: "12px", fontWeight: "bold" }}>{selectedClient.history}</p>
                    
                    <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem" }}>Frecuencia de Compra</p>
                    <p style={{ marginBottom: "12px" }}>{selectedClient.purchaseFrequency}</p>
                    
                    <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem" }}>Estado de Cuenta</p>
                    <p style={{ marginBottom: "12px", color: selectedClient.accountStatus.includes("Deuda") ? "#FF3333" : "#00FF00" }}>{selectedClient.accountStatus}</p>
                  </div>
                  <div>
                    <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem" }}>Día de Visita Asignado</p>
                    <p style={{ marginBottom: "12px" }}>{selectedClient.visitDay}</p>
                    
                    <p style={{ color: "var(--color-gray-light)", fontSize: "0.85rem" }}>Contacto Principal</p>
                    <p style={{ marginBottom: "12px", color: "var(--color-yellow)" }}>
                      <a href={`https://wa.me/${selectedClient.contact.split("(")[1].replace(")", "")}`} target="_blank" rel="noreferrer" style={{ textDecoration: "underline" }}>
                        {selectedClient.contact}
                      </a>
                    </p>

                    <div style={{ padding: "8px", border: "1px solid #FFD700", borderRadius: "4px", backgroundColor: "#111" }}>
                      <p style={{ color: "var(--color-yellow)", fontSize: "0.75rem", textTransform: "uppercase", fontWeight: "bold", margin: "0 0 4px 0" }}>💡 Smart Pitch Sugerido</p>
                      <p style={{ fontSize: "0.9rem", margin: 0, fontStyle: "italic" }}>Ofrécele: <strong>{getSmartPitch(selectedClient.orderedProducts)}</strong></p>
                      <p style={{ fontSize: "0.75rem", color: "#888", margin: "4px 0 0 0" }}>(Nunca lo ha comprado)</p>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: "24px", paddingTop: "16px", borderTop: "1px solid #333" }}>
                  <button 
                    onClick={handleCheckInExisting} 
                    disabled={gpsStatus === "LOCATING"}
                    style={{ width: "100%", padding: "12px", marginBottom: "16px" }}
                  >
                    {gpsStatus === "LOCATING" ? "Geolocalizando..." : "Validar Posición GPS"}
                  </button>

                  {gpsStatus === "LOCATED" && distance !== null && (
                    <div style={{ padding: "12px", borderRadius: "4px", backgroundColor: distance > 200 ? "rgba(255, 215, 0, 0.1)" : "rgba(0, 255, 0, 0.1)", border: `1px solid ${distance > 200 ? "var(--color-yellow)" : "#00FF00"}` }}>
                      <strong style={{ color: distance > 200 ? "var(--color-yellow)" : "#00FF00" }}>
                        ✓ {distance > 200 ? "Validado con Advertencia (Fuera de rango)" : "Validado"}
                      </strong>
                      <p style={{ fontSize: "0.9rem" }}>A {distance}m de distancia.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Check-in & KM Inicial */}
              {gpsStatus === "LOCATED" && (
                <section className="card" style={{ marginBottom: "24px" }}>
                  <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-gray-light)" }}>Llegada & Tracking</h2>
                  <div>
                    <label style={{ display: "block", fontSize: "0.9rem", color: "var(--color-gray-light)", marginBottom: "8px" }}>Kilometraje Inicial (Llegada)</label>
                    <input 
                      type="number" 
                      placeholder="Ej: 12500" 
                      value={kmStart}
                      onChange={e => setKmStart(e.target.value ? Number(e.target.value) : "")}
                      style={{ width: "100%", padding: "12px", backgroundColor: "#111", border: "1px solid #333", color: "white", borderRadius: "4px" }}
                    />
                  </div>
                </section>
              )}

              {/* Auditoría Visual (Fotos) */}
              <section className="card" style={{ marginBottom: "24px", opacity: (gpsStatus === "LOCATED" && kmStart !== "") ? 1 : 0.5, pointerEvents: (gpsStatus === "LOCATED" && kmStart !== "") ? "auto" : "none" }}>
                <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-gray-light)" }}>Auditoría Visual</h2>
                <div className="grid-1-to-2">
                  <div style={{ border: "1px dashed var(--color-yellow)", padding: "16px", borderRadius: "8px", textAlign: "center", position: "relative" }}>
                    <span style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>📸 Frontis Local</span>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoUpload(e, "FRONTIS")} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
                    {frontisPhoto ? <img src={frontisPhoto} alt="Frontis" style={{ width: "100%", borderRadius: "4px", marginTop: "8px" }} /> : <div style={{ backgroundColor: "var(--color-black)", padding: "24px", borderRadius: "4px" }}>Toque para cámara</div>}
                  </div>
                  <div style={{ border: "1px dashed var(--color-yellow)", padding: "16px", borderRadius: "8px", textAlign: "center", position: "relative" }}>
                    <span style={{ display: "block", marginBottom: "8px", fontWeight: "bold" }}>📸 Exhibición</span>
                    <input type="file" accept="image/*" capture="environment" onChange={(e) => handlePhotoUpload(e, "EXHIBICION")} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", opacity: 0, cursor: "pointer" }} />
                    {exhibitionPhoto ? <img src={exhibitionPhoto} alt="Exhibicion" style={{ width: "100%", borderRadius: "4px", marginTop: "8px" }} /> : <div style={{ backgroundColor: "var(--color-black)", padding: "24px", borderRadius: "4px" }}>Toque para cámara</div>}
                  </div>
                </div>
              </section>

              {/* Check-out & Logística */}
              <section className="card" style={{ marginBottom: "24px", opacity: (frontisPhoto && exhibitionPhoto) ? 1 : 0.5, pointerEvents: (frontisPhoto && exhibitionPhoto) ? "auto" : "none" }}>
                <h2 style={{ marginBottom: "16px", fontSize: "1.2rem", color: "var(--color-gray-light)" }}>Check-out & Resolución</h2>
                
                <div className="grid-1-to-2" style={{ marginBottom: "16px" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.9rem", color: "var(--color-gray-light)", marginBottom: "8px" }}>Kilometraje Final (Salida)</label>
                    <input 
                      type="number" 
                      placeholder="Ej: 12515" 
                      value={kmEnd}
                      onChange={e => setKmEnd(e.target.value ? Number(e.target.value) : "")}
                      style={{ width: "100%", padding: "12px", backgroundColor: "#111", border: "1px solid #333", color: "white", borderRadius: "4px" }}
                    />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.9rem", color: "var(--color-gray-light)", marginBottom: "8px" }}>Resultado de la Visita *</label>
                    <select 
                      value={visitOutcome} 
                      onChange={e => setVisitOutcome(e.target.value as any)} 
                      style={{ width: "100%", padding: "12px", backgroundColor: "#111", border: "1px solid #333", color: "white", borderRadius: "4px" }}
                    >
                      <option value="">Seleccione el resultado</option>
                      <option value="SUCCESS">Venta Exitosa (SUCCESS)</option>
                      <option value="FOLLOW_UP">Seguimiento (FOLLOW_UP)</option>
                      <option value="NO_SALE">Sin Venta (NO_SALE)</option>
                    </select>
                  </div>
                </div>

                {visitOutcome === "NO_SALE" && (
                  <div style={{ marginBottom: "16px", animation: "fadeIn 0.3s ease" }}>
                    <label style={{ display: "block", fontSize: "0.9rem", color: "var(--color-yellow)", marginBottom: "8px" }}>Razón de No Venta *</label>
                    <select 
                      value={noSaleReason} 
                      onChange={e => setNoSaleReason(e.target.value)} 
                      style={{ width: "100%", padding: "12px", backgroundColor: "#111", border: "1px solid var(--color-yellow)", color: "white", borderRadius: "4px" }}
                    >
                      <option value="">Indique el motivo de rechazo</option>
                      <option value="high_stock">Stock Alto</option>
                      <option value="price_issue">Problema de Precio</option>
                      <option value="competitor">Preferencia por Competencia</option>
                      <option value="decision_maker_absent">Decisor Ausente</option>
                      <option value="closed">Local Cerrado</option>
                    </select>
                  </div>
                )}

                {visitOutcome === "SUCCESS" && (
                  <div style={{ marginBottom: "16px", animation: "fadeIn 0.3s ease", display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.9rem", color: "#00FF00", marginBottom: "4px" }}>Monto Total Vendido ($)</label>
                      <input 
                        type="number" 
                        placeholder="Ej: 150000" 
                        value={saleAmount}
                        onChange={e => setSaleAmount(e.target.value ? Number(e.target.value) : "")}
                        style={{ width: "100%", padding: "12px", backgroundColor: "#111", border: "1px solid #00FF00", color: "white", borderRadius: "4px" }}
                      />
                    </div>
                    
                    <div className="grid-1-to-2">
                      <div>
                        <label style={{ display: "block", color: "var(--color-gray-light)", marginBottom: "4px", fontSize: "0.85rem" }}>Venta Cerveza (Litros)</label>
                        <input 
                          type="number" 
                          placeholder="0"
                          value={saleCervezaLiters}
                          onChange={(e) => setSaleCervezaLiters(e.target.value ? Number(e.target.value) : "")}
                          style={{ width: "100%", padding: "12px", backgroundColor: "#111", border: "1px solid #4D90FE", color: "white", borderRadius: "4px" }}
                        />
                      </div>
                      <div>
                        <label style={{ display: "block", color: "var(--color-gray-light)", marginBottom: "4px", fontSize: "0.85rem" }}>Venta Kombucha (Litros)</label>
                        <input 
                          type="number" 
                          placeholder="0"
                          value={saleKombuchaLiters}
                          onChange={(e) => setSaleKombuchaLiters(e.target.value ? Number(e.target.value) : "")}
                          style={{ width: "100%", padding: "12px", backgroundColor: "#111", border: "1px solid var(--color-yellow)", color: "white", borderRadius: "4px" }}
                        />
                      </div>
                    </div>
                    
                    <div style={{ padding: "12px", backgroundColor: "#111", borderRadius: "8px", border: "1px dashed #333", display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "var(--color-gray-light)" }}>Total Volumen Vendido:</span>
                      <strong style={{ color: "white" }}>{(Number(saleCervezaLiters) || 0) + (Number(saleKombuchaLiters) || 0)} L</strong>
                    </div>
                  </div>
                )}

                {/* Logistics Auto-Calculation */}
                {kmStart !== "" && kmEnd !== "" && kmEnd >= kmStart && (
                  <div style={{ padding: "16px", backgroundColor: "#1a1a1a", border: "1px solid #333", borderRadius: "8px", marginTop: "16px" }}>
                    <h4 style={{ margin: "0 0 12px 0", color: "var(--color-gray-light)" }}>Rentabilidad Logística</h4>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span>Distancia Recorrida:</span>
                      <strong>{kmEnd - kmStart} km</strong>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "8px" }}>
                      <span>Costo Estimado de Combustible:</span>
                      <strong>${((kmEnd - kmStart) * FUEL_RATE_PER_KM).toLocaleString("es-CL")}</strong>
                    </div>
                    
                    {visitOutcome === "SUCCESS" && saleAmount !== "" && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #333", color: (saleAmount - ((kmEnd - kmStart) * FUEL_RATE_PER_KM)) > 0 ? "#00FF00" : "#FF3333" }}>
                        <strong style={{ fontSize: "1.1rem" }}>Balance de la Visita:</strong>
                        <strong style={{ fontSize: "1.1rem" }}>
                          ${(saleAmount - ((kmEnd - kmStart) * FUEL_RATE_PER_KM)).toLocaleString("es-CL")}
                        </strong>
                      </div>
                    )}
                    {visitOutcome === "NO_SALE" && (
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "12px", paddingTop: "12px", borderTop: "1px solid #333", color: "#FF3333" }}>
                        <strong style={{ fontSize: "1.1rem" }}>Balance de la Visita (Pérdida):</strong>
                        <strong style={{ fontSize: "1.1rem" }}>-${((kmEnd - kmStart) * FUEL_RATE_PER_KM).toLocaleString("es-CL")}</strong>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* Action Buttons */}
              <section style={{ opacity: (visitOutcome !== "" && kmEnd !== "") ? 1 : 0.5, pointerEvents: (visitOutcome !== "" && kmEnd !== "") ? "auto" : "none" }}>
                {visitOutcome === "SUCCESS" ? (
                  <button style={{ width: "100%", backgroundColor: "var(--color-yellow)", color: "black", padding: "16px", fontSize: "1.1rem", fontWeight: "bold" }} onClick={() => {
                    alert("Check-out registrado. Venta agregada al Live Progress Bar.");
                    
                    // === ATOMIC TRANSACTION SIMULATION ===
                    const totalCerveza = Number(saleCervezaLiters) || 0;
                    const totalKombucha = Number(saleKombuchaLiters) || 0;
                    
                    // Prisma Transaction simulation (Step A, B, C)
                    // 1. Prisma.visit.create({ saleCervezaLiters: totalCerveza, saleKombuchaLiters: totalKombucha })
                    // 2. Prisma.salesTarget.update({ ... })
                    
                    setSalesTargets(prev => prev.map(t => {
                       if (t.category === "Bar" || t.category === "Supermercado") {
                         return { ...t, currentLiters: t.currentLiters + totalCerveza };
                       }
                       if (t.category === "Minimarket") {
                         return { ...t, currentLiters: t.currentLiters + totalKombucha };
                       }
                       return t;
                    }));
                    
                    // Encontrar la meta actual para el mensaje
                    const targetCategory = selectedClient?.channel === "HORECA" ? "Bar" : "Supermercado";
                    const currentTarget = salesTargets.find(t => t.category === targetCategory);
                    const remaining = currentTarget ? currentTarget.targetLiters - (currentTarget.currentLiters + totalCerveza) : 0;

                    alert(`✅ Venta registrada:\n¡Te faltan solo ${Math.max(0, remaining)} litros para cumplir tu meta de la semana!`);
                    
                    setSelectedClient(null);
                    setSearchTerm("");
                    setGpsStatus("IDLE");
                    setKmStart(""); setKmEnd(""); setVisitOutcome(""); 
                    setSaleCervezaLiters(""); setSaleKombuchaLiters("");
                    setActiveTab("GOALS");
                  }}>
                    🛒 Confirmar Check-out & Actualizar Metas
                  </button>
                ) : (
                  <button style={{ width: "100%", backgroundColor: "var(--color-gray-light)", color: "black", padding: "16px", fontSize: "1.1rem", fontWeight: "bold" }} onClick={() => {
                    alert("Check-out registrado. Retornando a la ruta.");
                    setSelectedClient(null);
                    setSearchTerm("");
                    setGpsStatus("IDLE");
                    setKmStart(""); setKmEnd(""); setVisitOutcome("");
                  }}>
                    Guardar Visita & Continuar Ruta
                  </button>
                )}
              </section>
            </div>
          )}
        </section>
      )}

      {/* =======================
          TAB 2: NUEVO PROSPECTO
          ======================= */}
      {activeTab === "PROSPECT" && (
        <section style={{ animation: "fadeIn 0.3s ease" }}>
          
          <div className="card" style={{ marginBottom: "16px" }}>
            <h2 style={{ fontSize: "1.2rem", color: "var(--color-yellow)", marginBottom: "16px" }}>Paso 1: Georeferenciación</h2>
            <button onClick={handleCaptureProspectGPS} style={{ width: "100%" }}>
              {prospectData.lat ? "✓ GPS Capturado Exitosamente" : "📍 Capturar Ubicación GPS Actual"}
            </button>
          </div>

          <div className="card" style={{ marginBottom: "16px", opacity: prospectData.lat ? 1 : 0.5, pointerEvents: prospectData.lat ? "auto" : "none" }}>
            <h2 style={{ fontSize: "1.2rem", color: "var(--color-yellow)", marginBottom: "16px" }}>Paso 2: Datos del Local</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input type="text" placeholder="Nombre Fantasía *" value={prospectData.fantasyName} onChange={e => setProspectData({...prospectData, fantasyName: e.target.value})} />
              <input type="text" placeholder="Dirección (Auto-sugerida) *" value={prospectData.address} onChange={e => setProspectData({...prospectData, address: e.target.value})} />
              <input type="text" placeholder="Teléfono Fijo / Local" value={prospectData.localPhone} onChange={e => setProspectData({...prospectData, localPhone: e.target.value})} />
              <input type="email" placeholder="Correo del Local" value={prospectData.localEmail} onChange={e => setProspectData({...prospectData, localEmail: e.target.value})} />
            </div>
          </div>

          <div className="card" style={{ marginBottom: "24px", opacity: prospectData.lat ? 1 : 0.5, pointerEvents: prospectData.lat ? "auto" : "none" }}>
            <h2 style={{ fontSize: "1.2rem", color: "var(--color-yellow)", marginBottom: "16px" }}>Paso 3: Ficha del Decisor</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <input type="text" placeholder="Nombre Completo *" value={prospectData.contactName} onChange={e => setProspectData({...prospectData, contactName: e.target.value})} />
              <select value={prospectData.contactRole} onChange={e => setProspectData({...prospectData, contactRole: e.target.value})}>
                <option value="">Seleccione el Cargo *</option>
                <option value="Dueño">Dueño</option>
                <option value="Administrador">Administrador</option>
                <option value="Sommelier">Sommelier</option>
                <option value="Jefe de Barra">Jefe de Barra</option>
              </select>
              <input type="text" placeholder="WhatsApp Directo (+56) *" value={prospectData.contactPhone} onChange={e => setProspectData({...prospectData, contactPhone: e.target.value})} />
              <input type="email" placeholder="Correo del Decisor" value={prospectData.contactEmail} onChange={e => setProspectData({...prospectData, contactEmail: e.target.value})} />
            </div>
          </div>

          <button 
            onClick={saveProspectOffline}
            disabled={!prospectData.lat}
            style={{ width: "100%", padding: "16px", fontSize: "1.2rem" }}
          >
            Guardar Prospecto y Vender
          </button>
        </section>
      )}

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
