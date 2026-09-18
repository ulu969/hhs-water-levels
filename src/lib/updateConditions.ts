import type { NeonQueryFunction } from "@neondatabase/serverless";
import type { FetchedCondition } from "./eccc";

// Bulk update via unnest, same idiom as upsertReadings — one round trip
// regardless of station count.
export async function updateConditions(
  sql: NeonQueryFunction<false, false>,
  conditions: FetchedCondition[]
): Promise<number> {
  if (conditions.length === 0) return 0;

  const stationCodes = conditions.map((c) => c.stationCode);
  const values = conditions.map((c) => c.condition);

  const updated = await sql`
    UPDATE stations AS s
    SET current_condition = v.condition, current_condition_updated_at = now()
    FROM (
      SELECT * FROM unnest(${stationCodes}::text[], ${values}::text[]) AS t(code, condition)
    ) AS v
    WHERE s.code = v.code
    RETURNING 1
  `;

  return updated.length;
}
