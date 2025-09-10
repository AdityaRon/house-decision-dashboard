export const runtime = "edge";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") || "";
  const qs = searchParams.get("qs") || "";
  const allow = ["distancematrix", "geocode", "place/nearbysearch"];
  if (!allow.some(p => path.startsWith(p))) {
    return new Response(JSON.stringify({ error: "Blocked path" }), { status: 400, headers: { "content-type": "application/json" } });
  }
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: "Missing GOOGLE_MAPS_API_KEY" }), { status: 500, headers: { "content-type": "application/json" } });
  }
  const target = `https://maps.googleapis.com/maps/api/${path}/json?${qs}&key=${apiKey}`;
  const res = await fetch(target, { headers: { "User-Agent": "house-dashboard" } });
  const data = await res.json();
  return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
}
