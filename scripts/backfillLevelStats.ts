// One-time fetch of ECCC's historical daily water-level percentile bands
// (P0/P10/P25/P50/P75/P90/P100 per day-of-year, based on decades of
// record). This is reference data ECCC recomputes occasionally, not
// something that changes on the 5-minute ingest cadence — re-run this
// script by hand every so often (e.g. annually) rather than scheduling it.
//
// Usage: npm run backfill-level-stats

import { neon } from "@neondatabase/serverless";
import { STATION_CODES } from "../src/lib/stations";

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // fall through — env vars may already be set (e.g. in CI)
  }
}

interface PercentileRow {
  stationCode: string;
  month: number;
  day: number;
  p0: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  p100: number;
  yearsWithData: number;
  p0ObservedAt: string | null;
  p100ObservedAt: string | null;
  recordThroughYear: number | null;
}

interface HistoricalExtremes {
  minValue: number;
  minDate: string;
  maxValue: number;
  maxDate: string;
}

interface HistoricalReferenceData {
  extremes: Map<string, HistoricalExtremes>;
  latestYearByStation: Map<string, number>;
}

function parseCsv(csv: string): PercentileRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const rows: PercentileRow[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const [stationCode, dataType, month, day, p0, p10, p25, p50, p75, p90, p100, years] = cols;
    if (!dataType.startsWith("water level")) continue;
    // ECCC leaves these fields blank (not zero) when there's too little
    // history to compute a meaningful percentile — Number("") is 0 in JS,
    // which would silently fabricate a bogus all-zero band, so skip instead.
    if ([p0, p10, p25, p50, p75, p90, p100].some((v) => v.trim() === "")) continue;

    rows.push({
      stationCode,
      month: Number(month),
      day: Number(day),
      p0: Number(p0),
      p10: Number(p10),
      p25: Number(p25),
      p50: Number(p50),
      p75: Number(p75),
      p90: Number(p90),
      p100: Number(p100),
      yearsWithData: Number(years),
      p0ObservedAt: null,
      p100ObservedAt: null,
      recordThroughYear: null,
    });
  }

  return rows;
}

function parseHistoricalExtremes(csv: string): Map<string, HistoricalExtremes> {
  const extremes = new Map<string, HistoricalExtremes>();

  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [stationCode, date, dataType, rawValue] = line.split(",");
    if (!stationCode || !date || !dataType.startsWith("water level")) continue;
    const value = Number(rawValue);
    if (Number.isNaN(value)) continue;

    const [, month, day] = date.split("-");
    const key = `${stationCode}|${Number(month)}|${Number(day)}`;
    const existing = extremes.get(key);
    if (!existing) {
      extremes.set(key, { minValue: value, minDate: date, maxValue: value, maxDate: date });
      continue;
    }
    if (value < existing.minValue) {
      existing.minValue = value;
      existing.minDate = date;
    }
    if (value > existing.maxValue) {
      existing.maxValue = value;
      existing.maxDate = date;
    }
  }

  return extremes;
}

async function fetchHistoricalExtremes(): Promise<HistoricalReferenceData> {
  const allExtremes = new Map<string, HistoricalExtremes>();
  const latestYearByStation = new Map<string, number>();
  const endDate = new Date().toISOString().slice(0, 10);

  for (const code of STATION_CODES) {
    console.log(`Fetching daily_data occurrence dates for ${code}...`);
    const params = new URLSearchParams();
    params.append("stations[]", code);
    params.append("parameters[]", "level");
    params.append("start_date", "1900-01-01");
    params.append("end_date", endDate);

    const res = await fetch(
      `https://wateroffice.ec.gc.ca/services/daily_data/csv/inline?${params.toString()}`
    );
    if (!res.ok) throw new Error(`daily_data request failed for ${code}: ${res.status}`);

    const csv = await res.text();
    for (const [key, value] of parseHistoricalExtremes(csv)) {
      allExtremes.set(key, value);
    }
    for (const line of csv.trim().split(/\r?\n/).slice(1)) {
      const [stationCode, date] = line.split(",");
      if (!stationCode || !date) continue;
      const year = Number(date.slice(0, 4));
      latestYearByStation.set(stationCode, Math.max(latestYearByStation.get(stationCode) ?? 0, year));
    }
  }

  return { extremes: allExtremes, latestYearByStation };
}

