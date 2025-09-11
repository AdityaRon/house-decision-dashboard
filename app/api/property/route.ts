export const runtime = "edge";

function toNum(v: any): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) {
    return new Response(JSON.stringify({ error: "Missing address" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  const key = process.env.RENTCAST_API_KEY;
  if (!key) {
    // Don’t hard fail; just inform the UI there’s no key set.
    return new Response(JSON.stringify({ error: "Missing RENTCAST_API_KEY" }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, {
    headers: { "X-Api-Key": key, Accept: "application/json", "User-Agent": "house-dashboard" },
  });
  const body = await res.json();

  const first =
    (Array.isArray(body) && body[0]) ||
    body?.properties?.[0] ||
    body;

  const living =
    first?.buildingSizeSqFt ||
    first?.livingAreaSqFt ||
    first?.squareFootage ||
    first?.building?.sizeSqFt;

  const lot =
    first?.lotSizeSqFt ||
    first?.lot?.sizeSqFt ||
    first?.lotSize;

  return new Response(
    JSON.stringify({
      source: "rentcast",
      livingAreaSqft: toNum(living),
      lotSizeSqft: toNum(lot),
      rawId: first?.id || null,
    }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
