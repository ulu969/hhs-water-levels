"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import Link from "next/link";
import type { Station } from "@/lib/types";
import { getConditionInfo } from "@/lib/conditions";

const NEUTRAL_DOT_COLOR = "#78716c";

function conditionDivIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="display:block;width:16px;height:16px;border-radius:9999px;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.4)"></span>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
    popupAnchor: [0, -8],
  });
}

export default function StationMap({ stations }: { stations: Station[] }) {
  // page.tsx only passes stations with known coordinates, so the `!` below is safe.
  const bounds = stations.map((s) => [s.latitude!, s.longitude!] as [number, number]);

  return (
    <MapContainer
      bounds={bounds}
      boundsOptions={{ padding: [40, 40] }}
      scrollWheelZoom
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      {stations.map((s) => {
        const conditionInfo = getConditionInfo(s.currentCondition);
        return (
          <Marker
            key={s.code}
            position={[s.latitude!, s.longitude!]}
            icon={conditionDivIcon(conditionInfo?.dotColor ?? NEUTRAL_DOT_COLOR)}
          >
            <Popup>
              <p className="font-medium">{s.name}</p>
              <p className="text-xs text-black/60">{s.waterbody}</p>
              {conditionInfo && <p className="text-xs text-black/60">{conditionInfo.label}</p>}
              <Link href={`/station/${s.code}`} className="text-xs underline">
                View details &rarr;
              </Link>
            </Popup>
          </Marker>
        );
      })}
    </MapContainer>
  );
}
