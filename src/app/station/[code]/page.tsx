import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import StationDetail from "@/components/StationDetail";
import Breadcrumbs from "@/components/Breadcrumbs";
import AutoRefresh from "@/components/AutoRefresh";
import { INGEST_INTERVAL_MINUTES } from "@/lib/config";
import { getStationSnapshots } from "@/lib/queries";
import { parseStationView } from "@/lib/stationView";
import { getDayHistory } from "@/lib/thisDayQueries";
import type { DayHistory } from "@/lib/thisDay";
import type { LatestReading, Parameter, Station, StationRecord, Threshold } from "@/lib/types";

export const dynamic = "force-dynamic";

interface StationPageData {
  station: Station;
  hasLevelData: boolean;
  hasFlowData: boolean;
  level: LatestReading | null;
  flow: LatestReading | null;
}

async function getStation(code: string): Promise<StationPageData | null> {
  const snapshot = (await getStationSnapshots()).find((s) => s.code === code);
  if (!snapshot) return null;
  const { level, flow, ...station } = snapshot;
  return { station, hasLevelData: level != null, hasFlowData: flow != null, level, flow };
}

// The "This day" view's history. A failure here shouldn't take the whole
// station page down, so it falls back to "no history" instead.
async function getDayHistorySafe(code: string, parameter: Parameter, hasData: boolean) {
  if (!hasData) return null;
  try {
    return await getDayHistory(code, parameter);
  } catch (err) {
    console.error(`day history ${code} ${parameter}`, err);
    return null;
  }
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
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { code } = await params;
  const stationData = await getStation(code);
  if (!stationData) notFound();
  const { station, hasLevelData, hasFlowData, level, flow } = stationData;

  const [thresholds, records, query, levelHistory, flowHistory] = await Promise.all([
    getThresholds(code),
    getRecords(code),
    searchParams,
    getDayHistorySafe(code, "level", hasLevelData),
    getDayHistorySafe(code, "flow", hasFlowData),
  ]);
  const dayHistory: { level: DayHistory | null; flow: DayHistory | null } = {
    level: levelHistory,
    flow: flowHistory,
  };
  const initialView = parseStationView(query, { hasLevelData, hasFlowData });

  // Refreshes the condition badges and "as of" times; StationDetail re-fetches
  // its own chart readings on the same cadence.
  return (
    <AutoRefresh intervalSeconds={INGEST_INTERVAL_MINUTES * 60}>
      <Breadcrumbs current={station.name} />
      <StationDetail
        key={station.code}
        station={station}
        thresholds={thresholds}
        records={records}
        hasLevelData={hasLevelData}
        hasFlowData={hasFlowData}
        initialView={initialView}
        latest={{ level, flow }}
        dayHistory={dayHistory}
      />
    </AutoRefresh>
  );
}
