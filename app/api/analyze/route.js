import { NextResponse } from "next/server";

const CATEGORY_PROMPTS = {
  books: `You are an expert rare book dealer and appraiser with deep knowledge of AbeBooks, eBay sold listings, and antiquarian book markets. Analyze this image of books and identify every title/author you can see. For each book, estimate its current market value based on: - First editions, signed copies, rare printings command premium prices - Condition matters: dust jackets, binding quality, foxing - Genre premiums: sci-fi first editions, beat literature, occult, art books, banned books - Publisher matters: certain imprints are more collectible - Look for sleeper hits that most people would overlook`,
  records: `You are an expert vinyl record dealer with encyclopedic knowledge of Discogs pricing, eBay sold listings, and record collecting. Analyze this image of vinyl records and identify every album/artist you can see. For each record, estimate its current market value based on: - Original pressings vs reissues (check label details, matrix numbers if visible) - Country of pressing matters (Japanese, UK originals often premium) - Genre premiums: jazz, psych, prog, punk, soul/funk originals, electronic - Condition grading: VG+, NM, sealed copies - Color vinyl, limited editions, promo copies - Look for records that casual sellers underprice`,
  cds: `You are an expert in CD and DVD collecting with knowledge of Discogs, eBay sold listings, and niche collector markets. Analyze this image of CDs/DVDs and identify every title you can see. For each item, estimate its current market value based on: - Out of print titles, especially Japanese editions with OBI strips - Limited editions, box sets, digipaks - Cult films, criterion collection, horror/exploitation DVDs - Promo copies, advance copies - Region-specific releases`,
  games: `You are an expert retro video game dealer with deep knowledge of PriceCharting, eBay sold listings, and game collecting. Analyze this image of video games and identify every title/console you can see. For each game, estimate its current market value based on: - Complete in box (CIB) vs loose vs sealed (sealed commands massive premium) - Console matters: NES, SNES, N64, GameCube, PS1 all have different markets - Rare titles: limited runs, recalled games, regional exclusives - Condition of box, manual, cartridge/disc - Look for hidden gems that non-collectors would skip`,
  cards: `You are an expert trading card appraiser with deep knowledge of TCGPlayer, PSA grading, eBay sold listings, and card collecting markets. Analyze this image of trading cards and identify every card you can see. For each card, estimate its current market value based on: - Card game: Pokemon, Magic: The Gathering, Yu-Gi-Oh!, sports cards - Edition: 1st edition, shadowless, base set, unlimited - Rarity: holo, reverse holo, full art, secret rare, vintage - Condition/centering (estimate grade if possible) - If sticker prices are visible, compare to actual market value to find bargains - Look for cards that are undervalued relative to their actual worth`,
  other: `You are an expert collectibles appraiser with broad knowledge across antiques, toys, memorabilia, and eBay sold listings. Analyze this image and identify every collectible item you can see. For each item, estimate its current market value based on: - Brand, manufacturer, year of production - Condition, completeness, original packaging - Rarity and demand in current market - Look for items that casual sellers commonly underprice`,
};

const JSON_INSTRUCTION = ` IMPORTANT: You must respond with ONLY valid JSON, no markdown, no code fences, no explanation. Respond in this exact JSON format: { "items": [ { "title": "Item name - Author/Artist", "details": "Brief description: edition, pressing, condition notes", "estimatedValue": 25, "tier": "treasure", "whyValuable": "Why this item is valuable (only for treasure tier)", "confidence": "high" } ] } Rules for the "tier" field: - "treasure" = worth $50+ (the gems, the finds, the money items) - "good" = worth $15-49 (solid finds, worth picking up) - "decent" = worth $5-14 (modest value, could flip for small profit) - "trash" = worth under $5 (common, not worth the effort) Rules for "estimatedValue": - Use realistic current market prices in USD - Base on recent sold listings, not asking prices - Factor in typical condition for the context - Be conservative rather than optimistic Rules for "confidence": - "high" = clearly identified, well-known pricing - "medium" = partially visible or pricing varies significantly - "low" = hard to read or very niche item Identify as many items as you can see. Sort by value, highest first. If you cannot identify any items, return: {"items": [], "note": "Could not identify items. Try a clearer photo."}`;

export async function POST(request) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get("image");
    const category = formData.get("category") || "books";
    const apiKey = formData.get("apiKey");

    if (!imageFile) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const geminiKey = apiKey || process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      return NextResponse.json(
        { error: "NO_API_KEY" },
        { status: 401 }
      );
    }

    const bytes = await imageFile.arrayBuffer();
    const base64 = Buffer.from(bytes).toString("base64");
    const type = imageFile.type || "image/jpeg";
    const mimeType = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(type) ? type : "image/jpeg";

    const categoryPrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.other;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: base64 } }, { text: categoryPrompt + JSON_INSTRUCTION }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      if (response.status === 400 && errText.includes("API_KEY")) {
        return NextResponse.json({ error: "INVALID_API_KEY" }, { status: 401 });
      }
      throw new Error(`Gemini API error: ${response.status}`);
    }

    const geminiData = await response.json();
    const responseText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    let cleanJson = responseText.replace(/\`\`\`json\n?/g, "").replace(/\`\`\`\n?/g, "").trim();

    let data;
    try {
      data = JSON.parse(cleanJson);
    } catch {
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        data = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("Failed to parse AI response");
      }
    }

    return NextResponse.json(data);
  } catch (error) {
    console.error("Analysis error:", error);
    return NextResponse.json(
      { error: error.message || "Analysis failed. Please try again." },
      { status: 500 }
    );
  }
}