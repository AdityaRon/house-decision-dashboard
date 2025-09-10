// app/api/redfin/route.ts
import * as cheerio from "cheerio";

export const runtime = "edge";

type School = { name: string; rating?: number; level?: string };
type Out = {
  address: string | null;
  livingAreaSqft: number | null;
  lotSizeSqft: number | null;
  facing: string | null; // N/NE/E/SE/S/SW/W/NW/Unknown
  schools: School[];
  debug?: any;
};

function toFacing(token?: string | null): string | null {
  if (!token) return null;
  const t = token.toLowerCase();
  const map: Record<string, string> = {
    north: "N", northeast: "NE", east: "E", southeast: "SE",
    south: "S", southwest: "SW", west: "W", northwest: "NW",
  };
  if (map[t]) return map[t];
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

function deepFind(obj: any, pred: (k: string, v: any) => boolean, acc: any[] = []): any[] {
  if (!obj || typeof obj !== "object") return acc;
  for (const [k, v] of Object.entries(obj)) {
    try {
      if (pred(k, v)) acc.push(v);
      if (v && typeof v === "object") deepFind(v, pred, acc);
    } catch {}
  }
  return acc;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing url" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const out: Out = { address: null, livingAreaSqft: null, lotSizeSqft: null, facing: null, schools: [] };
  const debug: any = { target };

  try {
    const htmlRes = await fetch(target, {
      // Be explicit about headers; some CDNs gate on UA/lang.
      headers: {
        "User-Agent": "Mozilla/5.0 (house-dashboard)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
    debug.status = htmlRes.status;
    debug.ok = htmlRes.ok;
    const html = await htmlRes.text();
    const $ = cheerio.load(html);

    // -------- 1) JSON-LD --------
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

    // -------- 2) __REDUX_STATE__ blob (if present) --------
    const reduxMatch = html.match(/__REDUX_STATE__\s*=\s*(\{[\s\S]*?\});/);
    if (reduxMatch) {
      try {
        const reduxJson = JSON.parse(reduxMatch[1]);
        debug.redux = true;

        if (!out.address) {
          const addrObjs = deepFind(reduxJson, (k, v) => k.toLowerCase().includes("address") && typeof v === "object");
          for (const a of addrObjs) {
            const addr = [a.streetLine || a.streetAddress, a.city || a.addressLocality, a.state || a.addressRegion, a.zip || a.postalCode]
              .filter(Boolean).join(", ");
            if (addr) { out.address = addr; break; }
          }
        }

        if (!out.livingAreaSqft) {
          const areas = deepFind(reduxJson, (k, v) => /living.?area|finished.?sq.?ft|sq.?ft|square.?feet/i.test(k) && (typeof v === "number" || typeof v === "string"));
          out.livingAreaSqft = numOrNull(areas.find((x: any) => numOrNull(x)));
        }

        if (!out.lotSizeSqft) {
          const lots = deepFind(reduxJson, (k, v) => /lot.?size|lot.?area|lot.?sq.?ft/i.test(k) && (typeof v === "number" || typeof v === "string"));
          out.lotSizeSqft = numOrNull(lots.find((x: any) => numOrNull(x)));
        }

        if (!out.facing) {
          const faceTokens = deepFind(reduxJson, (k, v) => /facing|orientation/i.test(k) && typeof v === "string");
          out.facing = toFacing(faceTokens.find(Boolean) || null);
        }

        if (!out.schools.length) {
          const schoolNodes = deepFind(reduxJson, (k, v) => /school/i.test(k) && Array.isArray(v));
          for (const arr of schoolNodes) {
            for (const s of arr) {
              const name = s?.name || s?.schoolName;
              if (!name) continue;
              const level = s?.level || s?.gradeLevel || s?.type;
              const rating = numOrNull(s?.rating || s?.greatSchoolsRating) ?? undefined;
              out.schools.push({ name, level, rating });
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

    // -------- 3) Fallback: scan visible page text --------
    const text = $("body").text();

    // Matches "Living Sq. Ft.: 1,714" (exact phrasing on your link)
    if (!out.livingAreaSqft) {
      const m = text.match(/Living\\s*Sq\\.?\\s*Ft\\.?\\s*[:\\-]?\\s*(\\d{3,7})/i)
        || text.match(/(?:Living\\s*Area|Square\\s*Feet)[^\\d]*(\\d{3,7})/i);
      if (m) out.livingAreaSqft = numOrNull(m[1]);
    }

    // Matches "Lot Size: 673 square feet"
    if (!out.lotSizeSqft) {
      const m = text.match(/Lot\\s*Size\\s*[:\\-]?\\s*(\\d{2,7})\\s*(?:sq\\.?\\s*ft|square\\s*feet)/i);
      if (m) out.lotSizeSqft = numOrNull(m[1]);
    }

    // Facing
    if (!out.facing) {
      const m = text.match(/(?:Faces|Facing|Direction\\s*Faces?)\\s*[:\\-]?\\s*(North(?:east)?|South(?:east)?|East|West|South(?:west)?|North(?:west)?)/i);
      out.facing = toFacing(m?.[1] ?? null);
    }

    // Schools — also support pattern: "5/10 <School Name>" (GreatSchools)
    if (!out.schools.length) {
      const temp: School[] = [];
      // A) "5/10 Millard Mccollam Elementary School"
      const reA = /(\\d{1,2})\\s*\\/\\s*10\\s+([A-Za-z0-9 .,'-]+?(Elementary|Middle|High) School)/gi;
      let a: RegExpExecArray | null;
      while ((a = reA.exec(text)) !== null) {
        const rating = numOrNull(a[1]) ?? undefined;
        const fullName = a[2].trim();
        const level = (a[3] || "").trim() || undefined;
        temp.push({ name: fullName, level, rating });
      }
      // B) "<Level> School: Name ... GreatSchools Rating 6/10"
      const reB = /(Elementary|Middle|High)\\s*School\\s*[:\\-\\s]*([^\\n]+?)\\s*(?:GreatSchools\\s*Rating\\s*(\\d{1,2})\\s*\\/\\s*10)?/gi;
      let b: RegExpExecArray | null;
      while ((b = reB.exec(text)) !== null) {
        const level = b[1];
        const name = b[2].trim().replace(/\\s{2,}/g, " ");
        const rating = numOrNull(b[3]) ?? undefined;
        temp.push({ name, level, rating });
      }
      const seen = new Set<string>();
      out.schools = temp.filter((s) => {
        const key = (s.level || "") + "|" + s.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    out.debug = { ...debug, extracted: { address: out.address, livingAreaSqft: out.livingAreaSqft, lotSizeSqft: out.lotSizeSqft, facing: out.facing, schoolsCount: out.schools.length } };
    console.log("[/api/redfin] success", out.debug); // <-- Vercel function logs
    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });

  } catch (e: any) {
    console.log("[/api/redfin] error", { target, message: String(e?.message || e) });
    return new Response(JSON.stringify({ error: "Scrape failed", details: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
