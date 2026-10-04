import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { fetchDailyMeanReadings } from "@/lib/eccc";
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

  if (config.resolution === "daily") {
    const endDate = new Date();
    const startDate = new Date(endDate);
    if (range === "1y") {
      startDate.setUTCFullYear(startDate.getUTCFullYear() - 1);
    } else {
      startDate.setUTCDate(startDate.getUTCDate() - 30);
    }

    try {
      const dailyMeans = await fetchDailyMeanReadings(station, parameter, startDate, endDate);
      if (dailyMeans.length > 0) {
        const historicalByDay = await fetchHistoricalReferenceByDay(station, parameter);

        return NextResponse.json({
          resolution: config.resolution,
          source: "eccc-provisional-daily-mean",
          readings: dailyMeans.map((reading) => {
            const date = reading.observedAt.slice(0, 10);
            const [, month, day] = date.split("-").map(Number);
            const historical = historicalByDay.get(`${month}-${day}`);

            return {
              observedAt: `${date}T00:00:00Z`,
              value: reading.value,
              unit: reading.unit,
              historicalMin: historical?.historicalMin,
              historicalMax: historical?.historicalMax,
              historicalMinDate: historical?.historicalMinDate,
              historicalMaxDate: historical?.historicalMaxDate,
              historicalThroughYear: historical?.historicalThroughYear,
            };
          }),
        });
      }
    } catch (error) {
      console.error("Could not fetch ECCC provisional daily means; using local fallback", error);
    }
  }

  let rows;
  if (config.resolution === "raw") {
    rows = await sql`
      SELECT
        r.observed_at AS bucket,
        r.value,
        r.unit,
        COALESCE(lp.p0, fp.p0) AS historical_min,
        COALESCE(lp.p100, fp.p100) AS historical_max,
        COALESCE(lp.p0_observed_at, fp.p0_observed_at) AS historical_min_date,
        COALESCE(lp.p100_observed_at, fp.p100_observed_at) AS historical_max_date,
        COALESCE(lp.record_through_year, fp.record_through_year) AS historical_through_year
      FROM readings r
      LEFT JOIN level_percentiles lp
        ON r.parameter = 'level'
        AND lp.station_code = r.station_code
        AND lp.month = EXTRACT(MONTH FROM r.observed_at)::int
        AND lp.day = EXTRACT(DAY FROM r.observed_at)::int
      LEFT JOIN flow_percentiles fp
        ON r.parameter = 'flow'
        AND fp.station_code = r.station_code
        AND fp.month = EXTRACT(MONTH FROM r.observed_at)::int
        AND fp.day = EXTRACT(DAY FROM r.observed_at)::int
      WHERE r.station_code = ${station}
        AND r.parameter = ${parameter}
        AND r.observed_at >= now() - ${config.interval}::interval
      ORDER BY r.observed_at ASC
    `;
  } else {
    const truncUnit = config.resolution === "hourly" ? "hour" : "day";
    rows = await sql`
      SELECT
        date_trunc(${truncUnit}, observed_at) AS bucket,
        avg(value) AS value,
        min(value) AS min_value,
        max(value) AS max_value,
        max(unit) AS unit,
        COALESCE(max(lp.p0), max(fp.p0)) AS historical_min,
        COALESCE(max(lp.p100), max(fp.p100)) AS historical_max,
        COALESCE(max(lp.p0_observed_at), max(fp.p0_observed_at)) AS historical_min_date,
        COALESCE(max(lp.p100_observed_at), max(fp.p100_observed_at)) AS historical_max_date,
        COALESCE(max(lp.record_through_year), max(fp.record_through_year)) AS historical_through_year
      FROM readings r
      LEFT JOIN level_percentiles lp
        ON r.parameter = 'level'
        AND lp.station_code = r.station_code
        AND lp.month = EXTRACT(MONTH FROM r.observed_at)::int
        AND lp.day = EXTRACT(DAY FROM r.observed_at)::int
      LEFT JOIN flow_percentiles fp
        ON r.parameter = 'flow'
        AND fp.station_code = r.station_code
        AND fp.month = EXTRACT(MONTH FROM r.observed_at)::int
        AND fp.day = EXTRACT(DAY FROM r.observed_at)::int
      WHERE r.station_code = ${station}
        AND r.parameter = ${parameter}
        AND r.observed_at >= now() - ${config.interval}::interval
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
      historicalMin: r.historical_min != null ? Number(r.historical_min) : undefined,
      historicalMax: r.historical_max != null ? Number(r.historical_max) : undefined,
      historicalMinDate: r.historical_min_date as string | null,
      historicalMaxDate: r.historical_max_date as string | null,
      historicalThroughYear:
        r.historical_through_year != null ? Number(r.historical_through_year) : undefined,
      unit: r.unit as string,
    })),
  });
}

interface HistoricalReference {
  historicalMin: number;
  historicalMax: number;
  historicalMinDate: string | null;
  historicalMaxDate: string | null;
  historicalThroughYear: number | null;
}

async function fetchHistoricalReferenceByDay(
  station: string,
  parameter: Parameter
): Promise<Map<string, HistoricalReference>> {
  const rows =
    parameter === "level"
      ? await sql`
          SELECT month, day, p0, p100, p0_observed_at, p100_observed_at, record_through_year
          FROM level_percentiles
          WHERE station_code = ${station}
        `
      : await sql`
          SELECT month, day, p0, p100, p0_observed_at, p100_observed_at, record_through_year
          FROM flow_percentiles
          WHERE station_code = ${station}
        `;

  return new Map(
    rows.map((row) => [
      `${Number(row.month)}-${Number(row.day)}`,
      {
        historicalMin: Number(row.p0),
        historicalMax: Number(row.p100),
        historicalMinDate: toDateString(row.p0_observed_at),
        historicalMaxDate: toDateString(row.p100_observed_at),
        historicalThroughYear:
          row.record_through_year != null ? Number(row.record_through_year) : null,
      },
    ])
  );
}

function toDateString(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "string") return value.slice(0, 10);
  return null;
}
