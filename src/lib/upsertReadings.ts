import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { FetchedReading } from "./eccc";

// Bulk upsert via unnest — one round trip regardless of row count, safe to
// call repeatedly since (station_code, parameter, observed_at) is unique and
// conflicts are silently skipped.
export async function upsertReadings(
  sql: NeonQueryFunction<false, false>,
  readings: FetchedReading[]
): Promise<number> {
  if (readings.length === 0) return 0;

  const stationCodes = readings.map((r) => r.stationCode);
  const parameters = readings.map((r) => r.parameter);
  const values = readings.map((r) => r.value);
  const units = readings.map((r) => r.unit);
  const observedAts = readings.map((r) => r.observedAt);

  const inserted = await sql`
    INSERT INTO readings (station_code, parameter, value, unit, observed_at)
    SELECT * FROM unnest(
      ${stationCodes}::text[],
      ${parameters}::text[],
      ${values}::float8[],
      ${units}::text[],
      ${observedAts}::timestamptz[]
    )
    ON CONFLICT (station_code, parameter, observed_at) DO NOTHING
    RETURNING 1
  `;

  return inserted.length;
}
