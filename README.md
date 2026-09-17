# Harrison Water Levels

Real-time water level and flow data for the lakes and rivers around Harrison
Hot Springs, BC, sourced from Environment and Climate Change Canada's public
hydrometric web services (`wateroffice.ec.gc.ca`).

## How it works

```
ECCC recent_real_time_data (CSV) --(Vercel Cron, every 5 min)--> /api/ingest --> Neon Postgres --> Next.js pages
```

- **Ingestion** (`src/app/api/ingest/route.ts`) fetches the latest water
  level (parameter 46) and flow (parameter 47) readings for all 10 stations
  in a single request and upserts them into Postgres. It's triggered by
  Vercel Cron (`vercel.json`), not the browser — see "Scheduling" below.
- **Storage**: Neon Postgres. Tables: `stations`, `readings`, `thresholds`
  (flood-stage reference lines), `settings` (ingestion interval), `ingest_runs`
  (a log for monitoring ingestion health).
- **Frontend**: a dashboard of station cards (`/`) and a per-station detail
  page (`/station/[code]`) with a Water Level / Flow Rate toggle, a Graph /
  Table toggle, and a time-range picker (24h / 7d / 30d / 1y). Ranges longer
  than 24h are served as hourly or daily averages computed in Postgres.

## Why not `PeriodicSyncManager`?

The original idea was to use the Periodic Background Sync API to trigger
fetches. It doesn't fit this use case: it only works in an installed,
standalone PWA on Chromium browsers, gives no guaranteed interval, and does
nothing while your computer is off or the browser is closed — which
contradicts the requirement that data keeps flowing independent of your own
machine. The ingestion job instead runs as a server-side scheduled call to
`/api/ingest`, authenticated with a bearer token (`CRON_SECRET` for Vercel
Cron, or `INGEST_SECRET` for manual/GitHub Actions calls).

## Local setup

```bash
npm install
cp .env.example .env.local   # already done in this workspace with real values
npm run dev
```

`.env.local` needs:
- `DATABASE_URL` — Neon connection string (already provisioned for this
  workspace; see below).
- `INGEST_SECRET` — bearer token required to call `/api/ingest`.

To manually trigger an ingestion run locally:

```bash
curl -X POST -H "Authorization: Bearer $INGEST_SECRET" http://localhost:3000/api/ingest
```

### Database

A Neon project (`hhs-water-levels`) has already been provisioned with the
schema and the 10 stations seeded. To inspect or modify it, use the Neon
console or `psql "$DATABASE_URL"`.

Tables:
- `stations(code, name, waterbody, latitude, longitude)`
- `readings(station_code, parameter, value, unit, observed_at, ingested_at)` —
  unique on `(station_code, parameter, observed_at)` so re-running ingestion
  is safe.
- `thresholds(station_code, parameter, label, value, unit, notes)` — flood
  watch/warning reference lines shown on the chart. **Empty by default** —
  no official flood-stage values were populated automatically. Add real
  thresholds yourself (e.g. from the BC River Forecast Centre or a local
  flood plan) before relying on this for public information:

  ```sql
  INSERT INTO thresholds (station_code, parameter, label, value, unit)
  VALUES ('08MG012', 'level', 'Flood Watch', 12.5, 'm');
  ```
- `settings(key, value)` — currently just `ingest_interval_minutes`, an
  unread record of intent (the real interval is `vercel.json`'s cron
  expression, mirrored in `src/lib/config.ts` for the dashboard label).
- `ingest_runs(started_at, finished_at, stations_ok, stations_failed, rows_inserted, error)` —
  a log to monitor ingestion health.

## Scheduling the 5-minute fetch

**Primary scheduler: Vercel Cron** (`vercel.json`), requires the Pro plan —
Hobby only allows daily cron jobs. It calls `/api/ingest` via `GET` every 5
minutes; Vercel auto-injects `Authorization: Bearer $CRON_SECRET` on cron
requests, which the route checks against the `CRON_SECRET` env var.

We initially tried a GitHub Actions scheduled workflow instead (`cron: "*/5
* * * *"` in `.github/workflows/ingest.yml`). In practice it was unreliable
for this: GitHub treats high-frequency (sub-hourly) schedules as low-priority
on lower-traffic repos, and it ended up firing roughly once every 5 *hours*
instead of every 5 minutes — a documented limitation, not something fixable
by tweaking the cron expression. That workflow is kept only as a manual
"run it now" fallback (`workflow_dispatch`), not as the real scheduler.

Vercel project env vars needed:
- `DATABASE_URL`, `INGEST_SECRET` (see "Local setup" above)
- `CRON_SECRET` — any random string; Vercel sends it automatically on cron
  requests. Doesn't need to match `INGEST_SECRET`, but can.

GitHub repository secrets (only needed for the manual fallback):
- `INGEST_URL` — `https://your-deployment.vercel.app/api/ingest`
- `INGEST_SECRET` — same value as the Vercel env var

### Changing the interval

Edit the `schedule` in `vercel.json` and redeploy. There's no in-app control
for this — it was considered and deliberately dropped in favor of a fixed
5-minute cadence (see the dashboard's "next update" label, sourced from
`ingest_runs`).

## Backfilling history

`/api/ingest` only captures data going forward. To seed charts with history,
`scripts/backfill.ts` pulls from ECCC's `real_time_data` service, which
retains roughly 18 months of 5-minute level/flow readings.

```bash
npm run backfill -- --months=3                 # last 3 months, all stations
npm run backfill -- --since=2025-01-01 --until=2025-04-01
npm run backfill -- --months=1 --dry-run        # preview counts, no writes
```

It's safe to re-run: inserts are deduplicated on
`(station_code, parameter, observed_at)`, so a re-run (or a retry of a
failed chunk) just no-ops on rows it already has.

**Storage warning:** Neon's free tier caps a branch at 512MB. A full
18-month backfill across all 10 stations at 5-minute resolution is roughly
**3 million rows** by rough estimate — enough to approach or exceed that
limit. The script refuses to run any request estimated above 500,000 rows
unless you pass `--yes` (scaled by station count and window length together,
not window length alone), specifically to stop that from happening by
accident. Start
with a few months and check `SELECT pg_size_pretty(pg_database_size(current_database()))`
in the Neon console before going bigger. If you need the full 18 months,
consider only backfilling daily means for the older portion instead of raw
5-minute data (ECCC's `daily_data` service, ~200x fewer rows) — not yet
implemented here.

If a chunk fails (network blip, ECCC hiccup), the script logs it and keeps
going; the summary at the end prints ready-to-use `--since=/--until=` flags
to retry just the failed range.

## Deployment

1. Push this repo to GitHub.
2. Import it into Vercel (Pro plan, for cron support); add `DATABASE_URL`,
   `INGEST_SECRET`, and `CRON_SECRET` as environment variables. Vercel picks
   up `vercel.json`'s cron config automatically on deploy.
3. (Optional, for the manual fallback) add the `INGEST_URL` / `INGEST_SECRET`
   repository secrets in GitHub so `workflow_dispatch` can reach the deployed
   `/api/ingest` endpoint on demand.

## Known limitations / next steps

- `thresholds` is empty until you populate it with real flood-stage values.
- ECCC readings are provisional and can be revised; this app stores whatever
  value was live at fetch time.
- No alerting yet on `ingest_runs` failures or stale data.
- The backfill script only pulls raw 5-minute data; no daily-mean path yet
  for cheaply seeding years of history without the storage cost.
