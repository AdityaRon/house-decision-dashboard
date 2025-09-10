// app/api/redfin/route.ts
// Redfin extractor with 403 fallback and URL-derived address.
// No cheerio/undici. Edge-safe.

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

// ---------- helpers ----------
function numOrNull(v: any): number | null {
  const n = typeof v === "string" ? Number(v.replace(/[, ]/g, "")) : Number(v);
  return Number.isFinite(n) ? n : null;
}
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
function stripHtmlToText(html: string): string {
  const noScripts = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  const noStyles = noScripts.replace(/<style[\s\S]*?<\/style>/gi, "");
  const noTags = noStyles.replace(/<[^>]+>/g, " ");
  return noTags
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s{2,}/g, " ")
    .trim();
}
function* extractJsonLd(html: string): Generator<any> {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const raw = m[1].trim();
    try {
      const json = JSON.parse(raw);
      if (Array.isArray(json)) for (const x of json) yield x;
      else yield json;
    } catch {}
  }
}
// Build a usable address from the Redfin URL path.
function addressFromRedfinUrl(u: URL): string | null {
  // e.g. /CA/San-Jose/1893-Newbury-Park-Dr-95133/home/143043477
  const parts = u.pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p === "home");
  if (idx <= 0 || parts.length < 3) return null;
  const state = parts[0]; // CA
  const city = parts[1]?.replace(/-/g, " "); // San Jose
  const streetZip = parts[2] || ""; // 1893-Newbury-Park-Dr-95133
  const tokens = streetZip.split("-");
  if (tokens.length < 2) return null;
  const zipToken = tokens[tokens.length - 1];
  const zip = /^\d{5}$/.test(zipToken) ? zipToken : "";
  const street = (zip ? tokens.slice(0, -1) : tokens).join(" ").trim();
  if (!street || !city || !state) return null;
  return `${street}, ${city}, ${state}${zip ? ` ${zip}` : ""}`;
}

// ---------- API ----------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const target = searchParams.get("url");
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing url" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const out: Out = {
    address: null,
    livingAreaSqft: null,
    lotSizeSqft: null,
    facing: null,
    schools: [],
  };
  const debug: any = { target };

  try {
    const u = new URL(target);
    // Pre-fill address from URL so we can do distances even if the page blocks us.
    out.address = addressFromRedfinUrl(u);

    // Try to fetch the actual page first.
    const primaryRes = await fetch(target, {
      headers: {
        "User-Agent": "Mozilla/5.0 (house-dashboard)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Cache-Control": "no-cache",
      },
    });
    debug.primary = { status: primaryRes.status, ok: primaryRes.ok };

    let html = "";
    if (primaryRes.ok) {
      html = await primaryRes.text();
    } else {
      // 403 fallback: get a readable text mirror (no cookies/JS)
      const mirror = `https://r.jina.ai/http://${u.host}${u.pathname}`;
      const mirrorRes = await fetch(mirror, { headers: { "User-Agent": "Mozilla/5.0 (house-dashboard)" } });
      debug.mirror = { url: mirror, status: mirrorRes.status, ok: mirrorRes.ok };
      html = await mirrorRes.text(); // This is plain text, but stripHtmlToText handles it fine.
    }

    // Parse JSON-LD when we have real HTML
    if (html.includes("<script")) {
      for (const obj of extractJsonLd(html)) {
        try {
          if (obj && (obj["@type"] === "SingleFamilyResidence" || obj["@type"] === "Residence" || obj["@type"] === "House")) {
            if (!out.address && obj.address) {
              const a = obj.address;
              out.address = [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode]
                .filter(Boolean).join(", ");
            }
            if (!out.livingAreaSqft && obj.floorSize?.value) out.livingAreaSqft = numOrNull(obj.floorSize.value);
            if (!out.lotSizeSqft && obj.lotSize?.value) out.lotSizeSqft = numOrNull(obj.lotSize.value);
          }
        } catch {}
      }
      // __REDUX_STATE__ (if present)
      const reduxMatch = html.match(/__REDUX_STATE__\s*=\s*({[\s\S]*?});/);
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
            const areas = deepFind(reduxJson, (k, v) =>
              /living.?sq|living.?area|finished.?sq.?ft|sq.?ft|square.?feet/i.test(k) &&
              (typeof v === "number" || typeof v === "string"));
            out.livingAreaSqft = numOrNull(areas.find((x: any) => numOrNull(x)));
          }
          if (!out.lotSizeSqft) {
            const lots = deepFind(reduxJson, (k, v) =>
              /lot.?size|lot.?area|lot.?sq.?ft/i.test(k) &&
              (typeof v === "number" || typeof v === "string"));
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
    }

    // Text-level parsing (works for both HTML and mirror text)
    const text = stripHtmlToText(html);

    if (!out.livingAreaSqft) {
      const m =
        text.match(/Living\s*Sq\.?\s*Ft\.?\s*[:\-]?\s*([\d,]{3,7})/i) ||
        text.match(/Living\s*Area\s*[:\-]?\s*([\d,]{3,7})/i) ||
        text.match(/Square\s*Feet\s*[:\-]?\s*([\d,]{3,7})/i);
      if (m) out.livingAreaSqft = numOrNull(m[1]);
    }
    if (!out.lotSizeSqft) {
      const m =
        text.match(/Lot\s*Size\s*[:\-]?\s*([\d,]{2,7})\s*(?:sq\.?\s*ft|square\s*feet)/i) ||
        text.match(/Lot\s*Size\s*\(sq\s*ft\)\s*[:\-]?\s*([\d,]{2,7})/i);
      if (m) out.lotSizeSqft = numOrNull(m[1]);
    }
    if (!out.facing) {
      const m = text.match(/(?:Faces|Facing|Direction\s*Faces?)\s*[:\-]?\s*(North(?:east)?|South(?:east)?|East|West|South(?:west)?|North(?:west)?)/i);
      out.facing = toFacing(m?.[1] ?? null);
    }
    if (!out.schools.length) {
      const temp: School[] = [];
      const reA = /(\d{1,2})\s*\/\s*10\s+([A-Za-z0-9 .,'\-]+?(?:Elementary|Middle|High)\s+School)/gi;
      let a: RegExpExecArray | null;
      while ((a = reA.exec(text)) !== null) {
        const rating = numOrNull(a[1]) ?? undefined;
        const fullName = a[2].trim();
        const levelMatch = fullName.match(/\b(Elementary|Middle|High)\s+School\b/i);
        const level = levelMatch?.[1];
        temp.push({ name: fullName, level, rating });
      }
      const reB = /(Elementary|Middle|High)\s*School\s*[:\-\s]*([^\n]+?)\s*(?:GreatSchools\s*Rating\s*(\d{1,2})\s*\/\s*10)?/gi;
      let b: RegExpExecArray | null;
      while ((b = reB.exec(text)) !== null) {
        const level = b[1];
        const name = b[2].trim().replace(/\s{2,}/g, " ");
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

    out.debug = {
      ...debug,
      extracted: {
        address: out.address,
        livingAreaSqft: out.livingAreaSqft,
        lotSizeSqft: out.lotSizeSqft,
        facing: out.facing,
        schoolsCount: out.schools.length,
      },
    };
    console.log("[/api/redfin] done", out.debug);
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (e: any) {
    console.log("[/api/redfin] error", { message: String(e?.message || e) });
    return new Response(JSON.stringify({ error: "Scrape failed", details: String(e?.message || e) }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
}
