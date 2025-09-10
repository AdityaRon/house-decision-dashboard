export const runtime = "edge";

type Out = {
  livingAreaSqft: number | null;
  lotSizeSqft: number | null;
  source: string;
};

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) {
    return new Response(JSON.stringify({ error: "Missing address" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const key = process.env.ESTATED_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "Missing ESTATED_API_KEY" }), { status: 200, headers: { "content-type": "application/json" } });
  }

  try {
    const url = `https://api.estated.com/property/v3?token=${encodeURIComponent(key)}&address=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { "User-Agent": "house-dashboard" } });
    const data = await res.json();

    const b = data?.data?.building || {};
    const l = data?.data?.lot || {};

    const living =
      b?.size?.living_area?.sq_ft ??
      b?.size?.gross_area?.sq_ft ??
      b?.size?.building_area?.sq_ft ?? null;

    const lot =
      l?.size?.sq_ft ??
      l?.lot_size?.sq_ft ?? null;

    const out: Out = {
      livingAreaSqft: typeof living === "number" ? living : (typeof living === "string" ? Number(living.replace(/,/g, "")) : null),
      lotSizeSqft: typeof lot === "number" ? lot : (typeof lot === "string" ? Number(lot.replace(/,/g, "")) : null),
      source: "estated",
    };

    return new Response(JSON.stringify(out), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: "Estated failed", details: String(e?.message || e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
}
