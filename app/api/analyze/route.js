import { NextResponse } from "next/server";

const CATEGORY_PROMPTS = {
  books_paperback: `You are an expert used book dealer. Analyze this image and identify every book title and author visible. Estimate current USED PAPERBACK market value. Focus on realistic secondhand prices ($2-15 typical), out of print paperbacks, cult classics, first paperback editions.`,
  books_hardcover: `You are an expert rare and used hardcover book dealer. Analyze this image and identify every book title and author visible. Estimate current USED HARDCOVER market value based on: first edition hardcovers, signed copies, dust jacket condition, rare or out of print hardcovers.`,
  records: `You are an expert vinyl record dealer. Analyze this image and identify album titles and artists. Estimate current market value based on: original pressings vs reissues, country of pressing (Japanese/UK originals premium), genre (jazz, psych, prog, punk, soul, electronic), condition, color vinyl, limited editions.`,
  cds: `You are an expert CD and DVD collector. Analyze this image and identify CD and DVD titles. Estimate current market value based on: out of print titles, Japanese editions with OBI strips, limited editions, box sets, digipaks, cult films, criterion collection, horror DVDs, promo copies.`,
  games: `You are an expert retro video game dealer. Analyze this image and identify game titles and consoles. Estimate current market value based on: complete in box vs loose vs sealed, console (NES/SNES/N64/GameCube/PS1), rare titles, limited runs, condition of box and manual.`,
  cards: `You are an expert trading card appraiser with deep knowledge of Pokemon, MTG, Yu-Gi-Oh, sports cards and all TCG games. Analyze this image carefully.

For EACH card or graded slab visible:
- Identify: card name, set, card number, game (pokemon/mtg/yugioh/sports/other)
- If it is a PSA/BGS/CGC GRADED SLAB: read the cert number (usually 8-9 digits on the label), grade (e.g. PSA 9, BGS 9.5), and card details from the label
- If a STICKER PRICE or price tag is visible on the item, record it as stickerPrice
- Estimate current raw market value AND graded value if applicable
- Note rarity, edition (1st edition, shadowless, holo, full art, secret rare)

Return certNumber and stickerPrice as null if not visible.`,
  other: `You are an expert collectibles appraiser. Analyze this image and identify every collectible item. Estimate current market value based on: brand, manufacturer, year, condition, completeness, original packaging, rarity.`,
};

const JSON_INSTRUCTION = ` IMPORTANT RULES:
- Only include items you can confidently identify. If you cannot read a title clearly, skip it.
- Return a maximum of 20 items, prioritising highest value.
- Respond with ONLY valid JSON. No markdown. No code fences. Start with { end with }.
- For cards use this structure: {"items":[{"title":"Card Name - Set","details":"e.g. 1st Edition Holo, PSA 9","estimatedValue":0,"tier":"decent","whyValuable":"","confidence":"high","searchQuery":"card name set number game","game":"pokemon","certNumber":null,"stickerPrice":null}]}
- For non-cards: {"items":[{"title":"string","details":"string","estimatedValue":0,"tier":"decent","whyValuable":"","confidence":"high","searchQuery":"string"}]}
- tier: treasure=50+, good=15-49, decent=5-14, trash=under 5. Sort by estimatedValue descending.`;

