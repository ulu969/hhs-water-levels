import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import StationDetail from "@/components/StationDetail";
import Breadcrumbs from "@/components/Breadcrumbs";
import { classifyByPercentile } from "@/lib/conditions";
import { todayInBC } from "@/lib/config";
import type { Station, StationRecord, Threshold } from "@/lib/types";

export const dynamic = "force-dynamic";

interface StationPageData {
  station: Station;
  hasLevelData: boolean;
  hasFlowData: boolean;
}

async function getStation(code: string): Promise<StationPageData | null> {
  const { month, day } = todayInBC();
  const rows = await sql`
    SELECT
      s.code, s.name, s.waterbody, s.latitude, s.longitude,
      s.current_condition, s.current_condition_updated_at,
      lvl.value AS level_value, lvl.observed_at AS level_observed_at,
      lp.p0 AS level_p0, lp.p10 AS level_p10, lp.p90 AS level_p90, lp.p100 AS level_p100,
      EXISTS (
        SELECT 1 FROM readings
        WHERE station_code = s.code AND parameter = 'level'
      ) AS has_level_data,
      EXISTS (
        SELECT 1 FROM readings
        WHERE station_code = s.code AND parameter = 'flow'
      ) AS has_flow_data
    FROM stations s
    LEFT JOIN LATERAL (
      SELECT value, observed_at FROM readings
      WHERE station_code = s.code AND parameter = 'level'
      ORDER BY observed_at DESC LIMIT 1
    ) lvl ON true
    LEFT JOIN level_percentiles lp ON lp.station_code = s.code
      AND lp.month = ${month} AND lp.day = ${day}
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
    station: {
      code: r.code as string,
      name: r.name as string,
      waterbody: r.waterbody as string,
      latitude: r.latitude as number | null,
      longitude: r.longitude as number | null,
      currentCondition: r.current_condition as string | null,
      currentConditionUpdatedAt: r.current_condition_updated_at as string | null,
      currentLevelCondition,
      currentLevelConditionUpdatedAt: r.level_observed_at as string | null,
    },
    hasLevelData: r.has_level_data as boolean,
    hasFlowData: r.has_flow_data as boolean,
  };
}

async function getRecords(code: string): Promise<StationRecord[]> {
  const rows = await sql`
    SELECT parameter, record_type, value, observed_at
    FROM station_records WHERE station_code = ${code}
  `;
  return rows.map((r) => ({
    parameter: r.parameter as "level" | "flow",
    recordType: r.record_type as "maximum" | "minimum",
    value: r.value as number,
    observedAt: r.observed_at as string,
  }));
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
  const stationData = await getStation(code);
  if (!stationData) notFound();
  const { station, hasLevelData, hasFlowData } = stationData;

  const [thresholds, records] = await Promise.all([getThresholds(code), getRecords(code)]);

  return (
    <>
      <Breadcrumbs current={station.name} />
      <StationDetail
        key={station.code}
        station={station}
        thresholds={thresholds}
        records={records}
        hasLevelData={hasLevelData}
        hasFlowData={hasFlowData}
      />
    </>
  );
}
