// Loads every approved daily mean (ECCC's daily_data / HYDAT service) for each
// station into daily_history, back to the start of each station's record. The
// station page's "This day" view ranks today's reading against these.
//
// Reference data, not live: HYDAT is republished a few times a year, so
// re-run this by hand occasionally. Safe to re-run: rows are upserted.
//
// Usage:
//   npm run backfill-daily-history -- --dry-run      # count rows, no writes
//   npm run backfill-daily-history                   # write
//   --max-db-mb=450   refuse to write if the database would pass this size
//                     (default 450, under Supabase's 500MB free-plan cap)

import { createSql, databaseUrl, type Sql } from "../src/lib/postgres";
import { STATION_CODES } from "../src/lib/stations";
import { parseDailyDataCsv, type DailyHistoryRow } from "../src/lib/dailyHistory";
import type { Parameter } from "../src/lib/types";

if (!databaseUrl()) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // fall through — env vars may already be set (e.g. in CI)
  }
}

// Rough on-disk cost of one row plus its primary-key index entry, used only
// for the size check before writing.
const ESTIMATED_BYTES_PER_ROW = 110;
const CHUNK_SIZE = 5_000;
const PARAMETERS: Parameter[] = ["level", "flow"];

function parseArgs(argv: string[]) {
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  return {
    dryRun: argv.includes("--dry-run"),
    maxDbMb: Number(get("max-db-mb") ?? "450"),
  };
}

async function fetchDailyData(code: string, parameter: Parameter): Promise<DailyHistoryRow[]> {
  const params = new URLSearchParams();
  params.append("stations[]", code);
  params.append("parameters[]", parameter);
  params.append("start_date", "1850-01-01");
  params.append("end_date", new Date().toISOString().slice(0, 10));
  const url = `https://wateroffice.ec.gc.ca/services/daily_data/csv/inline?${params.toString()}`;

  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return parseDailyDataCsv(await res.text(), parameter);
    } catch (err) {
      if (attempt >= 3) throw new Error(`daily_data ${code} ${parameter} failed: ${String(err)}`);
      console.warn(`  ${code} ${parameter}: ${String(err)}, retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 5_000));
    }
  }
}

async function databaseSizeMb(sql: Sql): Promise<number> {
  const [row] = await sql`SELECT pg_database_size(current_database()) AS bytes`;
  return Math.round(Number(row.bytes) / 1_048_576);
}

async function upsert(sql: Sql, rows: DailyHistoryRow[]): Promise<void> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    await sql`
      INSERT INTO daily_history (station_code, parameter, month, day, year, value)
      SELECT * FROM unnest(
        ${chunk.map((r) => r.stationCode)}::text[],
        ${chunk.map((r) => r.parameter)}::text[],
        ${chunk.map((r) => r.month)}::smallint[],
        ${chunk.map((r) => r.day)}::smallint[],
        ${chunk.map((r) => r.year)}::smallint[],
        ${chunk.map((r) => r.value)}::float8[]
      )
      ON CONFLICT (station_code, parameter, month, day, year) DO UPDATE SET
        value = EXCLUDED.value
    `;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sql = createSql(databaseUrl()!, { max: 1 });

  try {
    const fetched = new Map<string, DailyHistoryRow[]>();
    let total = 0;
    for (const code of STATION_CODES) {
      for (const parameter of PARAMETERS) {
        const rows = await fetchDailyData(code, parameter);
        fetched.set(`${code}|${parameter}`, rows);
        total += rows.length;
        const years = rows.length ? `${rows[0].year}–${rows[rows.length - 1].year}` : "none";
        console.log(`${code} ${parameter}: ${rows.length.toLocaleString()} days (${years})`);
      }
    }

    const sizeMb = await databaseSizeMb(sql);
    const [existing] = await sql`SELECT count(*)::int AS n FROM daily_history`;
    const newRows = Math.max(0, total - Number(existing.n));
    const estimateMb = Math.ceil((newRows * ESTIMATED_BYTES_PER_ROW) / 1_048_576);
    console.log(
      `Total: ${total.toLocaleString()} rows (${Number(existing.n).toLocaleString()} already loaded). ` +
        `Database is ${sizeMb}MB; adding about ${estimateMb}MB.`
    );

    if (args.dryRun) {
      console.log("Dry run: nothing written.");
      return;
    }
    if (sizeMb + estimateMb > args.maxDbMb) {
      throw new Error(
        `Refusing to write: ${sizeMb}MB + ~${estimateMb}MB would pass --max-db-mb=${args.maxDbMb}.`
      );
    }

    for (const [key, rows] of fetched) {
      await upsert(sql, rows);
      console.log(`Upserted ${key}: ${rows.length.toLocaleString()} rows`);
    }
    console.log(`Done. Database is now ${await databaseSizeMb(sql)}MB.`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