// --- PSA Cert Lookup ---
async function getPSACert(certNumber, psaKey) {
  if (!psaKey || !certNumber) return null;
  const clean = String(certNumber).replace(/\D/g, '');
  if (clean.length < 5) return null;
  try {
    const res = await fetch(
      `https://api.psacard.com/publicapi/cert/GetByCertNumber/${clean}`,
      { headers: { Authorization: `bearer ${psaKey}` } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.PSACert) return null;
    const c = data.PSACert;
    return {
      certNumber: c.CertNumber,
      grade: c.CardGrade,
      gradeDescription: c.GradeDescription,
      subject: c.Subject,
      year: c.Year,
      brand: c.Brand,
      cardNumber: c.CardNumber,
      variety: c.Variety,
      authenticated: true,
    };
  } catch { return null; }
}

// --- TCGCSV Price Lookup ---
// Category IDs: Pokemon=3, MTG=1, YuGiOh=2, MLB=4, NBA=18, NFL=17, NHL=19
const GAME_CATEGORY_IDS = {
  pokemon: 3, mtg: 1, magic: 1, yugioh: 2, 'yu-gi-oh': 2,
  mlb: 4, baseball: 4, nba: 18, basketball: 18, nfl: 17, football: 17, nhl: 19, hockey: 19,
};

async function getTCGCSVPrice(cardName, game, setName) {
  if (!cardName) return null;
  try {
    const categoryId = GAME_CATEGORY_IDS[game?.toLowerCase()] || 3;
    // Search products for this category
    const searchName = encodeURIComponent(cardName.split('-')[0].trim());
    const res = await fetch(
      `https://tcgcsv.com/tcgplayer/${categoryId}/products.json`,
      { headers: { 'User-Agent': 'TrashOrTreasure/1.0' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const products = data.results || [];
    // Find best matching product
    const nameLower = cardName.toLowerCase();
    const matches = products.filter(p => {
      const pName = (p.name || '').toLowerCase();
      return pName.includes(nameLower.split(' ')[0]) && pName.includes(nameLower.split(' ')[1] || nameLower.split(' ')[0]);
    });
    if (!matches.length) return null;
    // Get price for best match
    const product = matches[0];
    const groupId = product.groupId;
    const productId = product.productId;
    const priceRes = await fetch(
      `https://tcgcsv.com/tcgplayer/${categoryId}/${groupId}/prices.json`,
      { headers: { 'User-Agent': 'TrashOrTreasure/1.0' } }
    );
    if (!priceRes.ok) return null;
    const priceData = await priceRes.json();
    const prices = (priceData.results || []).filter(p => p.productId === productId);
    if (!prices.length) return null;
    const normal = prices.find(p => p.subTypeName === 'Normal') || prices[0];
    return {
      market: normal.marketPrice,
      low: normal.lowPrice,
      mid: normal.midPrice,
      high: normal.highPrice,
      source: 'tcgplayer',
      productName: product.name,
    };
  } catch { return null; }
}

// --- eBay OAuth + Price ---
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

async function getEbayPrice(searchQuery, appId, certId, bookFormat) {
  if (!appId || !certId || !searchQuery) return null;
  try {
    const accessToken = await getEbayToken(appId, certId);
    if (!accessToken) return null;
    const formatSuffix = bookFormat === 'hardcover' ? ' hardcover used' : bookFormat === 'paperback' ? ' paperback used' : '';
    const q = encodeURIComponent(searchQuery + formatSuffix);
    const condFilter = bookFormat ? ',conditions:{USED}' : '';
    const res = await fetch(
      `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${q}&limit=10&filter=buyingOptions:{FIXED_PRICE},itemLocationCountry:AU${condFilter}`,
      { headers: { Authorization: `Bearer ${accessToken}`, 'X-EBAY-C-MARKETPLACE-ID': 'EBAY_AU', 'X-EBAY-C-ENDUSERCTX': 'contextualLocation=country%3DAU' } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const prices = (data.itemSummaries || []).map(i => parseFloat(i.price?.value)).filter(p => !isNaN(p) && p > 0).sort((a,b) => a-b);
    const cheapest = prices.slice(0, 5);
    if (!cheapest.length) return null;
    return { price: Math.round(cheapest.reduce((s,p) => s+p,0) / cheapest.length * 100) / 100, low: cheapest[0], count: cheapest.length, source: 'ebay_au' };
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
    if (!searchData.results?.length) return null;
    const statsRes = await fetch(
      `https://api.discogs.com/marketplace/stats/${searchData.results[0].id}`,
      { headers: { Authorization: `Discogs token=${discogsToken}`, 'User-Agent': 'TrashOrTreasure/1.0' } }
    );
    if (!statsRes.ok) return null;
    const stats = await statsRes.json();
    const price = stats.median?.value || stats.lowest_price?.value;
    if (!price) return null;
    return { price: Math.round(price*100)/100, count: stats.num_for_sale || 0, source: 'discogs' };
  } catch { return null; }
}

function calcRecommended(gemini, ebay, discogs, tcg) {
  const sources = [ebay, discogs, tcg ? { price: tcg.market } : null].filter(Boolean);
  if (!sources.length) return gemini;
  return Math.round(sources.reduce((s,x) => s+x.price, 0) / sources.length * 100) / 100;
}


function buildEbayUrl(searchQuery, condition) {
  const q = encodeURIComponent(searchQuery);
  // LH_Sold=1&LH_Complete=1 shows sold/completed listings - real prices
  const soldParams = 'LH_Sold=1&LH_Complete=1';
  const condParam = condition === 'used' ? '&LH_ItemCondition=3000' : '';
  return `https://www.ebay.com.au/sch/i.html?_nkw=${q}&${soldParams}${condParam}`;
}

function buildDiscogsUrl(searchQuery) {
  const q = encodeURIComponent(searchQuery);
  return `https://www.discogs.com/search/?q=${q}&type=release&sort=price&ev=qs`;
}

function buildTCGPlayerUrl(searchQuery, game) {
  const q = encodeURIComponent(searchQuery);
  return `https://www.tcgplayer.com/search/all/product?q=${q}&view=grid`;
}

function safeParseJSON(text) {
  let s = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  try { return JSON.parse(s); } catch {}
  const start = s.indexOf('{'); const end = s.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('No JSON found in response');
  const block = s.slice(start, end + 1);
  const fixed = block.replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  try { return JSON.parse(fixed); } catch {}
  try {
    const arrStart = fixed.indexOf('[', fixed.indexOf('"items"'));
    if (arrStart === -1) throw new Error('no array');
    const items = [];
    let depth = 0, itemStart = -1;
    for (let i = arrStart; i < fixed.length; i++) {
      if (fixed[i] === '{') { if (depth === 0) itemStart = i; depth++; }
      else if (fixed[i] === '}') {
        depth--;
        if (depth === 0 && itemStart !== -1) {
          try { items.push(JSON.parse(fixed.slice(itemStart, i + 1))); } catch {}
          itemStart = -1;
        }
      }
    }
    if (items.length > 0) return { items };
  } catch {}
  throw new Error('Could not parse response');
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image");
    const category = formData.get("category") || "books";
    const bookFormat = formData.get("bookFormat") || "paperback";
    const geminiKey = formData.get("apiKey") || process.env.GEMINI_API_KEY;
    const ebayAppId = formData.get("ebayKey") || process.env.EBAY_APP_ID;
    const ebayCertId = formData.get("ebayCertKey") || process.env.EBAY_CERT_ID;
    const discogsToken = formData.get("discogsKey") || process.env.DISCOGS_TOKEN;
    const psaKey = formData.get("psaKey") || process.env.PSA_KEY;

    if (!imageFile) return NextResponse.json({ error: "No image provided" }, { status: 400 });
    if (!geminiKey) return NextResponse.json({ error: "NO_API_KEY" }, { status: 401 });

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const type = imageFile.type || "image/jpeg";
    const mimeType = ["image/jpeg","image/png","image/gif","image/webp"].includes(type) ? type : "image/jpeg";

    const promptKey = category === 'books' ? `books_${bookFormat}` : category;
    const prompt = CATEGORY_PROMPTS[promptKey] || CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.other;

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: mimeType, data: base64 } },
            { text: prompt + JSON_INSTRUCTION }
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: "application/json" },
        }),
      }
    );

    if (!geminiRes.ok) { const t = await geminiRes.text(); throw new Error(`Gemini error ${geminiRes.status}: ${t.slice(0,500)}`); }
    const geminiData = await geminiRes.json();
    const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const data = safeParseJSON(rawText);

    if (data.items?.length) {
      const enriched = await Promise.all(
        data.items.map(async (item) => {
          const q = item.searchQuery || item.title;
          const isCard = category === 'cards';

          // Run all lookups in parallel
          const [ebayPrice, discogsPrice, psaCert, tcgPrice] = await Promise.all([
            getEbayPrice(q, ebayAppId, ebayCertId, category === 'books' ? bookFormat : null),
            getDiscogsPrice(q, discogsToken, category),
            isCard && item.certNumber ? getPSACert(item.certNumber, psaKey) : Promise.resolve(null),
            isCard ? getTCGCSVPrice(item.title, item.game, item.details) : Promise.resolve(null),
          ]);

          const recommended = calcRecommended(item.estimatedValue, ebayPrice, discogsPrice, tcgPrice);
          const tier = recommended >= 50 ? 'treasure' : recommended >= 15 ? 'good' : recommended >= 5 ? 'decent' : 'trash';

          // Bargain detection: if sticker price visible and market is higher
          let bargain = null;
          if (item.stickerPrice && recommended) {
            const sticker = parseFloat(String(item.stickerPrice).replace(/[^0-9.]/g,''));
            if (!isNaN(sticker) && sticker > 0) {
              const ratio = recommended / sticker;
              if (ratio >= 1.5) bargain = { sticker, market: recommended, ratio: Math.round(ratio * 10) / 10 };
            }
          }

          const ebayUrl = buildEbayUrl(q, category === 'books' ? 'used' : null);
          const discogsUrl = ['records','cds'].includes(category) ? buildDiscogsUrl(q) : null;
          const tcgUrl = category === 'cards' ? buildTCGPlayerUrl(q, item.game) : null;
          return { ...item, ebayPrice, discogsPrice, psaCert, tcgPrice, recommended, tier, bargain, ebayUrl, discogsUrl, tcgUrl };
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