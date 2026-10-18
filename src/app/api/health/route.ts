import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

// Three missed 5-minute cron runs in a row.
const MAX_INGEST_AGE_MINUTES = 15;
// Ingest can keep "succeeding" while ECCC returns nothing new, so also check
// the newest reading from any station. Some gauges lag an hour or two, so this
// only trips when every station has gone quiet.
const MAX_READING_AGE_MINUTES = 3 * 60;

// For an uptime monitor: 200 while data is flowing, 503 when it isn't. Public
// on purpose so a monitor can poll it without a secret; it exposes only
// timestamps and counts.
export async function GET() {
  try {
    const [[lastRun], [lastSuccess], [newestReading]] = await Promise.all([
      sql`
        SELECT finished_at, stations_ok, stations_failed, error
        FROM ingest_runs
        ORDER BY started_at DESC LIMIT 1
      `,
      sql`
        SELECT finished_at FROM ingest_runs
        WHERE error IS NULL AND finished_at IS NOT NULL
        ORDER BY finished_at DESC LIMIT 1
      `,
      sql`SELECT max(observed_at) AS observed_at FROM readings`,
    ]);

    const ingestAge = minutesSince(lastSuccess?.finished_at);
    const readingAge = minutesSince(newestReading?.observed_at);

    const problems: string[] = [];
    if (ingestAge == null || ingestAge > MAX_INGEST_AGE_MINUTES) {
      problems.push(
        ingestAge == null
          ? "No successful ingest run on record"
          : `Last successful ingest was ${ingestAge} min ago (limit ${MAX_INGEST_AGE_MINUTES})`
      );
    }
    if (readingAge == null || readingAge > MAX_READING_AGE_MINUTES) {
      problems.push(
        readingAge == null
          ? "No readings on record"
          : `Newest reading from any station is ${readingAge} min old (limit ${MAX_READING_AGE_MINUTES})`
      );
    }

    return NextResponse.json(
      {
        ok: problems.length === 0,
        problems,
        lastSuccessfulIngestMinutesAgo: ingestAge,
        newestReadingMinutesAgo: readingAge,
        lastRun: lastRun
          ? {
              stationsOk: Number(lastRun.stations_ok),
              stationsFailed: Number(lastRun.stations_failed),
              failed: lastRun.error != null,
            }
          : null,
      },
      { status: problems.length === 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } }
    );
  } catch (err) {
    // Logged, not returned: driver errors can include connection details.
    console.error("Health check database query failed", err);
    return NextResponse.json(
      { ok: false, problems: ["Database check failed"] },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}

function minutesSince(value: unknown): number | null {
  if (value == null) return null;
  const time = new Date(value as string | Date).getTime();
  if (Number.isNaN(time)) return null;
  return Math.round((Date.now() - time) / 60_000);
}
