import { NextResponse } from "next/server";

const CATEGORY_PROMPTS = {
  books: `You are an expert rare book dealer. Analyze this image and identify every book title and author visible. For each book estimate current market value based on: first editions, signed copies, rare printings, condition, dust jackets, genre premiums (sci-fi, beat literature, occult, art books), publisher. Look for sleeper hits.`,
  records: `You are an expert vinyl record dealer. Analyze this image and identify every album and artist visible. For each record estimate current market value based on: original pressings vs reissues, country of pressing (Japanese/UK originals premium), genre (jazz, psych, prog, punk, soul, electronic), condition (VG+/NM/sealed), color vinyl, limited editions, promo copies.`,
  cds: `You are an expert CD and DVD collector. Analyze this image and identify every CD and DVD title visible. For each item estimate current market value based on: out of print titles, Japanese editions with OBI strips, limited editions, box sets, digipaks, cult films, criterion collection, horror DVDs, promo copies, region-specific releases.`,
  games: `You are an expert retro video game dealer. Analyze this image and identify every game title and console visible. For each game estimate current market value based on: complete in box vs loose vs sealed, console (NES/SNES/N64/GameCube/PS1), rare titles, limited runs, recalled games, condition of box and manual.`,
  cards: `You are an expert trading card appraiser. Analyze this image and identify every card visible. For each card estimate current market value based on: card game (Pokemon/MTG/Yu-Gi-Oh/sports), edition (1st edition/shadowless/base set), rarity (holo/full art/secret rare), condition, centering. If sticker prices visible compare to market to find bargains.`,
  other: `You are an expert collectibles appraiser. Analyze this image and identify every collectible item visible. For each item estimate current market value based on: brand, manufacturer, year, condition, completeness, original packaging, rarity and current demand.`,
};

const JSON_INSTRUCTION = ` Respond with ONLY valid JSON in this exact format, no markdown, no code fences, no extra text before or after:
{"items":[{"title":"Item Name","details":"edition/pressing/condition notes","estimatedValue":25,"tier":"good","whyValuable":"reason if treasure tier","confidence":"high","searchQuery":"search string for eBay"}]}
Tier rules: treasure=50+, good=15-49, decent=5-14, trash=under 5. Sort by value descending. Use double quotes only. No trailing commas.`;

async function getEbayToken(appId, certId) {
  if (!appId || !certId) return null;
  try {
    const credentials = Buffer.from(`${appId}:${certId}`).toString('base64');
    const res = await fetch('https://api.ebay.com/identity/v1/oauth2/token', {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope'
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.access_token || null;
  } catch { return null; }
}

async function getEbayPrice(searchQuery, appId, certId) {
  if (!appId || !certId || !searchQuery) return null;
  try {
    const accessToken = await getEbayToken(appId, certId);
    if (!accessToken) return null;
    const q = encodeURIComponent(searchQuery);
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&limit=5&filter=buyingOptions:{FIXED_PRICE}`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.itemSummaries || [];
    if (!items.length) return null;
    const prices = items.map(i => parseFloat(i.price?.value)).filter(p => !isNaN(p) && p > 0).sort((a,b) => a-b);
    if (!prices.length) return null;
    const avg = prices.reduce((s,p) => s+p, 0) / prices.length;
    return { price: Math.round(avg*100)/100, count: prices.length, low: prices[0], high: prices[prices.length-1], source: 'ebay' };
  } catch { return null; }
}

async function getDiscogsPrice(searchQuery, discogsToken, category) {
  if (!discogsToken || !searchQuery || !['records','cds'].includes(category)) return null;
  try {
    const q = encodeURIComponent(searchQuery);
    const searchRes = await fetch(
      `https://api.discogs.com/database/search?q=${q}&type=release&per_page=5`,
      { headers: { Authorization: `Discogs token=${discogsToken}`, 'User-Agent': 'TrashOrTreasure/1.0' } }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData.results || [];
    if (!results.length) return null;
    const statsRes = await fetch(
      `https://api.discogs.com/marketplace/stats/${results[0].id}`,
      { headers: { Authorization: `Discogs token=${discogsToken}`, 'User-Agent': 'TrashOrTreasure/1.0' } }
    );
    if (!statsRes.ok) return null;
    const stats = await statsRes.json();
    const price = stats.median?.value || stats.lowest_price?.value;
    if (!price) return null;
    return { price: Math.round(price*100)/100, count: stats.num_for_sale || 0, source: 'discogs' };
  } catch { return null; }
}

function calcRecommended(gemini, ebay, discogs) {
  const sources = [ebay, discogs].filter(Boolean);
  if (!sources.length) return gemini;
  const avg = sources.reduce((s,x) => s+x.price, 0) / sources.length;
  return Math.round(avg*100)/100;
}

function safeParseJSON(text) {
  // Strip markdown fences
  let s = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  // Try direct parse first
  try { return JSON.parse(s); } catch {}
  // Extract first {...} block
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start !== -1 && end !== -1) {
    try { return JSON.parse(s.slice(start, end + 1)); } catch {}
  }
  // Fix common issues: trailing commas before ] or }
  const fixed = s
    .replace(/,\s*]/g, ']')
    .replace(/,\s*}/g, '}')
    .replace(/[\x00-\x1F\x7F]/g, ' '); // strip control chars
  try { return JSON.parse(fixed); } catch {}
  // Last resort: extract just the items array
  const itemsMatch = fixed.match(/"items"\s*:\s*(\[.*\])/s);
  if (itemsMatch) {
    try { return { items: JSON.parse(itemsMatch[1]) }; } catch {}
  }
  throw new Error('Failed to parse AI response as JSON');
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image");
    const category = formData.get("category") || "books";
    const geminiKey = formData.get("apiKey") || process.env.GEMINI_API_KEY;
    const ebayAppId = formData.get("ebayKey") || process.env.EBAY_APP_ID;
    const ebayCertId = formData.get("ebayCertKey") || process.env.EBAY_CERT_ID;
    const discogsToken = formData.get("discogsKey") || process.env.DISCOGS_TOKEN;

    if (!imageFile) return NextResponse.json({ error: "No image provided" }, { status: 400 });
    if (!geminiKey) return NextResponse.json({ error: "NO_API_KEY" }, { status: 401 });

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const type = imageFile.type || "image/jpeg";
    const mimeType = ["image/jpeg","image/png","image/gif","image/webp"].includes(type) ? type : "image/jpeg";

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: (CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.other) + JSON_INSTRUCTION }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!geminiRes.ok) { const t = await geminiRes.text(); throw new Error(`Gemini error ${geminiRes.status}: ${t.slice(0,100)}`); }

    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const data = safeParseJSON(rawText);

    if (data.items?.length) {
      const enriched = await Promise.all(
        data.items.map(async (item) => {
          const q = item.searchQuery || item.title;
          const [ebayPrice, discogsPrice] = await Promise.all([
            getEbayPrice(q, ebayAppId, ebayCertId),
            getDiscogsPrice(q, discogsToken, category)
          ]);
          const recommended = calcRecommended(item.estimatedValue, ebayPrice, discogsPrice);
          const tier = recommended >= 50 ? 'treasure' : recommended >= 15 ? 'good' : recommended >= 5 ? 'decent' : 'trash';
          return { ...item, ebayPrice, discogsPrice, recommended, tier };
        })
      );
      data.items = enriched.sort((a,b) => (b.recommended||0) - (a.recommended||0));
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json({ error: error.message || "Analysis failed." }, { status: 500 });
  }
}