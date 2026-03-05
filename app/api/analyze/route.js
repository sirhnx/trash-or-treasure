import { NextResponse } from "next/server";

const CATEGORY_PROMPTS = {
  books: `You are an expert rare book dealer and appraiser with deep knowledge of AbeBooks, eBay sold listings, and antiquarian book markets. Analyze this image of books and identify every title/author you can see. For each book, estimate its current market value based on: - First editions, signed copies, rare printings command premium prices - Condition matters: dust jackets, binding quality, foxing - Genre premiums: sci-fi first editions, beat literature, occult, art books, banned books - Publisher matters: certain imprints are more collectible - Look for sleeper hits that most people would overlook`,
  records: `You are an expert vinyl record dealer with encyclopedic knowledge of Discogs pricing, eBay sold listings, and record collecting. Analyze this image of vinyl records and identify every album/artist you can see. For each record, estimate its current market value based on: - Original pressings vs reissues (check label details, matrix numbers if visible) - Country of pressing matters (Japanese, UK originals often premium) - Genre premiums: jazz, psych, prog, punk, soul/funk originals, electronic - Condition grading: VG+, NM, sealed copies - Color vinyl, limited editions, promo copies - Look for records that casual sellers underprice`,
  cds: `You are an expert in CD and DVD collecting with knowledge of Discogs, eBay sold listings, and niche collector markets. Analyze this image of CDs/DVDs and identify every title you can see. For each item, estimate its current market value based on: - Out of print titles, especially Japanese editions with OBI strips - Limited editions, box sets, digipaks - Cult films, criterion collection, horror/exploitation DVDs - Promo copies, advance copies - Region-specific releases`,
  games: `You are an expert retro video game dealer with deep knowledge of PriceCharting, eBay sold listings, and game collecting. Analyze this image of video games and identify every title/console you can see. For each game, estimate its current market value based on: - Complete in box (CIB) vs loose vs sealed (sealed commands massive premium) - Console matters: NES, SNES, N64, GameCube, PS1 all have different markets - Rare titles: limited runs, recalled games, regional exclusives - Condition of box, manual, cartridge/disc - Look for hidden gems that non-collectors would skip`,
  cards: `You are an expert trading card appraiser with deep knowledge of TCGPlayer, PSA grading, eBay sold listings, and card collecting markets. Analyze this image of trading cards and identify every card you can see. For each card, estimate its current market value based on: - Card game: Pokemon, Magic: The Gathering, Yu-Gi-Oh!, sports cards - Edition: 1st edition, shadowless, base set, unlimited - Rarity: holo, reverse holo, full art, secret rare, vintage - Condition/centering (estimate grade if possible) - If sticker prices are visible, compare to actual market value to find bargains - Look for cards that are undervalued relative to their actual worth`,
  other: `You are an expert collectibles appraiser with broad knowledge across antiques, toys, memorabilia, and eBay sold listings. Analyze this image and identify every collectible item you can see. For each item, estimate its current market value based on: - Brand, manufacturer, year of production - Condition, completeness, original packaging - Rarity and demand in current market - Look for items that casual sellers commonly underprice`,
};

const JSON_INSTRUCTION = ` IMPORTANT: You must respond with ONLY valid JSON, no markdown, no code fences, no explanation. Respond in this exact JSON format: { "items": [ { "title": "Item name - Author/Artist", "details": "Brief description: edition, pressing, condition notes", "estimatedValue": 25, "tier": "treasure", "whyValuable": "Why this item is valuable (only for treasure tier)", "confidence": "high", "searchQuery": "exact search string to use on eBay/Discogs for this item" } ] } Rules for tier: treasure=$50+, good=$15-49, decent=$5-14, trash=under $5. estimatedValue: realistic USD market prices based on recent sold listings. confidence: high/medium/low. searchQuery: the best search string to find this exact item on eBay or Discogs (e.g. "Beck Mellow Gold CD" or "Foo Fighters Wasting Light vinyl"). Identify as many items as you can see. Sort by value highest first.`;

