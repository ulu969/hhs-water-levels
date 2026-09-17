import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchRecentReadings } from "@/lib/eccc";
import { STATION_CODES } from "@/lib/stations";
import { upsertReadings } from "@/lib/upsertReadings";

export const dynamic = "force-dynamic";

// Accepts either secret: CRON_SECRET is what Vercel Cron auto-injects as
// `Authorization: Bearer $CRON_SECRET` on scheduled GET requests; INGEST_SECRET
// is for manual calls / the GitHub Actions fallback (POST).
function isAuthorized(req: NextRequest): boolean {
  const auth = req.headers.get("authorization");
  if (!auth) return false;
  return (
    (!!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`) ||
    (!!process.env.INGEST_SECRET && auth === `Bearer ${process.env.INGEST_SECRET}`)
  );
}

async function runIngest() {
  const startedAt = new Date();

  try {
    const readings = await fetchRecentReadings(STATION_CODES);
    const rowsInserted = await upsertReadings(sql, readings);

    await sql`
      INSERT INTO ingest_runs (started_at, finished_at, stations_ok, stations_failed, rows_inserted)
      VALUES (${startedAt.toISOString()}, now(), ${STATION_CODES.length}, 0, ${rowsInserted})
    `;

    return NextResponse.json({
      ok: true,
      fetched: readings.length,
      inserted: rowsInserted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await sql`
      INSERT INTO ingest_runs (started_at, finished_at, stations_ok, stations_failed, rows_inserted, error)
      VALUES (${startedAt.toISOString()}, now(), 0, ${STATION_CODES.length}, 0, ${message})
    `;
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}

// Vercel Cron triggers scheduled jobs with GET.
export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runIngest();
}

// Kept for manual calls and the GitHub Actions fallback workflow.
export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return runIngest();
}
