// app/api/property/route.ts
export const runtime = "edge";

type Out = {
  source: "rentcast";
  livingAreaSqft: number | null;
  lotSizeSqft: number | null;
  rawId?: string | null;
  debug?: any;
};

function toNum(v: any): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

// Split "123 St, City, ST 12345" → { street, city, state, postal }
function splitAddress(addr: string) {
  const parts = addr.split(",").map((s) => s.trim());
  const street = parts[0] || "";
  const city = parts.length >= 2 ? parts[1] : "";
  let state = "", postal = "";
  if (parts.length >= 3) {
    const tokens = parts[2].split(/\s+/);
    const st = tokens.find((t) => /^[A-Z]{2}$/.test(t));
    const zip = tokens.find((t) => /^\d{5}(-\d{4})?$/.test(t));
    if (st) state = st;
    if (zip) postal = zip;
  }
  return { street, city, state, postal };
}

async function rcFetch(url: string, key: string) {
  const res = await fetch(url, {
    headers: {
      "X-Api-Key": key,
      Accept: "application/json",
      "User-Agent": "house-dashboard",
    },
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address") || "";
  if (!address) {
    return new Response(JSON.stringify({ error: "Missing address" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const key = process.env.RENTCAST_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "Missing RENTCAST_API_KEY" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }

  const { street, city, state, postal } = splitAddress(address);
  const attempts: { url: string; status?: number; size?: any }[] = [];

  // Try more specific → less specific
  const urls = [
    // 1) With street+city+state+postal
    `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(
      street
    )}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(
      state
    )}&postalCode=${encodeURIComponent(postal)}`,
    // 2) With street+city+state
    `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(
      street
    )}&city=${encodeURIComponent(city)}&state=${encodeURIComponent(state)}`,
    // 3) With full address only
    `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`,
  ];

  let first: any = null;
  for (const url of urls) {
    const { res, data } = await rcFetch(url, key);
    const item =
      (Array.isArray(data) && data[0]) ||
      data?.properties?.[0] ||
      (data && data.id ? data : null);

    attempts.push({ url, status: res.status, size: Array.isArray(data) ? data.length : (data?.properties?.length ?? (item ? 1 : 0)) });

    if (item) {
      first = item;
      break;
    }
  }

  if (!first) {
    return new Response(
      JSON.stringify({
        source: "rentcast",
        livingAreaSqft: null,
        lotSizeSqft: null,
        debug: { attempts, note: "No property found or key/plan not enabled" },
      } as Out),
      { status: 200, headers: { "content-type": "application/json" } }
    );
  }

  // Map common fields coming from RentCast variants
  const living =
    first.buildingSizeSqFt ??
    first.livingAreaSqFt ??
    first.squareFootage ??
    first?.building?.sizeSqFt ??
    first?.details?.buildingSizeSqFt;

  const lot =
    first.lotSizeSqFt ??
    first?.lot?.sizeSqFt ??
    first.lotSize ??
    first?.details?.lotSizeSqFt;

  const out: Out = {
    source: "rentcast",
    livingAreaSqft: toNum(living),
    lotSizeSqft: toNum(lot),
    rawId: first?.id ?? null,
    debug: { attempts },
  };

  return new Response(JSON.stringify(out), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