async function getEbayPrice(searchQuery, ebayAppId) {
  if (!ebayAppId || !searchQuery) return null;
  try {
    const q = encodeURIComponent(searchQuery);
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&limit=5&filter=buyingOptions:{FIXED_PRICE}`,
      { headers: { Authorization: `Bearer ${ebayAppId}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_US', 'Content-Type': 'application/json' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const items = data.itemSummaries || [];
    if (!items.length) return null;
    const prices = items
      .map(i => parseFloat(i.price?.value))
      .filter(p => !isNaN(p) && p > 0)
      .sort((a, b) => a - b);
    if (!prices.length) return null;
    const avg = prices.reduce((s, p) => s + p, 0) / prices.length;
    return { price: Math.round(avg * 100) / 100, count: prices.length, low: prices[0], high: prices[prices.length - 1], source: 'ebay' };
  } catch { return null; }
}

async function getDiscogsPrice(searchQuery, discogsToken, category) {
  if (!discogsToken || !searchQuery) return null;
  if (!['records','cds'].includes(category)) return null;
  try {
    const type = category === 'records' ? 'release' : 'release';
    const q = encodeURIComponent(searchQuery);
    const searchRes = await fetch(
      `https://api.discogs.com/database/search?q=${q}&type=${type}&per_page=5`,
      { headers: { Authorization: `Discogs token=${discogsToken}`, 'User-Agent': 'TrashOrTreasure/1.0' } }
    );
    if (!searchRes.ok) return null;
    const searchData = await searchRes.json();
    const results = searchData.results || [];
    if (!results.length) return null;
    const releaseId = results[0].id;
    const statsRes = await fetch(
      `https://api.discogs.com/marketplace/stats/${releaseId}`,
      { headers: { Authorization: `Discogs token=${discogsToken}`, 'User-Agent': 'TrashOrTreasure/1.0' } }
    );
    if (!statsRes.ok) return null;
    const stats = await statsRes.json();
    const lowest = stats.lowest_price?.value;
    const median = stats.median?.value;
    const price = median || lowest;
    if (!price) return null;
    return { price: Math.round(price * 100) / 100, count: stats.num_for_sale || 0, source: 'discogs', releaseId };
  } catch { return null; }
}

function calcRecommended(gemini, ebay, discogs) {
  const sources = [ebay, discogs].filter(Boolean);
  if (!sources.length) return gemini;
  const realPrices = sources.map(s => s.price);
  const avg = realPrices.reduce((s, p) => s + p, 0) / realPrices.length;
  return Math.round(avg * 100) / 100;
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image");
    const category = formData.get("category") || "books";
    const geminiKey = formData.get("apiKey") || process.env.GEMINI_API_KEY;
    const ebayAppId = formData.get("ebayKey") || process.env.EBAY_APP_ID;
    const discogsToken = formData.get("discogsKey") || process.env.DISCOGS_TOKEN;

    if (!imageFile) return NextResponse.json({ error: "No image provided" }, { status: 400 });
    if (!geminiKey) return NextResponse.json({ error: "NO_API_KEY" }, { status: 401 });

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const type = imageFile.type || "image/jpeg";
    const mimeType = ["image/jpeg","image/png","image/gif","image/webp"].includes(type) ? type : "image/jpeg";
    const categoryPrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.other;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: categoryPrompt + JSON_INSTRUCTION }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      throw new Error(`Gemini API error: ${geminiRes.status} ${errText.slice(0,100)}`);
    }

    const geminiData = await geminiRes.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    let cleanJson = responseText.replace(/\`\`\`json\n?/g,"").replace(/\`\`\`\n?/g,"").trim();

    let data;
    try { data = JSON.parse(cleanJson); }
    catch {
      const m = cleanJson.match(/\{[\s\S]*\}/);
      if (m) data = JSON.parse(m[0]);
      else throw new Error("Failed to parse AI response");
    }

    // Enrich with live prices
    if (data.items?.length) {
      const enriched = await Promise.all(
        data.items.map(async (item) => {
          const q = item.searchQuery || item.title;
          const [ebayPrice, discogsPrice] = await Promise.all([
            getEbayPrice(q, ebayAppId),
            getDiscogsPrice(q, discogsToken, category)
          ]);
          const recommended = calcRecommended(item.estimatedValue, ebayPrice, discogsPrice);
          // Re-tier based on recommended price
          let tier = item.tier;
          if (recommended >= 50) tier = 'treasure';
          else if (recommended >= 15) tier = 'good';
          else if (recommended >= 5) tier = 'decent';
          else tier = 'trash';
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