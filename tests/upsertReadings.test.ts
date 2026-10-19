import { describe, expect, it, vi } from "vitest";
import type { Sql } from "@/lib/postgres";
import { upsertReadings } from "@/lib/upsertReadings";
import type { FetchedReading } from "@/lib/eccc";

function reading(observedAt: string, value: number): FetchedReading {
  return { stationCode: "08MG012", parameter: "level", value, unit: "m", observedAt };
}

// Stands in for the tagged-template sql function: records the bound arrays
// and returns the rows the database would.
function fakeSql(rows: { inserted: boolean }[]) {
  // Called as fn(strings, ...values), so calls[0][1..] are the bound values.
  const fn = vi.fn<(...args: unknown[]) => Promise<typeof rows>>(async () => rows);
  return { sql: fn as unknown as Sql, fn };
}

describe("upsertReadings", () => {
  it("skips the database for an empty batch", async () => {
    const { sql, fn } = fakeSql([]);
    expect(await upsertReadings(sql, [])).toEqual({ inserted: 0, updated: 0 });
    expect(fn).not.toHaveBeenCalled();
  });

  it("collapses duplicate keys before the upsert, keeping the last value", async () => {
    const { sql, fn } = fakeSql([{ inserted: true }, { inserted: true }]);
    await upsertReadings(sql, [
      reading("2026-10-18T10:00:00Z", 1),
      reading("2026-10-18T10:05:00Z", 2),
      reading("2026-10-18T10:00:00Z", 3),
    ]);

    const [, codes, , values, , observedAts] = fn.mock.calls[0];
    expect(codes).toHaveLength(2);
    expect(values).toEqual([3, 2]);
    expect(observedAts).toEqual(["2026-10-18T10:00:00Z", "2026-10-18T10:05:00Z"]);
  });

  it("counts inserted and revised rows separately", async () => {
    const { sql } = fakeSql([{ inserted: true }, { inserted: false }, { inserted: false }]);
    const result = await upsertReadings(sql, [
      reading("2026-10-18T10:00:00Z", 1),
      reading("2026-10-18T10:05:00Z", 2),
      reading("2026-10-18T10:10:00Z", 3),
    ]);
    expect(result).toEqual({ inserted: 1, updated: 2 });
  });
});
