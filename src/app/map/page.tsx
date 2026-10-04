import Breadcrumbs from "@/components/Breadcrumbs";
import StationMapPage from "@/components/StationMapPage";
import { todayInBC } from "@/lib/config";
import { classifyByPercentile } from "@/lib/conditions";
import { sql } from "@/lib/db";
import type { Station } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getMapStations(): Promise<Station[]> {
  const { month, day } = todayInBC();
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
      AND lp.month = ${month} AND lp.day = ${day}
    WHERE s.latitude IS NOT NULL AND s.longitude IS NOT NULL
    ORDER BY s.name
  `;

  return rows.map((row) => {
    const hasLevelBand =
      row.level_value != null &&
      row.level_p0 != null &&
      row.level_p10 != null &&
      row.level_p90 != null &&
      row.level_p100 != null;

    return {
      code: row.code as string,
      name: row.name as string,
      waterbody: row.waterbody as string,
      latitude: row.latitude as number,
      longitude: row.longitude as number,
      currentCondition: row.current_condition as string | null,
      currentConditionUpdatedAt: row.current_condition_updated_at as string | null,
      currentLevelCondition: hasLevelBand
        ? classifyByPercentile(row.level_value as number, {
            p0: row.level_p0 as number,
            p10: row.level_p10 as number,
            p90: row.level_p90 as number,
            p100: row.level_p100 as number,
          })
        : "NO_LEVEL_DATA",
      currentLevelConditionUpdatedAt: row.level_observed_at as string | null,
    };
  });
}

export default async function MapPage() {
  const stations = await getMapStations();

  return (
    <div>
      <Breadcrumbs current="Station Map" />
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Station Map</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Select a station marker to open its latest water-level and flow details.
        </p>
      </div>
      <div className="h-[min(70vh,700px)] min-h-90 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
        <StationMapPage stations={stations} />
      </div>
    </div>
  );
}
