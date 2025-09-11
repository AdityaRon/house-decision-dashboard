export const runtime = "edge";

const SABS =
  "https://nces.ed.gov/opengis/rest/services/K12_School_Locations/SABS_1516/MapServer/0/query";

function levelName(v: string | number) {
  const n = typeof v === "string" ? parseInt(v, 10) : v;
  return n === 1 ? "Elementary" : n === 2 ? "Middle" : n === 3 ? "High" : "Other";
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const address = searchParams.get("address");
  if (!address) {
    return new Response(JSON.stringify({ error: "Missing address" }), {
      status: 400, headers: { "content-type": "application/json" },
    });
  }
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) {
    return new Response(JSON.stringify({ error: "Missing GOOGLE_MAPS_API_KEY" }), {
      status: 500, headers: { "content-type": "application/json" },
    });
  }

  // 1) Geocode
  const gRes = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
      address
    )}&key=${key}`
  );
  const g = await gRes.json();
  const loc = g?.results?.[0]?.geometry?.location;
  if (!loc) {
    return new Response(JSON.stringify({ error: "Geocode failed", data: g }), {
      status: 200, headers: { "content-type": "application/json" },
    });
  }

  // 2) Intersect SABS polygons at that point
  const params = new URLSearchParams({
    f: "json",
    geometry: `${loc.lng},${loc.lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "schnam,SrcName,level,gslo,gshi,stAbbrev,leaid,ncessch",
    returnGeometry: "false",
  });
  const qRes = await fetch(`${SABS}?${params.toString()}`);
  const q = await qRes.json();
  const features = Array.isArray(q?.features) ? q.features : [];

  const assigned = ["1", "2", "3"]
    .map((lvl) => {
      const f = features.find((x: any) => String(x?.attributes?.level) === lvl);
      if (!f) return null;
      const a = f.attributes || {};
      return {
        level: levelName(a.level),
        name: a.schnam || a.SrcName || null,
        grades: [a.gslo, a.gshi].filter(Boolean).join("–") || null,
        ncesId: a.ncessch || null,
        source: "NCES SABS 2015–2016",
      };
    })
    .filter(Boolean);

  return new Response(
    JSON.stringify({ address, lat: loc.lat, lng: loc.lng, assigned }),
    { status: 200, headers: { "content-type": "application/json" } }
  );
}
