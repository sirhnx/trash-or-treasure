"use client";
import { useState, useRef, useCallback } from "react";

const CATEGORIES = [
  { id: "books", label: "Books", icon: "\u{1F4DA}", sources: "AbeBooks, eBay" },
  { id: "records", label: "Vinyl Records", icon: "\u{1F3B6}", sources: "Discogs, eBay" },
  { id: "cds", label: "CDs / DVDs", icon: "\u{1F4BF}", sources: "Discogs, eBay" },
  { id: "games", label: "Video Games", icon: "\u{1F3AE}", sources: "PriceCharting, eBay" },
  { id: "cards", label: "Trading Cards", icon: "\u{1F0CF}", sources: "TCGPlayer, eBay" },
  { id: "other", label: "Other Collectibles", icon: "\u2728", sources: "eBay" },
];

function TreasureIcon({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2L15 8.5L22 9.5L17 14.5L18 21.5L12 18L6 21.5L7 14.5L2 9.5L9 8.5L12 2Z" fill="rgba(212,160,23,0.2)" stroke="#d4a017"/>
    </svg>
  );
}

function ValueBadge({ tier }) {
  const styles = {
    treasure: { bg: "linear-gradient(135deg, #d4a017, #f5d442)", color: "#000", label: "\u{1F451} TREASURE" },
    good: { bg: "linear-gradient(135deg, #2563eb, #60a5fa)", color: "#fff", label: "\u{1F4A0} GOOD FIND" },
    decent: { bg: "linear-gradient(135deg, #059669, #34d399)", color: "#fff", label: "\u2705 DECENT" },
    trash: { bg: "linear-gradient(135deg, #525252, #737373)", color: "#fff", label: "\u{1F5D1}\uFE0F SKIP" },
  };
  const s = styles[tier] || styles.trash;
  return (
    <span style={{ background: s.bg, color: s.color, padding: "2px 8px", borderRadius: "4px", fontSize: "11px", fontWeight: 700, letterSpacing: "0.5px", whiteSpace: "nowrap" }}>
      {s.label}
    </span>
  );
}

