export const runtime = "edge";

// Haversine distance (meters) and bearing (degrees)
function toRad(d:number){return d*Math.PI/180;}
function bearingDeg(lat1:number, lon1:number, lat2:number, lon2:number){
  const y = Math.sin(toRad(lon2-lon1))*Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) - Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lon2-lon1));
  let brng = Math.atan2(y,x)*180/Math.PI;
  brng = (brng + 360) % 360;
  return brng;
}
function toCardinal8(brng:number){
  const dirs = ["N","NE","E","SE","S","SW","W","NW"];
  const idx = Math.round(brng/45) % 8;
  return dirs[idx];
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) return new Response(JSON.stringify({ error: "Missing address" }), { status: 400, headers: { "content-type": "application/json" } });

  // 1) Geocode via Google (server-side) using existing API key
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return new Response(JSON.stringify({ error: "Missing GOOGLE_MAPS_API_KEY" }), { status: 500, headers: { "content-type": "application/json" } });
  const gUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${apiKey}`;
  const gRes = await fetch(gUrl);
  const g = await gRes.json();
  const loc = g?.results?.[0]?.geometry?.location;
  if (!loc) return new Response(JSON.stringify({ error: "Geocode failed" }), { status: 404, headers: { "content-type": "application/json" } });
  const { lat, lng } = loc;

  // 2) Query OSM Overpass for nearest road segments within ~100m
  const overpass = `https://overpass-api.de/api/interpreter`;
  const query = `[out:json][timeout:25];way(around:120,${lat},${lng})[highway];out geom;`;
  const oRes = await fetch(overpass, { method: "POST", body: query, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (!oRes.ok) return new Response(JSON.stringify({ error: "Overpass error" }), { status: 502, headers: { "content-type": "application/json" } });
  const o = await oRes.json();

  if (!o.elements || !o.elements.length) return new Response(JSON.stringify({ error: "No nearby road geometry" }), { status: 404, headers: { "content-type": "application/json" } });

  // 3) Find the point on the closest road geometry to the house coordinate
  let best = { dist: Infinity, point: {lat:0, lon:0} };
  for (const el of o.elements) {
    const geom = el.geometry;
    if (!geom || geom.length < 2) continue;
    for (let i=0;i<geom.length-1;i++){
      const a = geom[i], b = geom[i+1];
      // approximate nearest point on segment by sampling midpoints (edge runtime simple)
      const candidates = [a, b, {lat:(a.lat+b.lat)/2, lon:(a.lon+b.lon)/2}];
      for (const c of candidates){
        const d = Math.hypot((c.lat-lat),(c.lon-lng)); // degree-space proxy, sufficient for short distances
        if (d < best.dist) best = { dist: d, point: {lat:c.lat, lon:c.lon} };
      }
    }
  }

  // 4) Bearing from house to nearest road point -> estimated facing
  const brng = bearingDeg(lat, lng, best.point.lat, best.point.lon);
  const facing = toCardinal8(brng);

  return new Response(JSON.stringify({ facing, method: "nearest-road-bearing", lat, lng, nearest: best.point }), { status: 200, headers: { "content-type": "application/json" } });
}
