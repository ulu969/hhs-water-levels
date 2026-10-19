import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { flowCondition, levelCondition } from "@/lib/queries";

const NOW = new Date("2026-10-18T20:00:00Z");
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const band = { p0: 1, p10: 2, p90: 8, p100: 10 };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("levelCondition", () => {
  it("ranks a recent reading against the band", () => {
    expect(levelCondition({ value: 9, unit: "m", observedAt: hoursAgo(1) }, band)).toBe(
      "MUCH_ABOVE_NORMAL"
    );
  });

  it("still ranks a reading a couple of hours late", () => {
    expect(levelCondition({ value: 5, unit: "m", observedAt: hoursAgo(5) }, band)).toBe("NORMAL");
  });

  it("withholds the ranking once the reading is over 6 hours old", () => {
    expect(levelCondition({ value: 5, unit: "m", observedAt: hoursAgo(7) }, band)).toBe(
      "STALE_DATA"
    );
  });

  it("reports no data without a reading or a complete band", () => {
    expect(levelCondition(null, band)).toBe("NO_LEVEL_DATA");
    expect(
      levelCondition({ value: 5, unit: "m", observedAt: hoursAgo(1) }, { ...band, p90: null })
    ).toBe("NO_LEVEL_DATA");
  });
});

describe("flowCondition", () => {
  const recentFlow = { value: 1500, unit: "m³/s", observedAt: hoursAgo(1) };

  it("passes ECCC's ranking through when everything is current", () => {
    expect(flowCondition("BELOW_NORMAL", hoursAgo(0.1), recentFlow)).toBe("BELOW_NORMAL");
  });

  it("passes NO_DISCHARGE_DATA and null through unchanged", () => {
    expect(flowCondition("NO_DISCHARGE_DATA", hoursAgo(48), null)).toBe("NO_DISCHARGE_DATA");
    expect(flowCondition(null, null, recentFlow)).toBeNull();
  });

  it("marks the ranking stale when the flow reading is old", () => {
    expect(
      flowCondition("NORMAL", hoursAgo(0.1), { ...recentFlow, observedAt: hoursAgo(7) })
    ).toBe("STALE_DATA");
  });

  it("marks the ranking stale when ECCC hasn't refreshed it", () => {
    expect(flowCondition("NORMAL", hoursAgo(7), recentFlow)).toBe("STALE_DATA");
  });

  it("marks the ranking stale when there is no flow reading at all", () => {
    expect(flowCondition("NORMAL", hoursAgo(0.1), null)).toBe("STALE_DATA");
  });
});
