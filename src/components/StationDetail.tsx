"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
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
import { useVisibleInterval } from "@/lib/useVisibleInterval";
import { INGEST_INTERVAL_MINUTES } from "@/lib/config";
import { getConditionInfo, relevantStatLabel } from "@/lib/conditions";
import {
  RANGES,
  defaultStationView,
  stationViewQuery,
  type Range,
  type StationView,
  type View,
} from "@/lib/stationView";

// Matches the ingest cron, so each refresh can pick up one new reading.
const READINGS_REFRESH_MS = INGEST_INTERVAL_MINUTES * 60_000;

interface ReadingPoint {
  observedAt: string;
  value: number;
  unit: string;
  historicalMin?: number;
  historicalMax?: number;
  historicalMinDate?: string | null;
  historicalMaxDate?: string | null;
  historicalStartYear?: number | null;
  historicalThroughYear?: number | null;
}

export default function StationDetail({
  station,
  thresholds,
  records,
  hasLevelData,
  hasFlowData,
  initialView,
}: {
  station: Station;
  thresholds: Threshold[];
  records: StationRecord[];
  hasLevelData: boolean;
  hasFlowData: boolean;
  initialView: StationView;
}) {
  const [parameter, setParameter] = useState<Parameter>(initialView.parameter);
  const [range, setRange] = useState<Range>(initialView.range);
  const [view, setView] = useState<View>(initialView.view);

  // Mirror the choices into the URL. replaceState rather than pushState so
  // flicking between options doesn't fill the back button's history.
  useEffect(() => {
    const query = stationViewQuery(
      { parameter, range, view },
      defaultStationView({ hasLevelData, hasFlowData })
    );
    if (window.location.search !== query) {
      window.history.replaceState(null, "", `${window.location.pathname}${query}`);
    }
  }, [parameter, range, view, hasLevelData, hasFlowData]);
  const [showHistoricalMax, setShowHistoricalMax] = useState(false);
  const [showHistoricalMin, setShowHistoricalMin] = useState(false);
  const [mobileTooltipTarget, setMobileTooltipTarget] = useState<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState<{
    key: string;
    resolution: Resolution;
    readings: ReadingPoint[];
  } | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  // Bumped by the refresh timer. It isn't part of requestKey, so the current
  // chart stays on screen while the newer readings load.
  const [refreshTick, setRefreshTick] = useState(0);

  const requestKey = `${station.code}|${parameter}|${range}`;

  // The 30-day and 1-year views are daily means that change once a day, so
  // only the views built from live readings re-fetch.
  useVisibleInterval(
    () => setRefreshTick((tick) => tick + 1),
    READINGS_REFRESH_MS,
    range === "24h" || range === "7d"
  );

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
  }, [station.code, parameter, range, requestKey, refreshTick]);

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
  const recordGroups = (["level", "flow"] as const)
    .map((recordParameter) => ({
      parameter: recordParameter,
      records: records.filter((record) => record.parameter === recordParameter),
    }))
    .filter((group) => group.records.length > 0);
  const historicalMaxAvailable = readings.some((r) => r.historicalMax != null);
  const historicalMinAvailable = readings.some((r) => r.historicalMin != null);
  const provisionalHighReadings =
    resolution === "daily"
      ? readings.filter((r) => r.historicalMax != null && r.value > r.historicalMax)
      : [];
  const provisionalLowReadings =
    resolution === "daily"
      ? readings.filter((r) => r.historicalMin != null && r.value < r.historicalMin)
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">{station.name}</h1>
          <p className="text-sm text-black/60 dark:text-white/60">
            {station.waterbody} &middot; Station {station.code}
          </p>
        </div>
        {station.latitude != null && station.longitude != null && (
          <Link
            href={{ pathname: "/map", query: { station: station.code } }}
            className="inline-flex items-center gap-1.5 rounded-md border border-black/15 px-3 py-1.5 text-sm transition-colors hover:border-black/30 dark:border-white/15 dark:hover:border-white/30"
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-4"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z" />
              <circle cx="12" cy="10" r="2.25" />
            </svg>
            Show on map
          </Link>
        )}
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
          onChange={(v) => setView(v as View)}
          options={[
            { value: "chart", label: "Graph" },
            { value: "table", label: "Table" },
          ]}
        />
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
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
      {recordGroups.length > 0 && (
        <section
          aria-labelledby="all-time-records-heading"
          className="rounded-lg border border-black/10 p-4 dark:border-white/10"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="all-time-records-heading" className="text-sm font-semibold">
              All-time records
            </h2>
            <Link
              href="/historical-values"
              className="inline-flex items-center gap-1 rounded-full border border-black/15 px-2.5 py-1 text-xs text-black/60 transition-colors hover:border-black/30 hover:text-black dark:border-white/15 dark:text-white/60 dark:hover:border-white/30 dark:hover:text-white"
            >
              Why these values can differ
              <span aria-hidden="true">?</span>
            </Link>
          </div>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            {recordGroups.map((group) => (
              <RecordGroup
                key={group.parameter}
                parameter={group.parameter}
                records={group.records}
              />
            ))}
          </div>
        </section>
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

      {status === "ready" &&
        (provisionalHighReadings.length > 0 || provisionalLowReadings.length > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full border border-orange-300 bg-orange-50 px-2.5 py-1 font-medium text-orange-800 dark:border-orange-700 dark:bg-orange-950/40 dark:text-orange-200">
            Provisional new record
          </span>
          <span className="text-black/55 dark:text-white/55">
            {formatProvisionalRecordSummary(
              provisionalLowReadings.length,
              provisionalHighReadings.length,
              historicalThroughYear
            )}
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

function RecordGroup({
  parameter,
  records,
}: {
  parameter: Parameter;
  records: StationRecord[];
}) {
  const unit = parameter === "level" ? "m" : "m³/s";
  const label = parameter === "level" ? "Water level" : "Flow rate";

  return (
    <div>
      <h3 className="text-xs font-medium text-black/60 dark:text-white/60">{label}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        {(["minimum", "maximum"] as const).map((recordType) => {
          const record = records.find((item) => item.recordType === recordType);
          if (!record) return null;

          return (
            <div key={recordType} className="rounded-md bg-black/[0.03] p-3 dark:bg-white/[0.05]">
              <dt className="text-xs capitalize text-black/50 dark:text-white/50">
                {recordType}
              </dt>
              <dd className="mt-1 text-sm font-medium tabular-nums">
                {formatValue(record.value, unit)}
              </dd>
              <dd className="mt-0.5 text-xs text-black/50 dark:text-white/50">
                {formatRecordDate(record.observedAt)}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function formatRecordDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-CA", {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "America/Vancouver",
  });
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
    return `Published maximum${formatReferenceYears(point.historicalStartYear, point.historicalThroughYear)}${formatOccurrenceDate(point.historicalMaxDate)}`;
  }
  if (name === "historicalMin") {
    return `Published minimum${formatReferenceYears(point.historicalStartYear, point.historicalThroughYear)}${formatOccurrenceDate(point.historicalMinDate)}`;
  }
  if (point.historicalMax != null && point.value > point.historicalMax) {
    return `${parameter === "level" ? "Water level" : "Flow rate"} — Provisional new record high`;
  }
  if (point.historicalMin != null && point.value < point.historicalMin) {
    return `${parameter === "level" ? "Water level" : "Flow rate"} — Provisional new record low`;
  }
  return parameter === "level" ? "Water level" : "Flow rate";
}

function formatProvisionalRecordSummary(
  lowCount: number,
  highCount: number,
  historicalThroughYear: number | null | undefined
): string {
  const referencePeriod = historicalThroughYear ? ` through ${historicalThroughYear}` : "";
  const summaries: string[] = [];

  if (lowCount > 0) {
    summaries.push(
      `${lowCount} provisional daily mean${lowCount === 1 ? " falls" : "s fall"} below the published minimum${referencePeriod}`
    );
  }
  if (highCount > 0) {
    summaries.push(
      `${highCount} provisional daily mean${highCount === 1 ? " exceeds" : "s exceed"} the published maximum${referencePeriod}`
    );
  }

  return `${summaries.join("; ")}.`;
}

function formatReferenceYears(
  startYear: number | null | undefined,
  throughYear: number | null | undefined
): string {
  if (startYear && throughYear) return ` (${startYear} through ${throughYear})`;
  if (throughYear) return ` (through ${throughYear})`;
  return "";
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