async function main() {
  const params = new URLSearchParams();
  for (const code of STATION_CODES) params.append("stations[]", code);
  params.append("start_date", "0101");
  params.append("end_date", "1231");

  console.log("Fetching daily_stats for all stations...");
  const res = await fetch(
    `https://wateroffice.ec.gc.ca/services/daily_stats/csv/inline?${params.toString()}`
  );
  if (!res.ok) throw new Error(`daily_stats request failed: ${res.status}`);
  const csv = await res.text();

  const rows = parseCsv(csv);
  console.log(`Parsed ${rows.length} water-level percentile rows.`);

  const historicalReference = await fetchHistoricalExtremes();
  for (const row of rows) {
    row.recordThroughYear = historicalReference.latestYearByStation.get(row.stationCode) ?? null;
    const extreme = historicalReference.extremes.get(`${row.stationCode}|${row.month}|${row.day}`);
    if (!extreme) continue;
    if (Math.abs(extreme.minValue - row.p0) < 0.000_001) row.p0ObservedAt = extreme.minDate;
    if (Math.abs(extreme.maxValue - row.p100) < 0.000_001) row.p100ObservedAt = extreme.maxDate;
  }

  const sql = neon(process.env.DATABASE_URL!);

  const stationCodes = rows.map((r) => r.stationCode);
  const months = rows.map((r) => r.month);
  const days = rows.map((r) => r.day);
  const p0s = rows.map((r) => r.p0);
  const p10s = rows.map((r) => r.p10);
  const p25s = rows.map((r) => r.p25);
  const p50s = rows.map((r) => r.p50);
  const p75s = rows.map((r) => r.p75);
  const p90s = rows.map((r) => r.p90);
  const p100s = rows.map((r) => r.p100);
  const years = rows.map((r) => r.yearsWithData);
  const p0ObservedAts = rows.map((r) => r.p0ObservedAt);
  const p100ObservedAts = rows.map((r) => r.p100ObservedAt);
  const recordThroughYears = rows.map((r) => r.recordThroughYear);

  await sql`
    ALTER TABLE level_percentiles
      ADD COLUMN IF NOT EXISTS p0_observed_at date,
      ADD COLUMN IF NOT EXISTS p100_observed_at date,
      ADD COLUMN IF NOT EXISTS record_through_year int
  `;

  await sql`
    INSERT INTO level_percentiles
      (station_code, month, day, p0, p10, p25, p50, p75, p90, p100, years_with_data,
       p0_observed_at, p100_observed_at, record_through_year)
    SELECT * FROM unnest(
      ${stationCodes}::text[],
      ${months}::int[],
      ${days}::int[],
      ${p0s}::float8[],
      ${p10s}::float8[],
      ${p25s}::float8[],
      ${p50s}::float8[],
      ${p75s}::float8[],
      ${p90s}::float8[],
      ${p100s}::float8[],
      ${years}::int[],
      ${p0ObservedAts}::date[],
      ${p100ObservedAts}::date[],
      ${recordThroughYears}::int[]
    )
    ON CONFLICT (station_code, month, day) DO UPDATE SET
      p0 = EXCLUDED.p0, p10 = EXCLUDED.p10, p25 = EXCLUDED.p25, p50 = EXCLUDED.p50,
      p75 = EXCLUDED.p75, p90 = EXCLUDED.p90, p100 = EXCLUDED.p100,
      years_with_data = EXCLUDED.years_with_data,
      p0_observed_at = EXCLUDED.p0_observed_at,
      p100_observed_at = EXCLUDED.p100_observed_at,
      record_through_year = EXCLUDED.record_through_year
  `;

  console.log(`Upserted ${rows.length} rows into level_percentiles.`);

  const perStation = new Map<string, number>();
  for (const r of rows) perStation.set(r.stationCode, (perStation.get(r.stationCode) ?? 0) + 1);
  for (const code of STATION_CODES) {
    console.log(`  ${code}: ${perStation.get(code) ?? 0} days`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
