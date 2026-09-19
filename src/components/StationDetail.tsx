"use client";

import { useEffect, useMemo, useState } from "react";
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
import type { Parameter, Resolution, Station, Threshold } from "@/lib/types";
import { formatRelativeTime, formatTimestamp, formatValue } from "@/lib/format";
import { getConditionInfo } from "@/lib/conditions";

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
}

export default function StationDetail({
  station,
  thresholds,
}: {
  station: Station;
  thresholds: Threshold[];
}) {
  const [parameter, setParameter] = useState<Parameter>("level");
  const [range, setRange] = useState("24h");
  const [view, setView] = useState<"chart" | "table">("chart");
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
  const conditionInfo = getConditionInfo(station.currentCondition);

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

      {parameter === "flow" && conditionInfo && (
        <p>
          <span className={`inline-block rounded-full px-2.5 py-1 text-xs ${conditionInfo.badgeClass}`}>
            {conditionInfo.label}
          </span>
          {station.currentConditionUpdatedAt && (
            <span className="ml-2 text-xs text-black/40 dark:text-white/40">
              as of {formatRelativeTime(station.currentConditionUpdatedAt)}
            </span>
          )}
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
                labelFormatter={(t) => formatTimestamp(new Date(t as number).toISOString())}
                formatter={(value) => [formatValue(Number(value), unit), parameter === "level" ? "Level" : "Flow"]}
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
              <Line
                type="monotone"
                dataKey="value"
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
