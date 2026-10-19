import { sql } from "./db";
import { classifyByPercentile } from "./conditions";
import { todayInBC } from "./config";
import { isStale } from "./format";
import type { Reading, Station } from "./types";

// How old a reading can be before its condition badge is withheld. Looser
// than the 90-minute amber "stale" timestamp on the cards: some ECCC gauges
// routinely report an hour or two late, and a ranking against the day's
// historical band doesn't change that fast.
const CONDITION_STALE_MINUTES = 6 * 60;

export interface StationSnapshot extends Station {
  level: Reading | null;
  flow: Reading | null;
}

// Latest level and flow reading for every station, plus both condition
// badges. Shared by the dashboard, map, station page and /api/stations so the
// staleness rules below only live in one place. There are only a dozen
// stations, so callers filter and re-sort in JS rather than varying the SQL.
export async function getStationSnapshots(): Promise<StationSnapshot[]> {
  const { month, day } = todayInBC();
  const rows = await sql`
    SELECT
      s.code, s.name, s.waterbody, s.latitude, s.longitude,
      s.current_condition, s.current_condition_updated_at,
      lvl.value AS level_value, lvl.unit AS level_unit, lvl.observed_at AS level_observed_at,
      flow.value AS flow_value, flow.unit AS flow_unit, flow.observed_at AS flow_observed_at,
      lp.p0 AS level_p0, lp.p10 AS level_p10, lp.p90 AS level_p90, lp.p100 AS level_p100
    FROM stations s
    LEFT JOIN LATERAL (
      SELECT value, unit, observed_at FROM readings
      WHERE station_code = s.code AND parameter = 'level'
      ORDER BY observed_at DESC LIMIT 1
    ) lvl ON true
    LEFT JOIN LATERAL (
      SELECT value, unit, observed_at FROM readings
      WHERE station_code = s.code AND parameter = 'flow'
      ORDER BY observed_at DESC LIMIT 1
    ) flow ON true
    LEFT JOIN level_percentiles lp ON lp.station_code = s.code
      AND lp.month = ${month} AND lp.day = ${day}
    ORDER BY
      CASE s.code
        WHEN '08MG012' THEN 1
        WHEN '08MG013' THEN 2
        WHEN '08MG014' THEN 3
        WHEN '08MG027' THEN 4
        ELSE 5
      END,
      s.name
  `;

  return rows.map((r) => {
    const level = toReading(r.level_value, r.level_unit, r.level_observed_at);
    const flow = toReading(r.flow_value, r.flow_unit, r.flow_observed_at);
    const conditionUpdatedAt = toIso(r.current_condition_updated_at);

    return {
      code: r.code as string,
      name: r.name as string,
      waterbody: r.waterbody as string,
      latitude: r.latitude as number | null,
      longitude: r.longitude as number | null,
      currentCondition: flowCondition(r.current_condition as string | null, conditionUpdatedAt, flow),
      currentConditionUpdatedAt: conditionUpdatedAt,
      currentLevelCondition: levelCondition(level, {
        p0: r.level_p0 as number | null,
        p10: r.level_p10 as number | null,
        p90: r.level_p90 as number | null,
        p100: r.level_p100 as number | null,
      }),
      currentLevelConditionUpdatedAt: level?.observedAt ?? null,
      level,
      flow,
    };
  });
}

export function levelCondition(
  level: Reading | null,
  band: { p0: number | null; p10: number | null; p90: number | null; p100: number | null }
): string {
  if (!level || band.p0 == null || band.p10 == null || band.p90 == null || band.p100 == null) {
    return "NO_LEVEL_DATA";
  }
  // Ranking an hours-old reading against today's band would claim a current
  // status we don't actually know.
  if (isStale(level.observedAt, CONDITION_STALE_MINUTES)) return "STALE_DATA";
  return classifyByPercentile(level.value, {
    p0: band.p0,
    p10: band.p10,
    p90: band.p90,
    p100: band.p100,
  });
}

// ECCC's ranking is only as current as the discharge reading behind it and our
// last successful fetch of it. NO_DISCHARGE_DATA passes through unchanged: it
// already says there's nothing to rank.
export function flowCondition(
  condition: string | null,
  updatedAt: string | null,
  flow: Reading | null
): string | null {
  if (!condition || condition === "NO_DISCHARGE_DATA") return condition;
  if (
    !updatedAt ||
    isStale(updatedAt, CONDITION_STALE_MINUTES) ||
    !flow ||
    isStale(flow.observedAt, CONDITION_STALE_MINUTES)
  ) {
    return "STALE_DATA";
  }
  return condition;
}

function toReading(value: unknown, unit: unknown, observedAt: unknown): Reading | null {
  if (value == null || unit == null || observedAt == null) return null;
  return { value: Number(value), unit: unit as string, observedAt: toIso(observedAt)! };
}

function toIso(value: unknown): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}
