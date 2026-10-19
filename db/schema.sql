-- Database schema for hhs-water-levels. Safe to re-run: every statement is
-- idempotent, and the station seed only fills in rows that are missing.
--
-- Apply with:  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/schema.sql
--
-- Everything except `stations` and `thresholds` is rebuilt from ECCC by the
-- scripts in scripts/ (see "Setting up a new database" in the README).

CREATE TABLE IF NOT EXISTS stations (
  code text PRIMARY KEY,
  name text NOT NULL,
  waterbody text NOT NULL,
  latitude float8,
  longitude float8,
  -- ECCC's ranking of the latest discharge against the day's history, from
  -- the map_data feed. Written by every ingest run.
  current_condition text,
  current_condition_updated_at timestamptz
);

-- Coordinates are filled in from ECCC by scripts/seedStations.ts.
INSERT INTO stations (code, name, waterbody) VALUES
  ('08MG027', 'Lillooet River at Tenas Narrows', 'Lillooet River'),
  ('08MG012', 'Harrison Lake near Harrison Hot Springs', 'Harrison Lake'),
  ('08MG013', 'Harrison River near Harrison Hot Springs', 'Harrison River'),
  ('08MG022', 'Harrison River below Morris Creek', 'Harrison River'),
  ('08MG014', 'Harrison River at Harrison Mills', 'Harrison River'),
  ('08MF073', 'Fraser River at Harrison Mills', 'Fraser River'),
  ('08MF075', 'Fraser River at Lower Kent', 'Fraser River'),
  ('08MF035', 'Fraser River near Agassiz', 'Fraser River'),
  ('08MF038', 'Fraser River at Cannor', 'Fraser River'),
  ('08MF005', 'Fraser River at Hope', 'Fraser River'),
  ('08MF068', 'Coquihalla River above Alexander Creek', 'Coquihalla River'),
  ('08MH024', 'Fraser River at Mission', 'Fraser River')
ON CONFLICT (code) DO NOTHING;

-- 5-minute level and flow values. The unique key doubles as the index every
-- latest-reading and chart query uses, so there's deliberately no other index:
-- this table is most of the database's size.
CREATE TABLE IF NOT EXISTS readings (
  station_code text NOT NULL REFERENCES stations(code),
  parameter text NOT NULL CHECK (parameter IN ('level', 'flow')),
  value float8 NOT NULL,
  unit text NOT NULL,
  observed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (station_code, parameter, observed_at)
);

-- Published daily statistics per calendar day, from ECCC's daily_stats.
-- Written by scripts/backfillLevelStats.ts.
CREATE TABLE IF NOT EXISTS level_percentiles (
  station_code text NOT NULL REFERENCES stations(code),
  month int NOT NULL,
  day int NOT NULL,
  p0 float8 NOT NULL,
  p10 float8 NOT NULL,
  p25 float8 NOT NULL,
  p50 float8 NOT NULL,
  p75 float8 NOT NULL,
  p90 float8 NOT NULL,
  p100 float8 NOT NULL,
  years_with_data int,
  p0_observed_at date,
  p100_observed_at date,
  record_start_year int,
  record_through_year int,
  PRIMARY KEY (station_code, month, day)
);

CREATE TABLE IF NOT EXISTS flow_percentiles (LIKE level_percentiles INCLUDING ALL);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'flow_percentiles'::regclass AND contype = 'f'
  ) THEN
    ALTER TABLE flow_percentiles
      ADD FOREIGN KEY (station_code) REFERENCES stations(code);
  END IF;
END $$;

-- All-time maximum and minimum per station and parameter, from ECCC's
-- peak_data. Written by scripts/backfillRecords.ts.
CREATE TABLE IF NOT EXISTS station_records (
  station_code text NOT NULL REFERENCES stations(code),
  parameter text NOT NULL CHECK (parameter IN ('level', 'flow')),
  record_type text NOT NULL CHECK (record_type IN ('maximum', 'minimum')),
  value float8 NOT NULL,
  observed_at timestamptz NOT NULL,
  PRIMARY KEY (station_code, parameter, record_type)
);

-- Flood watch / warning reference lines for the station chart. Entered by
-- hand from an official source; nothing fills this automatically.
CREATE TABLE IF NOT EXISTS thresholds (
  id serial PRIMARY KEY,
  station_code text NOT NULL REFERENCES stations(code),
  parameter text NOT NULL CHECK (parameter IN ('level', 'flow')),
  label text NOT NULL,
  value float8 NOT NULL,
  unit text NOT NULL,
  notes text
);

-- One row per /api/ingest run; read by the dashboard and /api/health.
CREATE TABLE IF NOT EXISTS ingest_runs (
  id bigserial PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  stations_ok int NOT NULL DEFAULT 0,
  stations_failed int NOT NULL DEFAULT 0,
  rows_inserted int NOT NULL DEFAULT 0,
  error text
);
CREATE INDEX IF NOT EXISTS ingest_runs_started_at_idx ON ingest_runs (started_at DESC);

-- Supabase also exposes the public schema through its REST API, where the
-- anon key (shipped to browsers as NEXT_PUBLIC_SUPABASE_ANON_KEY) could read
-- and write these tables. The app connects as the database owner, which
-- bypasses row level security, so turning it on with no policies closes the
-- REST route without affecting the site.
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;
ALTER TABLE readings ENABLE ROW LEVEL SECURITY;
ALTER TABLE level_percentiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE flow_percentiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE station_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE thresholds ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingest_runs ENABLE ROW LEVEL SECURITY;
