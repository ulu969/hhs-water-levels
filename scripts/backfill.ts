// One-time / occasional backfill of historical readings from ECCC's
// real_time_data service (up to ~18 months of 5-minute unit values for
// water level and flow). Safe to re-run: inserts are deduplicated on
// (station_code, parameter, observed_at).
//
// Usage:
//   npm run backfill -- --months=3
//   npm run backfill -- --since=2025-06-01 --until=2025-09-01
//   npm run backfill -- --months=1 --stations=08MG012,08MG027 --dry-run
//
// Flags:
//   --months=N       Backfill the last N months (default 1).
//   --since / --until  Explicit date range (YYYY-MM-DD), overrides --months.
//   --stations=...   Comma-separated station codes (default: all 10).
//   --chunk-days=N   Days per ECCC request (default 7). ECCC's docs ask
//                    large requests to be split up; this keeps each request
//                    to a manageable CSV size.
//   --delay-ms=N     Delay between requests, to stay polite to ECCC's
//                    servers (default 400).
//   --dry-run        Fetch and report counts without writing to the DB.
//   --yes            Required to proceed past the storage-size safety
//                     guard (see below).

import { neon } from "@neondatabase/serverless";
import { fetchHistoricalReadings } from "../src/lib/eccc";
import { upsertReadings } from "../src/lib/upsertReadings";
import { STATION_CODES } from "../src/lib/stations";

if (!process.env.DATABASE_URL) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // fall through — env vars may already be set (e.g. in CI)
  }
}

interface Args {
  months: number;
  since?: string;
  until?: string;
  stations: string[];
  chunkDays: number;
  delayMs: number;
  dryRun: boolean;
  yes: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) =>
    argv.find((a) => a.startsWith(`--${name}=`))?.split("=").slice(1).join("=");

  const stationsArg = get("stations");

  return {
    months: Number(get("months") ?? "1"),
    since: get("since"),
    until: get("until"),
    stations: stationsArg ? stationsArg.split(",").map((s) => s.trim()) : [...STATION_CODES],
    chunkDays: Number(get("chunk-days") ?? "7"),
    delayMs: Number(get("delay-ms") ?? "400"),
    dryRun: argv.includes("--dry-run"),
    yes: argv.includes("--yes"),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Rough upper-bound estimate assuming every station reports both parameters
// at 5-minute resolution for the whole window. Real counts are usually
// lower (some stations only report one parameter), but this is meant as a
// safety check, not a precise forecast.
function estimateRows(stationCount: number, totalDays: number): number {
  return stationCount * 2 * totalDays * (24 * 12);
}

async function fetchChunkWithRetry(
  stationCodes: string[],
  start: Date,
  end: Date,
  attempts = 3
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      return await fetchHistoricalReadings(stationCodes, start, end, controller.signal);
    } catch (err) {
      if (attempt === attempts) throw err;
      const backoffMs = 1000 * 2 ** (attempt - 1);
      console.warn(
        `  request failed (attempt ${attempt}/${attempts}): ${
          err instanceof Error ? err.message : err
        } — retrying in ${backoffMs}ms`
      );
      await sleep(backoffMs);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("unreachable");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  let start: Date;
  let end: Date;
  if (args.since && args.until) {
    start = new Date(`${args.since}T00:00:00Z`);
    end = new Date(`${args.until}T00:00:00Z`);
  } else {
    end = new Date();
    start = new Date(end);
    start.setUTCMonth(start.getUTCMonth() - args.months);
  }

  if (start >= end) {
    console.error("start date must be before end date");
    process.exit(1);
  }

  const totalDays = Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
  const estimated = estimateRows(args.stations.length, totalDays);

  console.log(
    `Backfilling ${args.stations.length} station(s) from ${start.toISOString().slice(0, 10)} ` +
      `to ${end.toISOString().slice(0, 10)} (${totalDays} days, ${args.chunkDays}-day chunks).`
  );
  console.log(`Upper-bound row estimate: ~${estimated.toLocaleString()} rows.`);

  // Based on estimated row volume, not window length alone — 10 stations
  // for a year is very different from 2 stations for a year.
  const ROW_SAFETY_THRESHOLD = 500_000; // ~75MB at a rough ~150 bytes/row, comfortable under the 512MB free-tier cap
  if (estimated > ROW_SAFETY_THRESHOLD && !args.dryRun && !args.yes) {
    console.error(
      `\nRefusing to run: the upper-bound estimate (~${estimated.toLocaleString()} rows) exceeds the ` +
        `${ROW_SAFETY_THRESHOLD.toLocaleString()}-row safety guard. Neon's free tier caps a branch at ` +
        `512MB, and a request this large can approach or exceed that. Re-run with --yes to proceed anyway, ` +
        `or request fewer stations / a shorter window with --stations=, --months=, or --since=/--until=.`
    );
    process.exit(1);
  }

  const sql = args.dryRun ? null : neon(process.env.DATABASE_URL!);

  const chunks: { start: Date; end: Date }[] = [];
  for (let cursor = new Date(start); cursor < end; ) {
    const chunkEnd = new Date(
      Math.min(cursor.getTime() + args.chunkDays * 86_400_000, end.getTime())
    );
    chunks.push({ start: new Date(cursor), end: chunkEnd });
    cursor = chunkEnd;
  }

  let totalFetched = 0;
  let totalInserted = 0;
  const failedChunks: { start: string; end: string; error: string }[] = [];

  for (const [i, chunk] of chunks.entries()) {
    const label = `[${i + 1}/${chunks.length}] ${chunk.start.toISOString().slice(0, 10)} → ${chunk.end
      .toISOString()
      .slice(0, 10)}`;
    try {
      const readings = await fetchChunkWithRetry(args.stations, chunk.start, chunk.end);
      totalFetched += readings.length;

      if (args.dryRun) {
        console.log(`${label}: fetched ${readings.length} rows (dry run, not written)`);
      } else {
        const inserted = await upsertReadings(sql!, readings);
        totalInserted += inserted;
        console.log(`${label}: fetched ${readings.length}, inserted ${inserted}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`${label}: FAILED after retries — ${message}`);
      failedChunks.push({
        start: chunk.start.toISOString().slice(0, 10),
        end: chunk.end.toISOString().slice(0, 10),
        error: message,
      });
    }

    if (i < chunks.length - 1) await sleep(args.delayMs);
  }

  console.log("\n--- Summary ---");
  console.log(`Fetched: ${totalFetched.toLocaleString()} rows`);
  if (!args.dryRun) console.log(`Inserted: ${totalInserted.toLocaleString()} new rows`);
  if (failedChunks.length > 0) {
    console.log(`\n${failedChunks.length} chunk(s) failed — re-run just these with --since/--until:`);
    for (const c of failedChunks) console.log(`  --since=${c.start} --until=${c.end}  (${c.error})`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
