import Breadcrumbs from "@/components/Breadcrumbs";
import StationMapPage from "@/components/StationMapPage";
import { getStationSnapshots } from "@/lib/queries";
import type { Station } from "@/lib/types";

export const dynamic = "force-dynamic";

async function getMapStations(): Promise<Station[]> {
  const snapshots = await getStationSnapshots();
  return snapshots
    .filter((s) => s.latitude != null && s.longitude != null)
    .sort((a, b) => a.name.localeCompare(b.name))
    // The map only needs the Station fields; don't ship readings to the client.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    .map(({ level, flow, ...station }) => station);
}

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<{ station?: string | string[] }>;
}) {
  const requestedStation = (await searchParams).station;
  const selectedStationCode =
    typeof requestedStation === "string" ? requestedStation : requestedStation?.[0];
  const stations = await getMapStations();

  return (
    <div>
      <Breadcrumbs current="Station Map" />
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Station Map</h1>
        <p className="mt-1 text-sm text-black/60 dark:text-white/60">
          Choose flow rate or water level, then hover over a station marker to see its status.
        </p>
      </div>
      <div className="h-[min(70vh,700px)] min-h-90 overflow-hidden rounded-lg border border-black/10 dark:border-white/10">
        <StationMapPage stations={stations} selectedStationCode={selectedStationCode} />
      </div>
    </div>
  );
}
