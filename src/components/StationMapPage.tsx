"use client";

import dynamic from "next/dynamic";
import type { Station } from "@/lib/types";

const StationMap = dynamic(() => import("./StationMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-black/50 dark:text-white/50">
      Loading map&hellip;
    </div>
  ),
});

export default function StationMapPage({
  stations,
  selectedStationCode,
}: {
  stations: Station[];
  selectedStationCode?: string;
}) {
  return <StationMap stations={stations} selectedStationCode={selectedStationCode} />;
}