export default function Home() {
  const [image, setImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [category, setCategory] = useState("books");
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [scanCount, setScanCount] = useState(0);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleImage = useCallback((file) => {
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setError("Image too large. Please use an image under 20MB.");
      return;
    }
    setImage(file);
    setResults(null);
    setError(null);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result);
    reader.readAsDataURL(file);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file && file.type.startsWith("image/")) handleImage(file);
  }, [handleImage]);

  const analyze = async () => {
    if (!image) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const formData = new FormData();
      formData.append("image", image);
      formData.append("category", category);
      const res = await fetch("/api/analyze", { method: "POST", body: formData });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || "Analysis failed (" + res.status + ")");
      }
      const data = await res.json();
      setResults(data);
      setScanCount((c) => c + 1);
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const reset = () => { setImage(null); setImagePreview(null); setResults(null); setError(null); };
  const totalValue = results?.items?.reduce((sum, i) => sum + (i.estimatedValue || 0), 0) || 0;
  const treasureCount = results?.items?.filter((i) => i.tier === "treasure").length || 0;
  const selectedCat = CATEGORIES.find((c) => c.id === category);

  return (
    <main style={{ minHeight: "100vh", maxWidth: 480, margin: "0 auto", padding: "16px 16px 100px" }}>
      <header style={{ textAlign: "center", padding: "24px 0 16px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 4 }}>
          <TreasureIcon size={28} />
          <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 28, fontWeight: 900, color: "#d4a017", margin: 0 }}>
            TRASH <span style={{ color: "#525252", fontSize: 18, fontWeight: 400 }}>or</span> TREASURE
          </h1>
          <TreasureIcon size={28} />
        </div>
        <p style={{ color: "#737373", fontSize: 12, margin: 0, letterSpacing: "1px" }}>AI-POWERED COLLECTIBLE SCANNER</p>
        {scanCount > 0 && <p style={{ color: "#525252", fontSize: 11, margin: "4px 0 0" }}>{scanCount} scan{scanCount !== 1 ? "s" : ""} this session</p>}
      </header>

      <section style={{ marginBottom: 16 }}>
        <label style={{ display: "block", fontSize: 11, color: "#737373", marginBottom: 6, letterSpacing: "0.5px" }}>CATEGORY</label>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
          {CATEGORIES.map((cat) => (
            <button key={cat.id} onClick={() => setCategory(cat.id)} style={{ background: category === cat.id ? "rgba(212,160,23,0.15)" : "var(--surface)", border: "1px solid " + (category === cat.id ? "#d4a017" : "var(--border)"), borderRadius: 8, padding: "10px 4px", cursor: "pointer", textAlign: "center", transition: "all 0.2s" }}>
              <div style={{ fontSize: 20 }}>{cat.icon}</div>
              <div style={{ fontSize: 10, color: category === cat.id ? "#d4a017" : "#a3a3a3", marginTop: 2, fontWeight: category === cat.id ? 700 : 400 }}>{cat.label}</div>
            </button>
          ))}
        </div>
      </section>

      {!imagePreview ? (
        <section onDrop={handleDrop} onDragOver={(e) => e.preventDefault()} style={{ border: "2px dashed #333", borderRadius: 12, padding: "40px 20px", textAlign: "center", background: "var(--surface)", cursor: "pointer" }} onClick={() => fileInputRef.current?.click()}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>\u{1F4F7}</div>
          <p style={{ color: "#a3a3a3", fontSize: 14, margin: "0 0 16px" }}>Snap a photo of your collection</p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={(e) => { e.stopPropagation(); cameraInputRef.current?.click(); }} style={{ background: "linear-gradient(135deg, #d4a017, #b8860b)", color: "#000", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>\u{1F4F8} Take Photo</button>
            <button onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }} style={{ background: "var(--border)", color: "#e5e5e5", border: "none", borderRadius: 8, padding: "10px 20px", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>\u{1F4C1} Upload</button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleImage(e.target.files?.[0])} style={{ display: "none" }} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" onChange={(e) => handleImage(e.target.files?.[0])} style={{ display: "none" }} />
        </section>
      ) : (
        <section>
          <div style={{ position: "relative", borderRadius: 12, overflow: "hidden", marginBottom: 12, border: "1px solid var(--border)" }}>
            <img src={imagePreview} alt="Preview" style={{ width: "100%", display: "block", maxHeight: 300, objectFit: "cover" }} />
            <button onClick={reset} style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.7)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center" }}>\u2715</button>
          </div>
          {!results && (
            <button onClick={analyze} disabled={loading} className={loading ? "" : "treasure-glow"} style={{ width: "100%", background: loading ? "#333" : "linear-gradient(135deg, #d4a017, #b8860b)", color: loading ? "#737373" : "#000", border: "none", borderRadius: 12, padding: "16px", fontSize: 16, fontWeight: 800, cursor: loading ? "wait" : "pointer", fontFamily: "inherit", letterSpacing: "0.5px", marginBottom: 16 }}>
              {loading ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}><span className="animate-spin" style={{ display: "inline-block", width: 16, height: 16, border: "2px solid #525252", borderTopColor: "#d4a017", borderRadius: "50%" }} />Scanning for treasure...</span> : "\u{1F50D} FIND THE TREASURE"}
            </button>
          )}
        </section>
      )}

      {error && <div style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.3)", borderRadius: 8, padding: 12, marginTop: 12, color: "#fca5a5", fontSize: 13 }}>\u26A0\uFE0F {error}</div>}

      {results && (
        <section className="animate-fade-in" style={{ marginTop: 16 }}>
          <div style={{ background: "linear-gradient(135deg, rgba(212,160,23,0.1), rgba(212,160,23,0.03))", border: "1px solid rgba(212,160,23,0.3)", borderRadius: 12, padding: 16, marginBottom: 16, textAlign: "center" }}>
            <div style={{ fontSize: 11, color: "#d4a017", letterSpacing: "1px", marginBottom: 8 }}>SCAN RESULTS</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: "#d4a017", fontFamily: "'Playfair Display', serif" }}>{results.items?.length || 0} items found</div>
            <div style={{ display: "flex", justifyContent: "center", gap: 24, marginTop: 12 }}>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#e5e5e5" }}>${totalValue.toLocaleString()}</div>
                <div style={{ fontSize: 10, color: "#737373" }}>EST. TOTAL VALUE</div>
              </div>
              <div style={{ width: 1, background: "#333" }} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#d4a017" }}>{treasureCount}</div>
                <div style={{ fontSize: 10, color: "#737373" }}>TREASURES</div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {results.items?.sort((a, b) => (b.estimatedValue || 0) - (a.estimatedValue || 0)).map((item, i) => (
              <div key={i} className="animate-fade-in" style={{ background: item.tier === "treasure" ? "linear-gradient(135deg, rgba(212,160,23,0.08), rgba(212,160,23,0.02))" : "var(--surface)", border: "1px solid " + (item.tier === "treasure" ? "rgba(212,160,23,0.4)" : "var(--border)"), borderRadius: 10, padding: 12, animationDelay: i * 0.1 + "s", opacity: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 14 }}>{i === 0 ? "\u{1F451}" : i === 1 ? "\u{1F948}" : i === 2 ? "\u{1F949}" : "\u{1F4E6}"}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: "#e5e5e5" }}>{item.title}</span>
                    </div>
                    {item.details && <p style={{ fontSize: 11, color: "#737373", margin: "2px 0 0", lineHeight: 1.4 }}>{item.details}</p>}
                    {item.whyValuable && item.tier === "treasure" && <p style={{ fontSize: 11, color: "#d4a017", margin: "4px 0 0", lineHeight: 1.4, fontStyle: "italic" }}>\u{1F4A1} {item.whyValuable}</p>}
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: item.tier === "treasure" ? "#d4a017" : "#e5e5e5" }}>${item.estimatedValue?.toLocaleString() || "?"}</div>
                    <ValueBadge tier={item.tier} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 10, color: "#525252", textAlign: "center", marginTop: 16, lineHeight: 1.4 }}>Estimates based on recent {selectedCat?.sources} sales. Actual prices vary by condition, edition, and market demand.</p>
          <button onClick={reset} style={{ width: "100%", background: "var(--surface)", color: "#d4a017", border: "1px solid #d4a017", borderRadius: 12, padding: "14px", fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", marginTop: 12 }}>\u{1F4F7} SCAN AGAIN</button>
        </section>
      )}
    </main>
  );
}
