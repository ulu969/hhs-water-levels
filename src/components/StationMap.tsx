"use client";

import "leaflet/dist/leaflet.css";
import { useState } from "react";
import L from "leaflet";
import { MapContainer, Marker, TileLayer, Tooltip } from "react-leaflet";
import Link from "next/link";
import type { Station } from "@/lib/types";
import { CONDITION_INFO, getConditionInfo, isConditionUnavailable } from "@/lib/conditions";

type MapDataSet = "flow" | "level";

const NEUTRAL_DOT_COLOR = "#78716c";
const LEGEND_ITEMS = [
  {
    color: CONDITION_INFO.ALL_TIME_HIGH.dotColor,
    label: "All-time high or low",
  },
  {
    color: CONDITION_INFO.MUCH_ABOVE_NORMAL.dotColor,
    label: "Much above or below normal",
  },
  {
    color: CONDITION_INFO.NORMAL.dotColor,
    label: "Normal or no extreme condition",
  },
  {
    color: NEUTRAL_DOT_COLOR,
    label: "Condition unavailable",
  },
] as const;

function conditionDivIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export default function StationMap({
  stations,
  selectedStationCode,
}: {
  stations: Station[];
  selectedStationCode?: string;
}) {
  const [dataSet, setDataSet] = useState<MapDataSet>("level");
  const [hoveredStationCode, setHoveredStationCode] = useState<string | null>(null);
  // Phones and tablets can't hover, so a tap on a marker pins its status open.
  // A station opened from its "Show on map" link starts pinned.
  const [pinnedStationCode, setPinnedStationCode] = useState<string | null>(
    selectedStationCode ?? null
  );
  const activeStationCode = hoveredStationCode ?? pinnedStationCode;
  // page.tsx only passes stations with known coordinates, so the `!` below is safe.
  const bounds = stations.map((s) => [s.latitude!, s.longitude!] as [number, number]);
  const selectedStation = stations.find((station) => station.code === selectedStationCode);
  const viewport = selectedStation
    ? {
        center: [selectedStation.latitude!, selectedStation.longitude!] as [number, number],
        zoom: 13,
      }
    : { bounds, boundsOptions: { padding: [40, 40] as [number, number] } };

  return (
    <div className="relative h-full w-full">
      <MapContainer
        {...viewport}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        {stations.map((s) => {
          const conditionCode =
            dataSet === "flow" ? s.currentCondition : s.currentLevelCondition;
          const conditionUnavailable = isConditionUnavailable(conditionCode);
          const conditionInfo = conditionUnavailable ? null : getConditionInfo(conditionCode);
          const conditionLabel = conditionInfo?.label ?? "Condition unavailable";
          const dataSetLabel = dataSet === "flow" ? "Flow rate" : "Water level";
          return (
            <Marker
              key={`${dataSet}-${s.code}`}
              position={[s.latitude!, s.longitude!]}
              icon={conditionDivIcon(conditionInfo?.dotColor ?? NEUTRAL_DOT_COLOR)}
              title={`${s.name}: ${conditionLabel}`}
              eventHandlers={{
                mouseover: () => setHoveredStationCode(s.code),
                mouseout: () => setHoveredStationCode(null),
                // Touch browsers send a mouseover with the tap and never a
                // mouseout, so clear the hover too or a second tap can't close it.
                click: () => {
                  setHoveredStationCode(null);
                  setPinnedStationCode((current) => (current === s.code ? null : s.code));
                },
              }}
            >
              <Tooltip
                permanent
                interactive
                direction="right"
                offset={[10, 0]}
                className="station-map-label"
              >
                <Link
                  href={`/station/${encodeURIComponent(s.code)}`}
                  aria-label={`Open ${s.name} station page`}
                  className="station-map-label-link"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="station-map-label-name">
                    {s.name}
                    <span className="station-map-label-action" aria-hidden="true">
                      &rarr;
                    </span>
                  </span>
                  {activeStationCode === s.code && (
                    <span className="mt-0.5 block font-normal text-black/65">
                      {dataSetLabel} status: {conditionLabel}
                    </span>
                  )}
                </Link>
              </Tooltip>
            </Marker>
          );
        })}
      </MapContainer>
      <div
        role="group"
        aria-label="Map data set"
        className="absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 rounded-md border border-black/10 bg-background/95 p-1 text-xs text-foreground shadow-md dark:border-white/15"
      >
        {(["flow", "level"] as const).map((option) => {
          const selected = dataSet === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => {
                setDataSet(option);
                setHoveredStationCode(null);
              }}
              className={`rounded px-2.5 py-1.5 font-medium transition-colors ${
                selected
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "text-black/60 hover:bg-black/5 hover:text-black dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
              }`}
            >
              {option === "flow" ? "Flow rate" : "Water level"}
            </button>
          );
        })}
      </div>
      <aside
        aria-label={`${dataSet === "flow" ? "Flow rate" : "Water level"} marker colour legend`}
        className="pointer-events-none absolute right-3 top-3 z-[1000] rounded-md border border-black/10 bg-background/95 px-3 py-2 text-foreground shadow-md dark:border-white/15"
      >
        <h2 className="text-xs font-semibold">
          {dataSet === "flow" ? "Flow rate" : "Water level"} marker colours
        </h2>
        <ul className="mt-1.5 space-y-1">
          {LEGEND_ITEMS.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-[11px] leading-4">
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-full border-2 border-white shadow-sm"
                style={{ backgroundColor: item.color }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
