"use client";
import { useState, useRef, useCallback, useEffect } from "react";

const CATEGORIES = [
  { id: "books", label: "Books", icon: "📚", sources: "AbeBooks, eBay" },
  { id: "records", label: "Vinyl Records", icon: "🎶", sources: "Discogs, eBay" },
  { id: "cds", label: "CDs / DVDs", icon: "💿", sources: "Discogs, eBay" },
  { id: "games", label: "Video Games", icon: "🎮", sources: "PriceCharting, eBay" },
  { id: "cards", label: "Trading Cards", icon: "🃏", sources: "TCGPlayer, eBay" },
  { id: "other", label: "Other", icon: "✨", sources: "eBay" },
];

const API_CONFIG = [
  { id: "gemini", label: "Gemini API Key", icon: "🤖", required: true, placeholder: "AIza...", badge: "REQUIRED", badgeColor: "#dc2626", helpText: "Free at aistudio.google.com", helpUrl: "https://aistudio.google.com/app/apikey", description: "AI Vision — identifies all items", categories: "All categories" },
  { id: "ebay", label: "eBay App ID", icon: "🛒", required: false, placeholder: "YourApp-XXXX-XXXX-XXXX-XXXX", badge: "FREE", badgeColor: "#059669", helpText: "developer.ebay.com → My Keys", helpUrl: "https://developer.ebay.com/my/keys", description: "eBay live listing prices", categories: "All categories" },
  { id: "ebayCert", label: "eBay Cert ID", icon: "🔑", required: false, placeholder: "SandBox-XXXX-XXXX-XXXX-XXXX", badge: "FREE", badgeColor: "#059669", helpText: "developer.ebay.com → My Keys (same page as App ID)", helpUrl: "https://developer.ebay.com/my/keys", description: "Required alongside App ID for OAuth", categories: "All categories" },
  { id: "discogs", label: "Discogs Token", icon: "🎶", required: false, placeholder: "abCdEfGhIjKlMn...", badge: "FREE", badgeColor: "#059669", helpText: "discogs.com/settings/developers", helpUrl: "https://www.discogs.com/settings/developers", description: "Marketplace prices for vinyl & CDs", categories: "Vinyl Records, CDs/DVDs" },
  { id: "justtcg", label: "JustTCG API Key", icon: "🃏", required: false, placeholder: "jtcg_...", badge: "FREE", badgeColor: "#059669", helpText: "Free tier at justtcg.com", helpUrl: "https://justtcg.com", description: "Pokemon, MTG, Yu-Gi-Oh prices", categories: "Trading Cards" },
];

function TreasureIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 2L15 8.5L22 9.5L17 14.5L18 21.5L12 18L6 21.5L7 14.5L2 9.5L9 8.5L12 2Z" fill="rgba(212,160,23,0.2)" stroke="#d4a017"/>
    </svg>
  );
}

function ValueBadge({ tier }) {
  const styles = {
    treasure: { bg: "linear-gradient(135deg, #d4a017, #f5d442)", color: "#000", label: "👑 TREASURE" },
    good: { bg: "linear-gradient(135deg, #2563eb, #60a5fa)", color: "#fff", label: "💰 GOOD FIND" },
    decent: { bg: "linear-gradient(135deg, #059669, #34d399)", color: "#fff", label: "✅ DECENT" },
    trash: { bg: "linear-gradient(135deg, #525252, #737373)", color: "#fff", label: "🗑️ SKIP" },
  };
  const s = styles[tier] || styles.trash;
  return <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", whiteSpace: "nowrap" }}>{s.label}</span>;
}

