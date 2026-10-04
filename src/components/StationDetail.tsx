"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Parameter, Resolution, Station, StationRecord, Threshold } from "@/lib/types";
import { formatRelativeTime, formatTimestamp, formatValue } from "@/lib/format";
import { getConditionInfo, relevantStatLabel } from "@/lib/conditions";

const RANGES: { value: string; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "1y", label: "Last year" },
];

interface ReadingPoint {
  observedAt: string;
  value: number;
  unit: string;
  historicalMin?: number;
  historicalMax?: number;
  historicalMinDate?: string | null;
  historicalMaxDate?: string | null;
  historicalThroughYear?: number | null;
}

export default function StationDetail({
  station,
  thresholds,
  records,
}: {
  station: Station;
  thresholds: Threshold[];
  records: StationRecord[];
}) {
  const [parameter, setParameter] = useState<Parameter>("level");
  const [range, setRange] = useState("1y");
  const [view, setView] = useState<"chart" | "table">("chart");
  const [showHistoricalMax, setShowHistoricalMax] = useState(false);
  const [showHistoricalMin, setShowHistoricalMin] = useState(false);
  const [mobileTooltipTarget, setMobileTooltipTarget] = useState<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState<{
    key: string;
    resolution: Resolution;
    readings: ReadingPoint[];
  } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const requestKey = `${station.code}|${parameter}|${range}`;

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/readings?station=${station.code}&parameter=${parameter}&range=${range}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        return res.json();
      })
      .then((data: { resolution: Resolution; readings: ReadingPoint[] }) => {
        if (cancelled) return;
        setLoaded({ key: requestKey, resolution: data.resolution, readings: data.readings });
      })
      .catch(() => {
        if (!cancelled) setErrorKey(requestKey);
      });

    return () => {
      cancelled = true;
    };
  }, [station.code, parameter, range, requestKey]);

  const status: "loading" | "ready" | "error" =
    loaded?.key === requestKey ? "ready" : errorKey === requestKey ? "error" : "loading";
  const resolution = loaded?.key === requestKey ? loaded.resolution : "raw";
  const readings = useMemo(
    () => (loaded?.key === requestKey ? loaded.readings : []),
    [loaded, requestKey]
  );

  const relevantThresholds = useMemo(
    () => thresholds.filter((t) => t.parameter === parameter),
    [thresholds, parameter]
  );

  const unit = readings[0]?.unit ?? (parameter === "level" ? "m" : "m³/s");
  const flowConditionInfo = getConditionInfo(station.currentCondition);
  const levelConditionInfo = getConditionInfo(station.currentLevelCondition);
  const levelRecord = relevantRecord(records, "level", station.currentLevelCondition);
  const flowRecord = relevantRecord(records, "flow", station.currentCondition);
  const historicalMaxAvailable = readings.some((r) => r.historicalMax != null);
  const historicalMinAvailable = readings.some((r) => r.historicalMin != null);
  const provisionalRecordReadings =
    resolution === "daily"
      ? readings.filter((r) => r.historicalMax != null && r.value > r.historicalMax)
      : [];
  const historicalThroughYear = readings.find(
    (r) => r.historicalThroughYear != null
  )?.historicalThroughYear;
  const isSmallScreen = useSyncExternalStore(
    subscribeToSmallScreen,
    getSmallScreenSnapshot,
    getServerScreenSnapshot
  );

  const chartData = useMemo(
    () =>
      readings.map((r) => ({
        ...r,
        time: new Date(r.observedAt).getTime(),
      })),
    [readings]
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{station.name}</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          {station.waterbody} &middot; Station {station.code}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <ToggleGroup
          value={parameter}
          onChange={(v) => setParameter(v as Parameter)}
          options={[
            { value: "level", label: "Water Level" },
            { value: "flow", label: "Flow Rate" },
          ]}
        />
        <ToggleGroup
          value={view}
          onChange={(v) => setView(v as "chart" | "table")}
          options={[
            { value: "chart", label: "Graph" },
            { value: "table", label: "Table" },
          ]}
        />
        <select
          value={range}
          onChange={(e) => setRange(e.target.value)}
          className="rounded-md border border-black/15 dark:border-white/15 bg-transparent px-3 py-1.5 text-sm"
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </div>

      {parameter === "level" && (
        <p>
          {levelConditionInfo && (
            <span className={`inline-block rounded-full px-2.5 py-1 text-xs ${levelConditionInfo.badgeClass}`}>
              {levelConditionInfo.label}
            </span>
          )}
          {station.currentLevelConditionUpdatedAt && (
            <span className="ml-2 text-xs text-black/40 dark:text-white/40">
              as of {formatRelativeTime(station.currentLevelConditionUpdatedAt)}
            </span>
          )}
          <a
            href={ecccReportUrl(station.code)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-xs underline text-black/60 dark:text-white/60"
          >
            View on ECCC
            {relevantStatLabel(station.currentLevelCondition) &&
              ` (tick "${relevantStatLabel(station.currentLevelCondition)}")`}{" "}
            &rarr;
          </a>
        </p>
      )}
      {parameter === "level" && levelRecord && (
        <p className="text-xs text-black/50 dark:text-white/50">
          Previous record: {formatValue(levelRecord.value, "m")} on{" "}
          {formatTimestamp(levelRecord.observedAt)}
        </p>
      )}

      {parameter === "flow" && (
        <p>
          {flowConditionInfo && (
            <span className={`inline-block rounded-full px-2.5 py-1 text-xs ${flowConditionInfo.badgeClass}`}>
              {flowConditionInfo.label}
            </span>
          )}
          {station.currentConditionUpdatedAt && (
            <span className="ml-2 text-xs text-black/40 dark:text-white/40">
              as of {formatRelativeTime(station.currentConditionUpdatedAt)}
            </span>
          )}
          <a
            href={ecccReportUrl(station.code)}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 text-xs underline text-black/60 dark:text-white/60"
          >
            View on ECCC
            {relevantStatLabel(station.currentCondition) &&
              ` (tick "${relevantStatLabel(station.currentCondition)}")`}{" "}
            &rarr;
          </a>
        </p>
      )}
      {parameter === "flow" && flowRecord && (
        <p className="text-xs text-black/50 dark:text-white/50">
          Previous record: {formatValue(flowRecord.value, "m³/s")} on{" "}
          {formatTimestamp(flowRecord.observedAt)}
        </p>
      )}

      {relevantThresholds.length > 0 && (
        <div className="flex flex-wrap gap-3 text-xs">
          {relevantThresholds.map((t) => (
            <span
              key={t.label}
              className="rounded-full border border-black/15 dark:border-white/15 px-2.5 py-1"
            >
              {t.label}: {formatValue(t.value, t.unit)}
            </span>
          ))}
        </div>
      )}

      {view === "chart" && (
        <fieldset className="flex flex-wrap items-center gap-2 text-sm sm:gap-x-4">
          <legend className="sr-only">Published historical daily statistics</legend>
          <span className="shrink-0 text-xs text-black/55 dark:text-white/55 sm:text-sm">
            Published history:
          </span>
          <HistoricalToggle
            label="Maximum"
            variant="maximum"
            checked={showHistoricalMax}
            disabled={status !== "ready" || !historicalMaxAvailable}
            onChange={setShowHistoricalMax}
          />
          <HistoricalToggle
            label="Minimum"
            variant="minimum"
            checked={showHistoricalMin}
            disabled={status !== "ready" || !historicalMinAvailable}
            onChange={setShowHistoricalMin}
          />
        </fieldset>
      )}

      {status === "ready" && provisionalRecordReadings.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 font-medium text-orange-800 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200">
            Provisional new record
          </span>
          <span className="text-black/55 dark:text-white/55">
            {provisionalRecordReadings.length} provisional daily mean
            {provisionalRecordReadings.length === 1 ? " exceeds" : "s exceed"} the published
            maximum{historicalThroughYear ? ` through ${historicalThroughYear}` : ""}.
          </span>
        </div>
      )}

      {status === "loading" && (
        <p className="text-sm text-black/50 dark:text-white/50">Loading readings&hellip;</p>
      )}
      {status === "error" && (
        <p className="text-sm text-red-600 dark:text-red-400">
          Could not load readings. Try again shortly.
        </p>
      )}
      {status === "ready" && readings.length === 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          No readings available for this range yet.
        </p>
      )}

      {status === "ready" && readings.length > 0 && view === "chart" && isSmallScreen && (
        <div className="min-h-28 rounded-lg border border-black/10 bg-black/[0.02] p-3 dark:border-white/10 dark:bg-white/[0.03] sm:hidden">
          <p className="mb-2 text-xs text-black/45 dark:text-white/45">
            Chart details &middot; tap or drag across the graph
          </p>
          <div ref={setMobileTooltipTarget} className="relative min-h-20" aria-live="polite" />
        </div>
      )}

      {status === "ready" && readings.length > 0 && view === "chart" && (
        <div className="h-80 w-full rounded-lg border border-black/10 dark:border-white/10 p-4">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-black/10 dark:stroke-white/10" />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                tickFormatter={(t) => formatAxisTick(t, resolution)}
                tick={{ fontSize: 12 }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                width={50}
                label={{ value: unit, angle: -90, position: "insideLeft", fontSize: 12 }}
              />
              <Tooltip
                portal={isSmallScreen ? mobileTooltipTarget : undefined}
                position={isSmallScreen ? { x: 0, y: 0 } : undefined}
                active={isSmallScreen && !mobileTooltipTarget ? false : undefined}
                wrapperStyle={isSmallScreen ? { width: "100%", zIndex: 10 } : undefined}
                contentStyle={
                  isSmallScreen
                    ? {
                        width: "100%",
                        minHeight: "5rem",
                        whiteSpace: "normal",
                        border: "none",
                        background: "var(--background)",
                      }
                    : undefined
                }
                labelFormatter={(t) => formatChartTooltipLabel(Number(t), resolution)}
                formatter={(value, name, item) => [
                  formatValue(Number(value), unit),
                  chartSeriesLabel(String(name), parameter, item.payload as ReadingPoint),
                ]}
              />
              {relevantThresholds.map((t) => (
                <ReferenceLine
                  key={t.label}
                  y={t.value}
                  stroke="#dc2626"
                  strokeDasharray="4 4"
                  label={{ value: t.label, fontSize: 11, position: "insideTopRight" }}
                />
              ))}
              {showHistoricalMax && historicalMaxAvailable && (
                <Line
                  type="monotone"
                  dataKey="historicalMax"
                  name="historicalMax"
                  stroke="#ea580c"
                  strokeWidth={2.5}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              {showHistoricalMin && historicalMinAvailable && (
                <Line
                  type="monotone"
                  dataKey="historicalMin"
                  name="historicalMin"
                  stroke="#7c3aed"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                name="value"
                stroke="#2563eb"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {status === "ready" && readings.length > 0 && view === "table" && (
        <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Time</th>
                <th className="text-right px-4 py-2 font-medium">
                  {parameter === "level" ? "Water Level" : "Flow Rate"}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...readings].reverse().map((r) => (
                <tr key={r.observedAt} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-4 py-2">{formatTimestamp(r.observedAt)}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatValue(r.value, r.unit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Only meaningful for the two all-time codes — the yellow "much above/below"
// tier isn't tied to a single record, just a percentile boundary (that's
// what the ECCC link's "tick ... quartile" hint is for instead).
function relevantRecord(
  records: StationRecord[],
  parameter: Parameter,
  condition: string | null
): StationRecord | null {
  const recordType = condition === "ALL_TIME_LOW" ? "minimum" : condition === "ALL_TIME_HIGH" ? "maximum" : null;
  if (!recordType) return null;
  return records.find((r) => r.parameter === parameter && r.recordType === recordType) ?? null;
}

function ecccReportUrl(stationCode: string): string {
  const params = new URLSearchParams({ stn: stationCode, data_type: "real_time", mode: "Graph" });
  return `https://wateroffice.ec.gc.ca/report/real_time_e.html?${params.toString()}`;
}

function formatAxisTick(timestamp: number, resolution: Resolution): string {
  const date = new Date(timestamp);
  if (resolution === "raw") {
    return date.toLocaleTimeString("en-CA", { hour: "2-digit", minute: "2-digit" });
  }
  if (resolution === "hourly") {
    return date.toLocaleString("en-CA", { month: "short", day: "numeric", hour: "2-digit" });
  }
  return date.toLocaleDateString("en-CA", { month: "short", day: "numeric" });
}

function formatChartTooltipLabel(timestamp: number, resolution: Resolution): string {
  const date = new Date(timestamp);
  if (resolution === "daily" || resolution === "monthly") {
    return date.toLocaleDateString("en-CA", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }
  return formatTimestamp(date.toISOString());
}

function chartSeriesLabel(name: string, parameter: Parameter, point: ReadingPoint): string {
  if (name === "historicalMax") {
    return `Published maximum${formatReferenceYear(point.historicalThroughYear)}${formatOccurrenceDate(point.historicalMaxDate)}`;
  }
  if (name === "historicalMin") {
    return `Published minimum${formatReferenceYear(point.historicalThroughYear)}${formatOccurrenceDate(point.historicalMinDate)}`;
  }
  if (point.historicalMax != null && point.value > point.historicalMax) {
    return `${parameter === "level" ? "Water level" : "Flow rate"} — Provisional new record`;
  }
  return parameter === "level" ? "Water level" : "Flow rate";
}

function formatReferenceYear(year: number | null | undefined): string {
  return year ? ` (through ${year})` : "";
}

function formatOccurrenceDate(date: string | null | undefined): string {
  if (!date) return "";
  const formatted = new Date(`${date.slice(0, 10)}T00:00:00Z`).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  return ` — occurred ${formatted}`;
}

function subscribeToSmallScreen(callback: () => void): () => void {
  const query = window.matchMedia("(max-width: 639px)");
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function getSmallScreenSnapshot(): boolean {
  return window.matchMedia("(max-width: 639px)").matches;
}

function getServerScreenSnapshot(): boolean {
  return false;
}

function HistoricalToggle({
  label,
  variant,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  variant: "maximum" | "minimum";
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label
      className={`flex min-h-11 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-xs transition-colors sm:min-h-10 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-sm ${
        disabled
          ? "border-black/10 text-black/30 dark:border-white/10 dark:text-white/30"
          : "border-black/15 text-black/70 hover:border-black/30 dark:border-white/15 dark:text-white/70 dark:hover:border-white/30"
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${
          variant === "maximum" ? "accent-orange-600" : "accent-violet-700"
        }`}
      />
      <span
        aria-hidden="true"
        className={`w-4 border-t-2 sm:w-6 ${
          variant === "maximum"
            ? "border-orange-600"
            : "border-dashed border-violet-700 dark:border-violet-400"
        }`}
      />
      {label}
    </label>
  );
}

function ToggleGroup({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-md border border-black/15 dark:border-white/15 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1 text-sm rounded ${
            value === opt.value
              ? "bg-black text-white dark:bg-white dark:text-black"
              : "text-black/60 dark:text-white/60"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
