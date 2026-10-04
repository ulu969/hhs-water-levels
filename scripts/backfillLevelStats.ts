// One-time fetch of ECCC's historical daily water-level and flow percentile bands
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

type HistoricalParameter = "level" | "flow";

function parseCsv(csv: string, parameter: HistoricalParameter): PercentileRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const rows: PercentileRow[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const [stationCode, dataType, month, day, p0, p10, p25, p50, p75, p90, p100, years] = cols;
    if (!dataType.startsWith(dataTypePrefix(parameter))) continue;
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

function parseHistoricalExtremes(
  csv: string,
  parameter: HistoricalParameter
): Map<string, HistoricalExtremes> {
  const extremes = new Map<string, HistoricalExtremes>();

  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [stationCode, date, dataType, rawValue] = line.split(",");
    if (!stationCode || !date || !dataType.startsWith(dataTypePrefix(parameter))) continue;
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

async function fetchHistoricalExtremes(
  parameter: HistoricalParameter
): Promise<HistoricalReferenceData> {
  const allExtremes = new Map<string, HistoricalExtremes>();
  const latestYearByStation = new Map<string, number>();
  const endDate = new Date().toISOString().slice(0, 10);

  for (const code of STATION_CODES) {
    console.log(`Fetching ${parameter} daily_data occurrence dates for ${code}...`);
    const params = new URLSearchParams();
    params.append("stations[]", code);
    params.append("parameters[]", parameter);
    params.append("start_date", "1900-01-01");
    params.append("end_date", endDate);

    const res = await fetch(
      `https://wateroffice.ec.gc.ca/services/daily_data/csv/inline?${params.toString()}`
    );
    if (!res.ok) throw new Error(`daily_data request failed for ${code}: ${res.status}`);

    const csv = await res.text();
    for (const [key, value] of parseHistoricalExtremes(csv, parameter)) {
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

function dataTypePrefix(parameter: HistoricalParameter): string {
  return parameter === "level" ? "water level" : "discharge";
}

function enrichRows(rows: PercentileRow[], reference: HistoricalReferenceData): void {
  for (const row of rows) {
    row.recordThroughYear = reference.latestYearByStation.get(row.stationCode) ?? null;
    const extreme = reference.extremes.get(`${row.stationCode}|${row.month}|${row.day}`);
    if (!extreme) continue;
    if (Math.abs(extreme.minValue - row.p0) < 0.000_001) row.p0ObservedAt = extreme.minDate;
    if (Math.abs(extreme.maxValue - row.p100) < 0.000_001) row.p100ObservedAt = extreme.maxDate;
  }
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

  const levelRows = parseCsv(csv, "level");
  const flowRows = parseCsv(csv, "flow");
  console.log(`Parsed ${levelRows.length} water-level percentile rows.`);
  console.log(`Parsed ${flowRows.length} flow percentile rows.`);

  const [levelReference, flowReference] = await Promise.all([
    fetchHistoricalExtremes("level"),
    fetchHistoricalExtremes("flow"),
  ]);
  enrichRows(levelRows, levelReference);
  enrichRows(flowRows, flowReference);

  const sql = neon(process.env.DATABASE_URL!);

  const levelArrays = percentileArrays(levelRows);
  const flowArrays = percentileArrays(flowRows);

  await sql`
    ALTER TABLE level_percentiles
      ADD COLUMN IF NOT EXISTS p0_observed_at date,
      ADD COLUMN IF NOT EXISTS p100_observed_at date,
      ADD COLUMN IF NOT EXISTS record_through_year int
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS flow_percentiles (
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
      record_through_year int,
      PRIMARY KEY (station_code, month, day)
    )
  `;

  await sql`
    INSERT INTO level_percentiles
      (station_code, month, day, p0, p10, p25, p50, p75, p90, p100, years_with_data,
       p0_observed_at, p100_observed_at, record_through_year)
    SELECT * FROM unnest(
      ${levelArrays.stationCodes}::text[],
      ${levelArrays.months}::int[],
      ${levelArrays.days}::int[],
      ${levelArrays.p0s}::float8[],
      ${levelArrays.p10s}::float8[],
      ${levelArrays.p25s}::float8[],
      ${levelArrays.p50s}::float8[],
      ${levelArrays.p75s}::float8[],
      ${levelArrays.p90s}::float8[],
      ${levelArrays.p100s}::float8[],
      ${levelArrays.years}::int[],
      ${levelArrays.p0ObservedAts}::date[],
      ${levelArrays.p100ObservedAts}::date[],
      ${levelArrays.recordThroughYears}::int[]
    )
    ON CONFLICT (station_code, month, day) DO UPDATE SET
      p0 = EXCLUDED.p0, p10 = EXCLUDED.p10, p25 = EXCLUDED.p25, p50 = EXCLUDED.p50,
      p75 = EXCLUDED.p75, p90 = EXCLUDED.p90, p100 = EXCLUDED.p100,
      years_with_data = EXCLUDED.years_with_data,
      p0_observed_at = EXCLUDED.p0_observed_at,
      p100_observed_at = EXCLUDED.p100_observed_at,
      record_through_year = EXCLUDED.record_through_year
  `;

  await sql`
    INSERT INTO flow_percentiles
      (station_code, month, day, p0, p10, p25, p50, p75, p90, p100, years_with_data,
       p0_observed_at, p100_observed_at, record_through_year)
    SELECT * FROM unnest(
      ${flowArrays.stationCodes}::text[],
      ${flowArrays.months}::int[],
      ${flowArrays.days}::int[],
      ${flowArrays.p0s}::float8[],
      ${flowArrays.p10s}::float8[],
      ${flowArrays.p25s}::float8[],
      ${flowArrays.p50s}::float8[],
      ${flowArrays.p75s}::float8[],
      ${flowArrays.p90s}::float8[],
      ${flowArrays.p100s}::float8[],
      ${flowArrays.years}::int[],
      ${flowArrays.p0ObservedAts}::date[],
      ${flowArrays.p100ObservedAts}::date[],
      ${flowArrays.recordThroughYears}::int[]
    )
    ON CONFLICT (station_code, month, day) DO UPDATE SET
      p0 = EXCLUDED.p0, p10 = EXCLUDED.p10, p25 = EXCLUDED.p25, p50 = EXCLUDED.p50,
      p75 = EXCLUDED.p75, p90 = EXCLUDED.p90, p100 = EXCLUDED.p100,
      years_with_data = EXCLUDED.years_with_data,
      p0_observed_at = EXCLUDED.p0_observed_at,
      p100_observed_at = EXCLUDED.p100_observed_at,
      record_through_year = EXCLUDED.record_through_year
  `;

  console.log(`Upserted ${levelRows.length} rows into level_percentiles.`);
  console.log(`Upserted ${flowRows.length} rows into flow_percentiles.`);

  const levelPerStation = new Map<string, number>();
  const flowPerStation = new Map<string, number>();
  for (const row of levelRows) {
    levelPerStation.set(row.stationCode, (levelPerStation.get(row.stationCode) ?? 0) + 1);
  }
  for (const row of flowRows) {
    flowPerStation.set(row.stationCode, (flowPerStation.get(row.stationCode) ?? 0) + 1);
  }
  for (const code of STATION_CODES) {
    console.log(
      `  ${code}: ${levelPerStation.get(code) ?? 0} level days, ${flowPerStation.get(code) ?? 0} flow days`
    );
  }
}

function percentileArrays(rows: PercentileRow[]) {
  return {
    stationCodes: rows.map((row) => row.stationCode),
    months: rows.map((row) => row.month),
    days: rows.map((row) => row.day),
    p0s: rows.map((row) => row.p0),
    p10s: rows.map((row) => row.p10),
    p25s: rows.map((row) => row.p25),
    p50s: rows.map((row) => row.p50),
    p75s: rows.map((row) => row.p75),
    p90s: rows.map((row) => row.p90),
    p100s: rows.map((row) => row.p100),
    years: rows.map((row) => row.yearsWithData),
    p0ObservedAts: rows.map((row) => row.p0ObservedAt),
    p100ObservedAts: rows.map((row) => row.p100ObservedAt),
    recordThroughYears: rows.map((row) => row.recordThroughYear),
  };
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
