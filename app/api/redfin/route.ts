import * as cheerio from "cheerio";

export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  if (!target) return new Response(JSON.stringify({ error: "Missing url" }), { status: 400, headers: { "content-type": "application/json" } });

  try {
    const htmlRes = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 (house-dashboard)" } });
    const html = await htmlRes.text();
    const $ = cheerio.load(html);

    const out: any = { address: null, facing: null, livingAreaSqft: null, lotSizeSqft: null, schools: [] };

    // 1) Try JSON-LD blocks
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const text = $(el).contents().text();
        const json: any = JSON.parse(text);
        const arr = Array.isArray(json) ? json : [json];
        for (const obj of arr) {
          if (obj['@type'] === 'SingleFamilyResidence' || obj['@type'] === 'Residence' || obj['@type'] === 'House') {
            if (obj.address && !out.address) {
              const a = obj.address;
              out.address = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ');
            }
            if (obj.floorSize?.value) out.livingAreaSqft = obj.floorSize.value;
            if (obj.lotSize?.value) out.lotSizeSqft = obj.lotSize.value;
          }
        }
      } catch {}
    });

    // 2) Heuristic text scraping
    const text = $('body').text();
    const lotMatch = text.match(/Lot\s*Size[^\d]*(\d{3,5})\s*(?:sq\.?\s*ft|square\s*feet)/i);
    if (lotMatch && !out.lotSizeSqft) out.lotSizeSqft = Number(lotMatch[1]);
    const areaMatch = text.match(/Living\s*Area[^\d]*(\d{3,5})\s*(?:sq\.?\s*ft|square\s*feet)/i) || text.match(/Square\s*Feet[^\d]*(\d{3,5})/i);
    if (areaMatch && !out.livingAreaSqft) out.livingAreaSqft = Number(areaMatch[1]);
    const faceMatch = text.match(/(?:Faces|Facing|Direction\s*Faces?)\s*[:\-]?\s*(North(?:east)?|South(?:east)?|East|West|South(?:west)?|North(?:west)?)/i);
    if (faceMatch && !out.facing) {
      const dir = faceMatch[1].toLowerCase();
      const map: any = { north: 'N', northeast: 'NE', east: 'E', southeast: 'SE', south: 'S', southwest: 'SW', west: 'W', northwest: 'NW' };
      out.facing = map[dir] || 'Unknown';
    }

    // 3) GreatSchools ratings (best-effort)
    const schoolBlocks: { name: string; rating?: number; level?: string }[] = [];
    const schoolRegex = /(Elementary|Middle|High)\s*School\s*[:\-\s]*([^\n]+?)\s*(?:GreatSchools\s*Rating\s*(\d{1,2})\s*\/\s*10)?/gi;
    let m;
    while ((m = schoolRegex.exec(text)) !== null) {
      const level = m[1];
      const name = m[2].trim().replace(/\s{2,}/g, ' ');
      const rating = m[3] ? Number(m[3]) : undefined;
      if (name) schoolBlocks.push({ name, rating, level });
    }
    const seen = new Set();
    out.schools = schoolBlocks.filter(s => { const key = s.level + '|' + s.name.toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; });

    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Scrape failed" }), { status: 500, headers: { "content-type": "application/json" } });
  }
}
