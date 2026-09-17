import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import type { Parameter, Resolution } from "@/lib/types";

export const dynamic = "force-dynamic";

const RANGE_CONFIG: Record<string, { interval: string; resolution: Resolution }> = {
  "24h": { interval: "24 hours", resolution: "raw" },
  "7d": { interval: "7 days", resolution: "hourly" },
  "30d": { interval: "30 days", resolution: "daily" },
  "1y": { interval: "1 year", resolution: "daily" },
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const station = searchParams.get("station");
  const parameter = searchParams.get("parameter") as Parameter | null;
  const range = searchParams.get("range") ?? "24h";

  if (!station) {
    return NextResponse.json({ error: "station is required" }, { status: 400 });
  }
  if (parameter !== "level" && parameter !== "flow") {
    return NextResponse.json({ error: "parameter must be 'level' or 'flow'" }, { status: 400 });
  }
  const config = RANGE_CONFIG[range];
  if (!config) {
    return NextResponse.json(
      { error: `range must be one of: ${Object.keys(RANGE_CONFIG).join(", ")}` },
      { status: 400 }
    );
  }

  let rows;
  if (config.resolution === "raw") {
    rows = await sql`
      SELECT observed_at AS bucket, value, unit
      FROM readings
      WHERE station_code = ${station}
        AND parameter = ${parameter}
        AND observed_at >= now() - ${config.interval}::interval
      ORDER BY observed_at ASC
    `;
  } else {
    const truncUnit = config.resolution === "hourly" ? "hour" : "day";
    rows = await sql`
      SELECT
        date_trunc(${truncUnit}, observed_at) AS bucket,
        avg(value) AS value,
        min(value) AS min_value,
        max(value) AS max_value,
        max(unit) AS unit
      FROM readings
      WHERE station_code = ${station}
        AND parameter = ${parameter}
        AND observed_at >= now() - ${config.interval}::interval
      GROUP BY bucket
      ORDER BY bucket ASC
    `;
  }

  return NextResponse.json({
    resolution: config.resolution,
    readings: rows.map((r) => ({
      observedAt: r.bucket as string,
      value: Number(r.value),
      minValue: r.min_value != null ? Number(r.min_value) : undefined,
      maxValue: r.max_value != null ? Number(r.max_value) : undefined,
      unit: r.unit as string,
    })),
  });
}
