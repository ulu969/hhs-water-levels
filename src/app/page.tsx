import Link from "next/link";
import { sql } from "@/lib/db";
import {
  formatChange,
  formatNextUpdate,
  formatRelativeTime,
  formatValue,
  isStale,
} from "@/lib/format";
import { INGEST_INTERVAL_MINUTES } from "@/lib/config";
import { getConditionInfo, isConditionUnavailable } from "@/lib/conditions";
import { getStationSnapshots } from "@/lib/queries";
import type { LatestReading } from "@/lib/types";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

async function getLastIngestRun(): Promise<string | null> {
  const rows = await sql`
    SELECT finished_at FROM ingest_runs
    WHERE error IS NULL AND finished_at IS NOT NULL
    ORDER BY finished_at DESC LIMIT 1
  `;
  return rows.length > 0 ? (rows[0].finished_at as string) : null;
}

export default async function DashboardPage() {
  const [stations, lastRunFinishedAt] = await Promise.all([
    getStationSnapshots(),
    getLastIngestRun(),
  ]);

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
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {stations.map((s) => (
            <Link
              key={s.code}
              href={`/station/${s.code}`}
              aria-label={`View detailed data for ${s.name}`}
              className="group flex flex-col rounded-lg border border-black/10 dark:border-white/10 p-4 hover:border-black/30 dark:hover:border-white/30 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-medium">{s.name}</h2>
                <span className="text-xs text-black/40 dark:text-white/40 shrink-0">{s.code}</span>
              </div>
              <p className="text-xs text-black/50 dark:text-white/50">{s.waterbody}</p>

              <div className="mt-3 grid grid-cols-2 gap-3">
                <Metric
                  label="Water level"
                  reading={s.level}
                  badge={<ConditionBadge code={s.currentLevelCondition} />}
                />
                <Metric
                  label="Flow rate"
                  reading={s.flow}
                  badge={<ConditionBadge code={s.currentCondition} />}
                />
              </div>

              <p className="mt-4 border-t border-black/10 pt-3 text-sm font-medium text-black/60 transition-colors group-hover:text-black dark:border-white/10 dark:text-white/60 dark:group-hover:text-white">
                View station details <span aria-hidden="true">&rarr;</span>
              </p>
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

  const isNoData = isConditionUnavailable(code);

  return (
    <span
      className={`inline-block mt-2 rounded-full px-2 py-0.5 text-xs ${
        isNoData
          ? "border border-dashed border-black/25 bg-black/5 text-black/55 dark:border-white/25 dark:bg-white/5 dark:text-white/55"
          : info.badgeClass
      }`}
    >
      {info.label}
    </span>
  );
}

const TREND_ARROWS = { up: "\u2191", down: "\u2193", steady: "\u2192" } as const;

// Neutral colour on purpose: whether rising water is good or bad depends on
// the season and the station.
function Trend({ change, unit }: { change: number; unit: string }) {
  const { direction, text } = formatChange(change, unit);
  return (
    <p className="text-xs tabular-nums text-black/60 dark:text-white/60">
      <span aria-hidden="true">{TREND_ARROWS[direction]}</span> {text}
    </p>
  );
}

function Metric({
  label,
  reading,
  badge,
}: {
  label: string;
  reading: LatestReading | null;
  badge?: React.ReactNode;
}) {
  if (!reading) {
    return (
      <div>
        <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
        <p className="text-sm text-black/40 dark:text-white/40">No data</p>
        {badge}
      </div>
    );
  }

  const { value, unit, observedAt, change24h } = reading;
  const stale = isStale(observedAt);

  return (
    <div>
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{formatValue(value, unit)}</p>
      {change24h != null && <Trend change={change24h} unit={unit} />}
      <p className={`text-xs ${stale ? "text-amber-600 dark:text-amber-400" : "text-black/40 dark:text-white/40"}`}>
        {formatRelativeTime(observedAt)}
      </p>
      {badge}
    </div>
  );
}
