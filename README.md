# House Decision Dashboard (v2)

Home-buying numbers + logistics in one place. v2 adds:
- **Estimate Facing (experimental)** — infers facing by geocoding the address then finding the nearest road via OpenStreetMap and taking the bearing from the house to the road.
- **Compare Scenarios** — save multiple scenarios locally and view a side-by-side comparison at `/compare`.

## Quick Start
```bash
npm install
echo "GOOGLE_MAPS_API_KEY=YOUR_KEY" > .env.local
npm run dev
# open http://localhost:3000
```

## Deploy to Vercel
Click the button below **after** you push this repo to your GitHub (update the URL to your repo):
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/<your-username>/house-decision-dashboard)

Or: Import manually in the Vercel dashboard and add `GOOGLE_MAPS_API_KEY` as an Environment Variable.

## Data sources
- Google Geocoding/Distance/Places via serverless proxy (`/api/google`) using your server-side key.
- Redfin page (best-effort HTML parse) for address, **lot size**, **living area**, **assigned schools**.
- OpenStreetMap Overpass API for nearby road geometry (Estimate Facing). This is a heuristic; verify against listing/site plan.

## Notes
- The expense donut excludes profits (negative existing-house deltas) to avoid misleading slices.
- The scraper can break if a listing layout changes — manual overrides are available in the UI.
