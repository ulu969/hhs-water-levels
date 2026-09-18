**Stack**
-Frontend/backend: Next.js 16 (App Router, TypeScript), Tailwind CSS 4 — one app, server components render pages, API routes handle data.
-Database: Neon (serverless Postgres) — stations, readings, thresholds, ingest_runs tables.
-Hosting: Vercel
-Charts: Recharts. Map: Leaflet + OpenStreetMap tiles.

**How data comes in**
Source: Environment and Climate Change Canada's public hydrometric web services (wateroffice.ec.gc.ca) — plain CSV over HTTP, no auth needed.
Trigger: Vercel Cron calls GET /api/ingest every 5 minutes (vercel.json). That route fetches the latest level/flow readings for all 10 stations in one request and upserts them into Postgres (deduplicated, so re-runs are harmless).
We tried GitHub Actions for this first — its scheduler proved unreliable at high frequency (it settled into firing roughly every 5 hours, not 5 minutes). Vercel Cron replaced it and has been solid since. GitHub Actions is still in the repo, but only as a manual "run it now" fallback.
History: a separate one-off script (scripts/backfill.ts) pulled ~1 year of past readings from ECCC's historical service to seed the trend charts — that's a manual/occasional run, not part of the live loop.

**How the site itself works**
The dashboard (/) is a server-rendered page that queries Postgres directly and re-renders itself every 60 seconds client-side, so it reflects whatever the last ingest wrote without you needing to refresh.
Each station's detail page (/station/[code]) queries /api/readings for a given time range/resolution (raw 5-min, hourly, or daily averages depending on the window) and renders a graph/table toggle.

**The map**
A "View station map" button opens a Leaflet map in a modal, showing all 10 stations.
Coordinates were sourced from ECCC's own map_data endpoint (found while investigating their map's UI) and stored once in the stations table — not fetched live.
Clicking a marker links straight to that station's detail page.
