import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import StationDetail from "@/components/StationDetail";
import { classifyByPercentile } from "@/lib/conditions";
import type { Station, Threshold } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getStation(code: string): Promise<Station | null> {
  const rows = await sql`
    SELECT
      s.code, s.name, s.waterbody, s.latitude, s.longitude,
      s.current_condition, s.current_condition_updated_at,
      lvl.value AS level_value, lvl.observed_at AS level_observed_at,
      lp.p0 AS level_p0, lp.p10 AS level_p10, lp.p90 AS level_p90, lp.p100 AS level_p100
    FROM stations s
    LEFT JOIN LATERAL (
      SELECT value, observed_at FROM readings
      WHERE station_code = s.code AND parameter = 'level'
      ORDER BY observed_at DESC LIMIT 1
    ) lvl ON true
    LEFT JOIN level_percentiles lp ON lp.station_code = s.code
      AND lp.month = EXTRACT(MONTH FROM (now() AT TIME ZONE 'America/Vancouver'))::int
      AND lp.day = EXTRACT(DAY FROM (now() AT TIME ZONE 'America/Vancouver'))::int
    WHERE s.code = ${code}
  `;
  if (rows.length === 0) return null;
  const r = rows[0];

  const levelValue = r.level_value as number | null;
  const p0 = r.level_p0 as number | null;
  const p10 = r.level_p10 as number | null;
  const p90 = r.level_p90 as number | null;
  const p100 = r.level_p100 as number | null;
  const currentLevelCondition =
    levelValue == null || p0 == null || p10 == null || p90 == null || p100 == null
      ? "NO_LEVEL_DATA"
      : classifyByPercentile(levelValue, { p0, p10, p90, p100 });

  return {
    code: r.code as string,
    name: r.name as string,
    waterbody: r.waterbody as string,
    latitude: r.latitude as number | null,
    longitude: r.longitude as number | null,
    currentCondition: r.current_condition as string | null,
    currentConditionUpdatedAt: r.current_condition_updated_at as string | null,
    currentLevelCondition,
    currentLevelConditionUpdatedAt: r.level_observed_at as string | null,
  };
}

async function getThresholds(code: string): Promise<Threshold[]> {
  const rows = await sql`
    SELECT parameter, label, value, unit, notes
    FROM thresholds WHERE station_code = ${code}
    ORDER BY value DESC
  `;
  return rows.map((r) => ({
    parameter: r.parameter as "level" | "flow",
    label: r.label as string,
    value: r.value as number,
    unit: r.unit as string,
    notes: r.notes as string | null,
  }));
}

export default async function StationPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const station = await getStation(code);
  if (!station) notFound();

  const thresholds = await getThresholds(code);

  return <StationDetail station={station} thresholds={thresholds} />;
}
