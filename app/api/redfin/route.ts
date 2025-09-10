// app/api/redfin/route.ts
import * as cheerio from "cheerio";

export const runtime = "edge";

type Out = {
  address: string | null;
  livingAreaSqft: number | null;
  lotSizeSqft: number | null;
  facing: string | null; // N/NE/E/SE/S/SW/W/NW/Unknown
  schools: { name: string; rating?: number; level?: string }[];
};

function toFacing(token: string | undefined | null): string | null {
  if (!token) return null;
  const t = token.toLowerCase();
  const map: Record<string, string> = {
    north: "N", northeast: "NE", east: "E", southeast: "SE",
    south: "S", southwest: "SW", west: "W", northwest: "NW",
  };
    // try exact
  if (map[t]) return map[t];
  // try partials
  if (t.startsWith("north")) return t.includes("east") ? "NE" : t.includes("west") ? "NW" : "N";
  if (t.startsWith("south")) return t.includes("east") ? "SE" : t.includes("west") ? "SW" : "S";
  if (t.startsWith("east")) return "E";
  if (t.startsWith("west")) return "W";
  return "Unknown";
}

function numOrNull(v: any): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[, ]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}

function deepFind<T = any>(obj: any, pred: (k: string, v: any) => boolean, acc: T[] = []): T[] {
  if (!obj || typeof obj !== "object") return acc;
  for (const [k, v] of Object.entries(obj)) {
    try {
      if (pred(k, v)) acc.push(v as T);
      if (v && typeof v === "object") deepFind(v, pred, acc);
    } catch {}
  }
  return acc;
}

function firstNonNull<T>(...vals: (T | null | undefined)[]): T | null {
  for (const v of vals) if (v !== undefined && v !== null) return v as T;
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing url" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const out: Out = { address: null, livingAreaSqft: null, lotSizeSqft: null, facing: null, schools: [] };

  try {
    const htmlRes = await fetch(target, { headers: { "User-Agent": "Mozilla/5.0 (house-dashboard)" } });
    const html = await htmlRes.text();
    const $ = cheerio.load(html);

    // 1) JSON-LD blocks (common)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).contents().text();
        const json = JSON.parse(raw);
        const arr = Array.isArray(json) ? json : [json];
        for (const obj of arr) {
          if (obj["@type"] === "SingleFamilyResidence" || obj["@type"] === "Residence" || obj["@type"] === "House") {
            if (!out.address && obj.address) {
              const a = obj.address;
              out.address = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(", ");
            }
            if (!out.livingAreaSqft && obj.floorSize?.value) out.livingAreaSqft = numOrNull(obj.floorSize.value);
            if (!out.lotSizeSqft && obj.lotSize?.value) out.lotSizeSqft = numOrNull(obj.lotSize.value);
          }
        }
      } catch {}
    });

    // 2) window.__REDUX_STATE__ (Redfin often embeds a big JSON)
    //    We grab the JSON blob and traverse for likely keys.
    const reduxMatch = html.match(/__REDUX_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (reduxMatch) {
      try {
        const reduxJson = JSON.parse(reduxMatch[1]);
        // Address candidates
        if (!out.address) {
          const addrObjs = deepFind<any>(reduxJson, (k, v) => k.toLowerCase().includes("address") && typeof v === "object");
          for (const a of addrObjs) {
            const addr = [a.streetLine || a.streetAddress, a.city || a.addressLocality, a.state || a.addressRegion, a.zip || a.postalCode]
              .filter(Boolean).join(", ");
            if (addr) { out.address = addr; break; }
          }
        }
        // Living area candidates
        if (!out.livingAreaSqft) {
          const areas = deepFind<any>(reduxJson, (k, v) => /living.?area|finished.?sq.?ft|sq.?ft|square.?feet/i.test(k) && (typeof v === "number" || typeof v === "string"));
          out.livingAreaSqft = numOrNull(areas.find((x: any) => numOrNull(x)));
        }
        // Lot size candidates
        if (!out.lotSizeSqft) {
          const lots = deepFind<any>(reduxJson, (k, v) => /lot.?size|lot.?area|lot.?sq.?ft/i.test(k) && (typeof v === "number" || typeof v === "string"));
          out.lotSizeSqft = numOrNull(lots.find((x: any) => numOrNull(x)));
        }
        // Facing (rare in JSON, but search text fields)
        if (!out.facing) {
          const faceTokens = deepFind<string>(reduxJson, (k, v) => /facing|orientation/i.test(k) && typeof v === "string");
          out.facing = toFacing(faceTokens.find(Boolean) || null);
        }
        // Schools (name + rating + level)
        if (!out.schools.length) {
          const schoolNodes = deepFind<any>(reduxJson, (k, v) => /school/i.test(k) && Array.isArray(v));
          for (const arr of schoolNodes) {
            for (const s of arr) {
              const name = s?.name || s?.schoolName;
              if (!name) continue;
              const level = s?.level || s?.gradeLevel || s?.type;
              const rating = numOrNull(s?.rating || s?.greatSchoolsRating);
              out.schools.push({ name, level, rating: rating ?? undefined });
            }
          }
          // de-dup
          const seen = new Set<string>();
          out.schools = out.schools.filter((s) => {
            const key = (s.level || "") + "|" + s.name.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        }
      } catch {}
    }

    // 3) Fallback: scan visible text
    const text = $("body").text();

    if (!out.lotSizeSqft) {
      const m = text.match(/Lot\s*Size[^\d]*(\d{3,7})\s*(?:sq\.?\s*ft|square\s*feet)/i);
      if (m) out.lotSizeSqft = numOrNull(m[1]);
    }
    if (!out.livingAreaSqft) {
      const m = text.match(/(?:Living\s*Area|Square\s*Feet)[^\d]*(\d{3,7})/i);
      if (m) out.livingAreaSqft = numOrNull(m[1]);
    }
    if (!out.facing) {
      const m = text.match(/(?:Faces|Facing|Direction\s*Faces?)\s*[:\-]?\s*(North(?:east)?|South(?:east)?|East|West|South(?:west)?|North(?:west)?)/i);
      out.facing = toFacing(m?.[1] ?? null);
    }
    if (!out.schools.length) {
      const schoolRegex = /(Elementary|Middle|High)\s*School\s*[:\-\s]*([^\n]+?)\s*(?:GreatSchools\s*Rating\s*(\d{1,2})\s*\/\s*10)?/gi;
      let m: RegExpExecArray | null;
      const temp: Out["schools"] = [];
      while ((m = schoolRegex.exec(text)) !== null) {
        const level = m[1];
        const name = m[2].trim().replace(/\s{2,}/g, " ");
        const rating = numOrNull(m[3]) ?? undefined;
        if (name) temp.push({ name, level, rating });
      }
      const seen = new Set<string>();
      out.schools = temp.filter((s) => {
        const key = (s.level || "") + "|" + s.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: "Scrape failed" }), { status: 500, headers: { "content-type": "application/json" } });
  }
}
