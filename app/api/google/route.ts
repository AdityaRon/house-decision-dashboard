// app/api/google/route.ts
export const runtime = "edge";

function redact(url: string) {
  return url.replace(/key=[^&]+/i, "key=REDACTED");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const path = searchParams.get("path") || "";
  const qs = searchParams.get("qs") || "";

  // Allow Find Place so fuzzy names work
  const allow = ["distancematrix", "geocode", "place/nearbysearch", "place/findplacefromtext"];
  if (!allow.some((p) => path.startsWith(p))) {
    console.log("[/api/google] blocked path", { path });
    return new Response(JSON.stringify({ error: "Blocked path" }), { status: 400, headers: { "content-type": "application/json" } });
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    console.log("[/api/google] missing GOOGLE_MAPS_API_KEY");
    return new Response(JSON.stringify({ error: "Missing GOOGLE_MAPS_API_KEY" }), { status: 500, headers: { "content-type": "application/json" } });
  }

  const target = `https://maps.googleapis.com/maps/api/${path}/json?${qs}&key=${apiKey}`;
  const redacted = redact(target);
  try {
    console.log("[/api/google] fetch", { path, url: redacted });
    const res = await fetch(target, { headers: { "User-Agent": "house-dashboard" } });
    const data = await res.json();
    console.log("[/api/google] status", { path, status: res.status, ok: res.ok });
    if (!res.ok) return new Response(JSON.stringify({ error: "Google API error", status: res.status, data }), { status: res.status });
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e: any) {
    console.log("[/api/google] error", { path, url: redacted, message: String(e?.message || e) });
    return new Response(JSON.stringify({ error: "Proxy error", message: String(e?.message || e) }), { status: 500, headers: { "content-type": "application/json" } });
  }
}
