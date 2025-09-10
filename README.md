# House Decision Dashboard

Home-buying numbers + logistics in one place: mortgage + taxes + HOA + rental delta, expense donut, income vs outflow, commute to offices, nearby KinderCare, plus Redfin details (lot size, living area, facing, assigned schools).

## Quick Start

```bash
npm install
npm run dev
# open http://localhost:3000
```

Create `.env.local` with:
```
GOOGLE_MAPS_API_KEY=YOUR_KEY
```

## Redfin details
Paste a Redfin link and click **Fetch details** to best-effort parse: address, lot size, living area, facing, and assigned schools (ratings). There is no official Redfin API. Parsing may vary across listings; manual override fields are provided.

## Deploy on Vercel
1. Push this repo to GitHub.
2. In Vercel, import the repo and set `GOOGLE_MAPS_API_KEY` in Environment Variables.
3. Deploy and share the URL.

## Notes
- Donut chart excludes profits (negative existing-house deltas) to avoid misleading slices.
- Facing is scraped when available; otherwise set manually. (True facing is not reliably derivable from maps without additional paid APIs.)
- Data is for planning only; verify any estimate before purchase decisions.
