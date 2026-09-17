import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchRecentReadings } from "@/lib/eccc";
import { STATION_CODES } from "@/lib/stations";
import { upsertReadings } from "@/lib/upsertReadings";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.INGEST_SECRET}`;
  if (!process.env.INGEST_SECRET || auth !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