async function compressImage(file, maxWidth = 1600, quality = 0.7) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > maxWidth) { h = (h * maxWidth) / w; w = maxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        canvas.toBlob((blob) => resolve(new File([blob], file.name, { type: "image/jpeg" })), "image/jpeg", quality);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function PriceRow({ label, icon, data, geminiVal }) {
  if (!data && !geminiVal) return null;
  const price = data ? data.price : geminiVal;
  const isGemini = !data;
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", borderBottom: "1px solid #1a1a1a" }}>
      <span style={{ fontSize: 11, color: "#737373" }}>{icon} {label}{data?.count ? ` (${data.count} listings)` : ""}</span>
      <span style={{ fontSize: 13, fontWeight: isGemini ? 400 : 600, color: isGemini ? "#737373" : "#e5e5e5" }}>${price?.toLocaleString() ?? "—"}</span>
    </div>
  );
}

function SettingsPanel({ keys, onSave, onClose }) {
  const [vals, setVals] = useState({ ...keys });
  const [visible, setVisible] = useState({});
  const [saved, setSaved] = useState(false);
  const handleSave = () => { onSave(vals); setSaved(true); setTimeout(() => { setSaved(false); onClose(); }, 800); };
  const connected = API_CONFIG.filter(c => vals[c.id]?.trim()).length;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "16px", overflowY: "auto" }}>
      <div style={{ background: "#0a0a0a", border: "1px solid #d4a017", borderRadius: 16, padding: 24, width: "100%", maxWidth: 480, marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <h2 style={{ margin: 0, color: "#d4a017", fontFamily: "'Playfair Display', serif", fontSize: 22 }}>⚙️ API Settings</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", color: "#737373", fontSize: 22, cursor: "pointer" }}>✕</button>
        </div>
        <p style={{ color: "#525252", fontSize: 11, marginBottom: 20, marginTop: 0 }}>{connected} of {API_CONFIG.length} sources connected · Keys saved locally only</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {API_CONFIG.map((cfg) => {
            const hasKey = vals[cfg.id]?.trim();
            return (
              <div key={cfg.id} style={{ background: hasKey ? "rgba(212,160,23,0.04)" : "#111", border: `1px solid ${hasKey ? "rgba(212,160,23,0.25)" : "#222"}`, borderRadius: 10, padding: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: 16 }}>{cfg.icon}</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e5e5" }}>{cfg.label}</span>
                  <span style={{ background: cfg.badgeColor, color: "#fff", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3 }}>{cfg.badge}</span>
                  {hasKey && <span style={{ color: "#22c55e", fontSize: 12 }}>✓</span>}
                </div>
                <div style={{ fontSize: 10, color: "#525252", marginBottom: 8 }}>{cfg.description} · {cfg.categories}</div>
                <div style={{ position: "relative" }}>
                  <input type={visible[cfg.id] ? "text" : "password"} value={vals[cfg.id] || ""} onChange={(e) => setVals(v => ({ ...v, [cfg.id]: e.target.value }))} placeholder={cfg.placeholder}
                    style={{ width: "100%", background: "#000", border: "1px solid #2a2a2a", borderRadius: 6, padding: "9px 36px 9px 10px", color: "#e5e5e5", fontSize: 12, fontFamily: "monospace", boxSizing: "border-box" }} />
                  <button onClick={() => setVisible(v => ({ ...v, [cfg.id]: !v[cfg.id] }))} style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", color: "#525252", cursor: "pointer", fontSize: 14, padding: 0 }}>
                    {visible[cfg.id] ? "🙈" : "👁️"}
                  </button>
                </div>
                <a href={cfg.helpUrl} target="_blank" rel="noopener noreferrer" style={{ display: "inline-block", marginTop: 5, fontSize: 10, color: "#d4a017", textDecoration: "none" }}>↗ {cfg.helpText}</a>
              </div>
            );
          })}
        </div>
        <div style={{ background: "rgba(212,160,23,0.04)", border: "1px solid rgba(212,160,23,0.15)", borderRadius: 8, padding: 10, margin: "20px 0" }}>
          <p style={{ fontSize: 10, color: "#525252", margin: 0 }}>🔒 Keys stored in your browser only — never sent to any Trash or Treasure server.</p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={() => { onSave({}); onClose(); }} style={{ flex: 1, background: "transparent", color: "#525252", border: "1px solid #222", borderRadius: 8, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>Clear All</button>
          <button onClick={handleSave} style={{ flex: 2, background: saved ? "#059669" : "linear-gradient(135deg, #d4a017, #b8860b)", color: "#000", border: "none", borderRadius: 8, padding: "11px", fontSize: 14, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
            {saved ? "✓ Saved!" : "💾 Save Keys"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [category, setCategory] = useState("books");
  const [bookFormat, setBookFormat] = useState("paperback");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKeys, setApiKeys] = useState({});
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  useEffect(() => { try { const s = localStorage.getItem("tot_api_keys"); if (s) setApiKeys(JSON.parse(s)); } catch {} }, []);
  const saveKeys = (keys) => { setApiKeys(keys); try { localStorage.setItem("tot_api_keys", JSON.stringify(keys)); } catch {} };

  const handleImage = useCallback(async (file) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("Image too large."); return; }
    const compressed = await compressImage(file);
    setImage(compressed); setResults(null); setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(compressed);
  }, []);

  const handleDrop = useCallback((e) => { e.preventDefault(); const f = e.dataTransfer?.files?.[0]; if (f && f.type.startsWith("image/")) handleImage(f); }, [handleImage]);

  const analyze = async () => {
    if (!image) return;
    if (!apiKeys.gemini) { setShowSettings(true); return; }
    setLoading(true); setError(null); setResults(null);
    try {
      const fd = new FormData();
      fd.append("image", image); fd.append("category", category);
      fd.append("bookFormat", bookFormat);
      fd.append("apiKey", apiKeys.gemini || "");
      fd.append("ebayKey", apiKeys.ebay || "");
      fd.append("ebayCertKey", apiKeys.ebayCert || "");
      fd.append("discogsKey", apiKeys.discogs || "");
      fd.append("justtcgKey", apiKeys.justtcg || "");
      const res = await fetch("/api/analyze", { method: "POST", body: fd });
      if (!res.ok) { const e = await res.json().catch(() => ({})); if (e.error === "NO_API_KEY") setShowSettings(true); throw new Error(e.error || "Analysis failed"); }
      const data = await res.json();
      setResults(data); setScanCount(c => c + 1);
    } catch (err) { setError(err.message || "Something went wrong."); }
    finally { setLoading(false); }
  };

  const reset = () => { setImage(null); setImagePreview(null); setResults(null); setError(null); };
  const totalValue = results?.items?.reduce((s, i) => s + (i.recommended || i.estimatedValue || 0), 0) || 0;
  const treasureCount = results?.items?.filter(i => i.tier === "treasure").length || 0;
  const selectedCat = CATEGORIES.find(c => c.id === category);
  const connectedSources = Object.values(apiKeys).filter(Boolean).length;

  return (
    <main style={{ minHeight: "100vh", maxWidth: 480, margin: "0 auto", padding: "16px 16px 100px" }}>
      {showSettings && <SettingsPanel keys={apiKeys} onSave={saveKeys} onClose={() => setShowSettings(false)} />}

      <header style={{ textAlign: "center", padding: "24px 0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
          <TreasureIcon size={28} />
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900, color: "#d4a017", margin: 0 }}>TRASH <span style={{ color: "#525252", fontSize: 18, fontWeight: 400 }}>or</span> TREASURE</h1>
          <TreasureIcon size={28} />
        </div>
        <p style={{ color: "#737373", fontSize: 12, margin: 0, letterSpacing: "1px" }}>AI-POWERED COLLECTIBLE SCANNER</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8 }}>
          {scanCount > 0 && <span style={{ color: "#525252", fontSize: 11 }}>{scanCount} scan{scanCount !== 1 ? "s" : ""} this session</span>}
          <button onClick={() => setShowSettings(true)} style={{ background: apiKeys.gemini ? "rgba(212,160,23,0.1)" : "rgba(220,38,38,0.1)", border: `1px solid ${apiKeys.gemini ? "rgba(212,160,23,0.3)" : "rgba(220,38,38,0.4)"}`, borderRadius: 6, padding: "4px 12px", fontSize: 11, color: apiKeys.gemini ? "#d4a017" : "#f87171", cursor: "pointer", fontFamily: "inherit" }}>
            ⚙️ {apiKeys.gemini ? `${connectedSources} source${connectedSources !== 1 ? "s" : ""} connected` : "Add API Key"}
          </button>
        </div>
      </header>

      <section style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, color: "#737373", marginBottom: 6, letterSpacing: "0.5px" }}>CATEGORY</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {CATEGORIES.map(cat => (
            <button key={cat.id} onClick={() => setCategory(cat.id)} style={{ background: category === cat.id ? "rgba(212,160,23,0.15)" : "var(--surface)", border: "1px solid " + (category === cat.id ? "#d4a017" : "var(--border)"), borderRadius: 8, padding: "10px 4px", cursor: "pointer", textAlign: "center" }}>
              <div style={{ fontSize: 20 }}>{cat.icon}</div>
              <div style={{ fontSize: 10, color: category === cat.id ? "#d4a017" : "#a3a3a3", marginTop: 2, fontWeight: category === cat.id ? 700 : 400 }}>{cat.label}</div>
            </button>
          ))}
        </div>

        {category === "books" && (
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {["paperback", "hardcover"].map(fmt => (
              <button key={fmt} onClick={() => setBookFormat(fmt)} style={{
                flex: 1, padding: "8px", borderRadius: 8, cursor: "pointer", fontFamily: "inherit", fontSize: 12, fontWeight: bookFormat === fmt ? 700 : 400,
                background: bookFormat === fmt ? "rgba(212,160,23,0.15)" : "var(--surface)",
                border: "1px solid " + (bookFormat === fmt ? "#d4a017" : "var(--border)"),
                color: bookFormat === fmt ? "#d4a017" : "#a3a3a3",
              }}>
                {fmt === "paperback" ? "📖 Paperback" : "📕 Hardcover"}
              </button>
            ))}
          </div>
        )}
      </section>

      {!imagePreview ? (
        <section onDrop={handleDrop} onDragOver={e => e.preventDefault()} style={{ border: "2px dashed #333", borderRadius: 12, padding: "40px 20px", textAlign: "center", background: "var(--surface)", cursor: "pointer" }} onClick={() => fileInputRef.current?.click()}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>📷</div>
          <p style={{ color: "#a3a3a3", fontSize: 14, margin: "0 0 16px" }}>Snap a photo of your collection</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={e => { e.stopPropagation(); cameraInputRef.current?.click(); }} style={{ background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>📸 Take Photo</button>
            <button onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }} style={{ background: "var(--border)", color: "#e5e5e5", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>📁 Upload</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={e => handleImage(e.target.files?.[0])} style={{ display: "none" }} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={e => handleImage(e.target.files?.[0])} style={{ display: "none" }} />
        </section>
      ) : (
        <section>
          <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 12, border: "1px solid var(--border)" }}>
            <img src={imagePreview} alt="Preview" style={{ width: "100%", display: "block", maxHeight: 300, objectFit: "cover" }} />
            <button onClick={reset} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16 }}>✕</button>
            {category === "books" && (
              <div style={{ position: "absolute", bottom: 8, left: 8, display: "flex", gap: 4 }}>
                {["paperback", "hardcover"].map(fmt => (
                  <button key={fmt} onClick={() => setBookFormat(fmt)} style={{ padding: "4px 10px", borderRadius: 6, cursor: "pointer", fontFamily: "inherit", fontSize: 11, fontWeight: bookFormat === fmt ? 700 : 400, background: bookFormat === fmt ? "#d4a017" : "rgba(0,0,0,0.7)", border: "1px solid " + (bookFormat === fmt ? "#d4a017" : "#555"), color: bookFormat === fmt ? "#000" : "#fff" }}>
                    {fmt === "paperback" ? "📖 PB" : "📕 HC"}
                  </button>
                ))}
              </div>
            )}
          </div>
          {!results && <button onClick={analyze} disabled={loading} style={{ width: "100%", background: loading ? "#333" : "linear-gradient(135deg, #d4a017, #b8860b)", color: loading ? "#737373" : "#000", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 800, cursor: loading ? "wait" : "pointer", fontFamily: "inherit", marginBottom: 16 }}>
            {loading ? "🔍 Scanning for treasure..." : "🔍 FIND THE TREASURE"}
          </button>}
        </section>
      )}

      {error && <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, padding: 12, marginTop: 12, color: "#fca5a5", fontSize: 13 }}>⚠️ {error}</div>}

      {results && (
        <section style={{ marginTop: 16 }}>
          <div style={{ background: "linear-gradient(135deg, rgba(212,160,23,0.1), rgba(212,160,23,0.03))", border: "1px solid rgba(212,160,23,0.3)", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#d4a017", letterSpacing: "1px", marginBottom: 8 }}>SCAN RESULTS</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#d4a017", fontFamily: "'Playfair Display', serif" }}>{results.items?.length || 0} items found</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 12 }}>
              <div><div style={{ fontSize: 20, fontWeight: 800, color: "#e5e5e5" }}>${totalValue.toLocaleString()}</div><div style={{ fontSize: 10, color: "#737373" }}>EST. TOTAL VALUE</div></div>
              <div style={{ width: 1, background: "#333" }} />
              <div><div style={{ fontSize: 20, fontWeight: 800, color: "#d4a017" }}>{treasureCount}</div><div style={{ fontSize: 10, color: "#737373" }}>TREASURES</div></div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {results.items?.map((item, i) => (
              <div key={i} style={{ background: item.tier === "treasure" ? "linear-gradient(135deg, rgba(212,160,23,0.08), rgba(212,160,23,0.02))" : "var(--surface)", border: "1px solid " + (item.tier === "treasure" ? "rgba(212,160,23,0.4)" : "var(--border)"), borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{i === 0 ? "👑" : i === 1 ? "🥈" : i === 2 ? "🥉" : "📦"}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e5e5" }}>{item.title}</span>
                    </div>
                    {item.details && <p style={{ fontSize: 11, color: "#737373", margin: "0 0 2px", lineHeight: 1.4 }}>{item.details}</p>}
                    {item.whyValuable && item.tier === "treasure" && <p style={{ fontSize: 11, color: "#d4a017", margin: "4px 0 0", lineHeight: 1.4, fontStyle: "italic" }}>💡 {item.whyValuable}</p>}
                  </div>
                  <ValueBadge tier={item.tier} />
                </div>
                <div style={{ background: "#0a0a0a", borderRadius: 8, padding: "8px 10px" }}>
                  <PriceRow label="AI Estimate" icon="🤖" geminiVal={item.estimatedValue} />
                  {item.ebayPrice && <PriceRow label="eBay used" icon="🛒" data={item.ebayPrice} />}
                  {item.discogsPrice && <PriceRow label="Discogs" icon="💿" data={item.discogsPrice} />}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 6, marginTop: 2 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: "#d4a017", letterSpacing: "0.5px" }}>💰 RECOMMENDED</span>
                    <span style={{ fontSize: 18, fontWeight: 900, color: item.tier === "treasure" ? "#d4a017" : "#e5e5e5" }}>${(item.recommended || item.estimatedValue)?.toLocaleString() ?? "?"}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: "#525252", textAlign: "center", marginTop: 16, lineHeight: 1.4 }}>Prices sourced from {selectedCat?.sources}. Actual prices vary by condition, edition and demand.</p>
          <button onClick={reset} style={{ width: "100%", background: "var(--surface)", color: "#d4a017", border: "1px solid #d4a017", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 12 }}>📷 SCAN AGAIN</button>
        </section>
      )}
    </main>
  );
}