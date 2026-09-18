import Link from "next/link";
import { sql } from "@/lib/db";
import { formatNextUpdate, formatRelativeTime, formatValue, isStale } from "@/lib/format";
import { INGEST_INTERVAL_MINUTES } from "@/lib/config";
import { getConditionInfo } from "@/lib/conditions";
import AutoRefresh from "@/components/AutoRefresh";
import StationMapModal from "@/components/StationMapModal";
import type { Station } from "@/lib/types";

export const dynamic = "force-dynamic";

interface StationRow {
  code: string;
  name: string;
  waterbody: string;
  latitude: number | null;
  longitude: number | null;
  current_condition: string | null;
  current_condition_updated_at: string | null;
  level_value: number | null;
  level_unit: string | null;
  level_observed_at: string | null;
  flow_value: number | null;
  flow_unit: string | null;
  flow_observed_at: string | null;
}

async function getLastIngestRun(): Promise<string | null> {
  const rows = await sql`
    SELECT finished_at FROM ingest_runs
    WHERE error IS NULL AND finished_at IS NOT NULL
    ORDER BY finished_at DESC LIMIT 1
  `;
  return rows.length > 0 ? (rows[0].finished_at as string) : null;
}

async function getStations(): Promise<StationRow[]> {
  const rows = await sql`
    SELECT
      s.code, s.name, s.waterbody, s.latitude, s.longitude,
      s.current_condition, s.current_condition_updated_at,
      lvl.value AS level_value, lvl.unit AS level_unit, lvl.observed_at AS level_observed_at,
      flow.value AS flow_value, flow.unit AS flow_unit, flow.observed_at AS flow_observed_at
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
    ORDER BY s.name
  `;
  return rows as unknown as StationRow[];
}

export default async function DashboardPage() {
  const [stations, lastRunFinishedAt] = await Promise.all([
    getStations(),
    getLastIngestRun(),
  ]);

  const mapStations: Station[] = stations
    .filter((s) => s.latitude != null && s.longitude != null)
    .map((s) => ({
      code: s.code,
      name: s.name,
      waterbody: s.waterbody,
      latitude: s.latitude,
      longitude: s.longitude,
      currentCondition: s.current_condition,
      currentConditionUpdatedAt: s.current_condition_updated_at,
    }));

  return (
    <AutoRefresh intervalSeconds={60}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold">Lakes &amp; Rivers near Harrison Hot Springs</h1>
            <p className="text-sm text-black/60 dark:text-white/60 mt-1">
              Real-time water level and flow readings from Environment and Climate Change Canada gauges.
            </p>
            <p className="text-xs text-black/50 dark:text-white/50 mt-2">
              Updates every {INGEST_INTERVAL_MINUTES} minutes
              {lastRunFinishedAt && <> &middot; last checked {formatRelativeTime(lastRunFinishedAt)}</>}
              {" "}&middot; next update{" "}
              {formatNextUpdate(lastRunFinishedAt, INGEST_INTERVAL_MINUTES)}
            </p>
          </div>
          {mapStations.length > 0 && <StationMapModal stations={mapStations} />}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stations.map((s) => (
            <Link
              key={s.code}
              href={`/station/${s.code}`}
              className="rounded-lg border border-black/10 dark:border-white/10 p-4 hover:border-black/30 dark:hover:border-white/30 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-medium">{s.name}</h2>
                <span className="text-xs text-black/40 dark:text-white/40 shrink-0">{s.code}</span>
              </div>
              <p className="text-xs text-black/50 dark:text-white/50">{s.waterbody}</p>
              <ConditionBadge code={s.current_condition} />

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Metric
                  label="Water level"
                  value={s.level_value}
                  unit={s.level_unit}
                  observedAt={s.level_observed_at}
                />
                <Metric
                  label="Flow rate"
                  value={s.flow_value}
                  unit={s.flow_unit}
                  observedAt={s.flow_observed_at}
                />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AutoRefresh>
  );
}

function ConditionBadge({ code }: { code: string | null }) {
  const info = getConditionInfo(code);
  if (!info) return null;

  return (
    <span
      className={`inline-block mt-2 rounded-full px-2 py-0.5 text-xs ${info.badgeClass}`}
    >
      {info.label}
    </span>
  );
}

function Metric({
  label,
  value,
  unit,
  observedAt,
}: {
  label: string;
  value: number | null;
  unit: string | null;
  observedAt: string | null;
}) {
  if (value == null || unit == null || observedAt == null) {
    return (
      <div>
        <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
        <p className="text-sm text-black/40 dark:text-white/40">No data</p>
      </div>
    );
  }

  const stale = isStale(observedAt);

  return (
    <div>
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{formatValue(value, unit)}</p>
      <p className={`text-xs ${stale ? "text-amber-600 dark:text-amber-400" : "text-black/40 dark:text-white/40"}`}>
        {formatRelativeTime(observedAt)}
      </p>
    </div>
  );
}
