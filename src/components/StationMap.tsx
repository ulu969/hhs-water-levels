"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import Link from "next/link";
import type { Station } from "@/lib/types";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png",
});

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
      {stations.map((s) => (
        <Marker key={s.code} position={[s.latitude!, s.longitude!]}>
          <Popup>
            <p className="font-medium">{s.name}</p>
            <p className="text-xs text-black/60">{s.waterbody}</p>
            <Link href={`/station/${s.code}`} className="text-xs underline">
              View details &rarr;
            </Link>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
