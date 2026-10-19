// Fills in station coordinates from ECCC's map_data feed, the same feed the
// ingest job reads current conditions from. db/schema.sql seeds each
// station's code, name and waterbody; this adds latitude and longitude so the
// station shows on the map. Safe to re-run.
//
// Usage: npm run seed-stations

import { createSql, databaseUrl } from "../src/lib/postgres";
import { STATION_CODES } from "../src/lib/stations";

if (!databaseUrl()) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // fall through — env vars may already be set (e.g. in CI)
  }
}

type MapDataStation = Record<string, unknown> & { station_id: string };

function coordinate(station: MapDataStation, keys: string[]): number | null {
  for (const key of keys) {
    const value = Number(station[key]);
    if (station[key] != null && Number.isFinite(value)) return value;
  }
  return null;
}

async function main() {
  const res = await fetch("https://wateroffice.ec.gc.ca/services/map_data?data_type=real_time");
  if (!res.ok) throw new Error(`ECCC map_data request failed: ${res.status}`);
  const data = (await res.json()) as MapDataStation[];

  const codes = new Set<string>(STATION_CODES);
  const found = data
    .filter((s) => codes.has(s.station_id))
    .map((s) => ({
      code: s.station_id,
      latitude: coordinate(s, ["latitude", "lat", "LATITUDE"]),
      longitude: coordinate(s, ["longitude", "lon", "lng", "LONGITUDE"]),
    }))
    .filter((s) => s.latitude != null && s.longitude != null);

  const sql = createSql(databaseUrl()!, { max: 1 });
  for (const s of found) {
    await sql`
      UPDATE stations SET latitude = ${s.latitude}, longitude = ${s.longitude}
      WHERE code = ${s.code}
    `;
    console.log(`  ${s.code}: ${s.latitude}, ${s.longitude}`);
  }
  await sql.end();

  const missing = STATION_CODES.filter((code) => !found.some((s) => s.code === code));
  console.log(`Set coordinates for ${found.length} of ${STATION_CODES.length} stations.`);
  if (missing.length > 0) {
    const sample = data.find((s) => codes.has(s.station_id));
    console.error(`No coordinates found for: ${missing.join(", ")}`);
    if (sample) console.error(`Fields on a matching map_data entry: ${Object.keys(sample).join(", ")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
