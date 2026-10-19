# Harrison Water Levels

Real-time water level and flow data for the lakes and rivers around Harrison
Hot Springs, BC, sourced from Environment and Climate Change Canada's public
hydrometric web services (`wateroffice.ec.gc.ca`).

## How it works

```
ECCC recent_real_time_data (CSV) --(Vercel Cron, every 5 min)--> /api/ingest --> Supabase Postgres --> Next.js pages
```

- **Ingestion** (`src/app/api/ingest/route.ts`) fetches the latest water
  level (parameter 46) and flow (parameter 47) readings for all 12 stations
  in a single request and upserts them into Postgres. It's triggered by
  Vercel Cron (`vercel.json`), not the browser — see "Scheduling" below.
- **Storage**: Supabase Postgres, connected to the Vercel project through the
  Supabase integration and queried with the `postgres` library. The schema is
  in `db/schema.sql`; see "Database" below.
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
- `DATABASE_URL` — a Postgres connection string. On Vercel the Supabase
  integration's `POSTGRES_URL` is used instead, and takes priority if both
  are set.
- `INGEST_SECRET` — bearer token required to call `/api/ingest`.

To manually trigger an ingestion run locally:

```bash
curl -X POST -H "Authorization: Bearer $INGEST_SECRET" http://localhost:3000/api/ingest
```

### Tests

```bash
npm test        # Vitest unit tests in tests/
npm run lint
```

GitHub Actions (`.github/workflows/ci.yml`) runs lint, tests and a build on
every pull request and push to `main`.

### Database

The schema lives in `db/schema.sql` and is safe to re-run. Tables:
- `stations` — the 12 stations; name and waterbody are seeded by the schema,
  coordinates by `npm run seed-stations`.
- `readings` — 5-minute level and flow values, unique on
  `(station_code, parameter, observed_at)` so re-running ingestion is safe.
- `level_percentiles`, `flow_percentiles` — ECCC's published daily statistics
  (`npm run backfill-level-stats`).
- `station_records` — all-time maximum and minimum (`npm run backfill-records`).
- `thresholds` — flood watch/warning reference lines shown on the chart.
  **Empty by default**: add official values yourself (e.g. from the BC River
  Forecast Centre or a local flood plan) before relying on them:

  ```sql
  INSERT INTO thresholds (station_code, parameter, label, value, unit)
  VALUES ('08MG012', 'level', 'Flood Watch', 12.5, 'm');
  ```
- `ingest_runs` — one row per ingest run, read by the dashboard and
  `/api/health`.

Row level security is on for every table with no policies, which closes
Supabase's public REST API to them. The app connects as the database owner,
so it isn't affected.

#### Setting up a new database

Everything except `thresholds` can be rebuilt from ECCC. Add the Supabase
`POSTGRES_URL` value as a `DATABASE_URL` repository secret in GitHub, then run
the **Set up database (manual)** workflow. It applies the schema, then loads
station coordinates, daily statistics, all-time records and readings. Leave
"Only count the readings" ticked the first time to see how many rows a
backfill would add before writing them.

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
- `POSTGRES_URL` (set by the Supabase integration), `INGEST_SECRET` (see "Local setup" above)
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

## Monitoring

`GET /api/health` returns `200` while data is flowing and `503` when the last
successful ingest run is more than 15 minutes old or the newest reading from
any station is more than 3 hours old. The JSON body lists which check failed.
It's public (no secret) so an uptime monitor can poll it, and exposes only
timestamps and counts.

Point a free uptime monitor (e.g. UptimeRobot or Better Stack) at
`https://<your-domain>/api/health` with a 5-minute interval and email alerts
to get notified when ingestion stops.

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

**Storage warning:** Supabase's free plan caps the database at 500MB and
turns it read-only past that. A full
18-month backfill across all 12 stations at 5-minute resolution is roughly
**3.7 million rows** by rough estimate — enough to approach or exceed that
limit. The script refuses to run any request estimated above 500,000 rows
unless you pass `--yes` (scaled by station count and window length together,
not window length alone), specifically to stop that from happening by
accident. The script
also checks the database size before every chunk and stops at 450MB
(`--max-db-mb=` to change it). Chunks run newest first, so stopping early
keeps the most recent history. If you need the full 18 months,
consider only backfilling daily means for the older portion instead of raw
5-minute data (ECCC's `daily_data` service, ~200x fewer rows) — not yet
implemented here.

If a chunk fails (network blip, ECCC hiccup), the script logs it and keeps
going; the summary at the end prints ready-to-use `--since=/--until=` flags
to retry just the failed range.

## Deployment

1. Push this repo to GitHub.
2. Import it into Vercel (Pro plan, for cron support); connect a Supabase
   database through the Vercel integration (which sets `POSTGRES_URL`), add
   `INGEST_SECRET` and `CRON_SECRET` as environment variables. Vercel picks
   up `vercel.json`'s cron config automatically on deploy.
3. (Optional, for the manual fallback) add the `INGEST_URL` / `INGEST_SECRET`
   repository secrets in GitHub so `workflow_dispatch` can reach the deployed
   `/api/ingest` endpoint on demand.

## Known limitations / next steps

- `thresholds` is empty until you populate it with real flood-stage values.
- ECCC readings are provisional and can be revised; this app stores whatever
  value was live at fetch time.
- The backfill script only pulls raw 5-minute data; no daily-mean path yet
  for cheaply seeding years of history without the storage cost.
