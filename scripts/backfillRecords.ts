// One-time fetch of each station's true all-time record high/low (value +
// the exact date/time it occurred), from ECCC's peak_data service — annual
// instantaneous maximum/minimum per year, going back to the start of each
// station's record. We reduce that to the single most extreme row per
// (station, parameter, maximum|minimum).
//
// This is a different statistic from level_percentiles' P0/P100: those are
// day-of-year specific ("the lowest ever recorded on Sept 18th"), this is
// the true all-time extreme across the whole period of record, with a date.
// Reference data, not live — re-run by hand occasionally.
//
// Usage: npm run backfill-records

import { neon } from "@neondatabase/serverless";
import { STATION_CODES } from "../src/lib/stations";

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // fall through — env vars may already be set (e.g. in CI)
  }
}

type Parameter = "level" | "flow";

interface PeakRow {
  stationCode: string;
  parameter: Parameter;
  recordType: "maximum" | "minimum";
  value: number;
  observedAt: string;
}

// ECCC labels every row "PST" year-round in this service, summer included —
// fixed UTC-8, not DST-adjusted local time. Casting the bare "YYYY-MM-DD
// HH:MM" string straight to timestamptz would let Postgres assume UTC and
// silently shift every record by 8 hours, so the offset has to be explicit.
const TIMEZONE_OFFSETS: Record<string, string> = {
  PST: "-08:00",
  PDT: "-07:00",
};

function parseCsv(csv: string, parameter: Parameter): PeakRow[] {
  const lines = csv.trim().split(/\r?\n/);
  const rows: PeakRow[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const [stationCode, , rawDate, timezone, type, rawValue] = cols;
    if (type !== "maximum" && type !== "minimum") continue;
    const value = Number(rawValue);
    const offset = TIMEZONE_OFFSETS[timezone];
    if (!stationCode || !rawDate || Number.isNaN(value) || !offset) continue;
    const date = `${rawDate.replace(" ", "T")}:00${offset}`;

    rows.push({ stationCode, parameter, recordType: type, value, observedAt: date });
  }

  return rows;
}

async function fetchPeaks(parameter: Parameter): Promise<PeakRow[]> {
  const params = new URLSearchParams();
  for (const code of STATION_CODES) params.append("stations[]", code);
  params.append("parameters[]", parameter);
  params.append("start_year", "1850");
  params.append("end_year", "2026");

  const res = await fetch(
    `https://wateroffice.ec.gc.ca/services/peak_data/csv/inline?${params.toString()}`
  );
  if (!res.ok) throw new Error(`peak_data (${parameter}) request failed: ${res.status}`);
  return parseCsv(await res.text(), parameter);
}

async function main() {
  console.log("Fetching peak_data (level and flow) for all stations...");
  const [levelRows, flowRows] = await Promise.all([fetchPeaks("level"), fetchPeaks("flow")]);
  const allRows = [...levelRows, ...flowRows];
  console.log(`Parsed ${allRows.length} annual max/min rows.`);

  // Reduce to the single most extreme row per (station, parameter, type).
  const records = new Map<string, PeakRow>();
  for (const row of allRows) {
    const key = `${row.stationCode}|${row.parameter}|${row.recordType}`;
    const existing = records.get(key);
    const isMoreExtreme =
      !existing ||
      (row.recordType === "maximum" ? row.value > existing.value : row.value < existing.value);
    if (isMoreExtreme) records.set(key, row);
  }

  const rows = [...records.values()];
  console.log(`Reduced to ${rows.length} all-time records.`);

  const sql = neon(process.env.DATABASE_URL!);

  const stationCodes = rows.map((r) => r.stationCode);
  const parameters = rows.map((r) => r.parameter);
  const recordTypes = rows.map((r) => r.recordType);
  const values = rows.map((r) => r.value);
  const observedAts = rows.map((r) => r.observedAt);

  await sql`
    INSERT INTO station_records (station_code, parameter, record_type, value, observed_at)
    SELECT * FROM unnest(
      ${stationCodes}::text[],
      ${parameters}::text[],
      ${recordTypes}::text[],
      ${values}::float8[],
      ${observedAts}::timestamptz[]
    )
    ON CONFLICT (station_code, parameter, record_type) DO UPDATE SET
      value = EXCLUDED.value, observed_at = EXCLUDED.observed_at
  `;

  console.log(`Upserted ${rows.length} rows into station_records.`);
  for (const r of rows.sort((a, b) => a.stationCode.localeCompare(b.stationCode))) {
    console.log(`  ${r.stationCode} ${r.parameter} ${r.recordType}: ${r.value} on ${r.observedAt}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
