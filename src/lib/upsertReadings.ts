import type { Sql } from "./postgres";
import type { FetchedReading } from "./eccc";

// Bulk upsert via unnest — one round trip regardless of row count, safe to
// call repeatedly since (station_code, parameter, observed_at) is unique.
// ECCC revises provisional values after the fact, so a conflicting row takes
// the newer value; unchanged rows are left alone and not counted.
export async function upsertReadings(
  sql: Sql,
  readings: FetchedReading[]
): Promise<{ inserted: number; updated: number }> {
  // DO UPDATE fails if one statement touches the same row twice, so collapse
  // any duplicate keys in the batch first (the last value wins).
  const unique = [
    ...new Map(
      readings.map((r) => [`${r.stationCode}|${r.parameter}|${r.observedAt}`, r])
    ).values(),
  ];
  if (unique.length === 0) return { inserted: 0, updated: 0 };

  const stationCodes = unique.map((r) => r.stationCode);
  const parameters = unique.map((r) => r.parameter);
  const values = unique.map((r) => r.value);
  const units = unique.map((r) => r.unit);
  const observedAts = unique.map((r) => r.observedAt);

  const rows = await sql`
    INSERT INTO readings (station_code, parameter, value, unit, observed_at)
    SELECT * FROM unnest(
      ${stationCodes}::text[],
      ${parameters}::text[],
      ${values}::float8[],
      ${units}::text[],
      ${observedAts}::timestamptz[]
    )
    ON CONFLICT (station_code, parameter, observed_at) DO UPDATE
      SET value = EXCLUDED.value
      WHERE readings.value IS DISTINCT FROM EXCLUDED.value
    RETURNING (xmax = 0) AS inserted
  `;

  const insertedCount = rows.filter((r) => r.inserted).length;
  return { inserted: insertedCount, updated: rows.length - insertedCount };
}
