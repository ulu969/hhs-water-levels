import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatNextUpdate, formatRelativeTime, formatValue, isStale } from "@/lib/format";
import { todayInBC } from "@/lib/config";

const NOW = new Date("2026-10-18T20:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe("format helpers", () => {
  it("formats values to two decimals with the unit", () => {
    expect(formatValue(10.1, "m")).toBe("10.10 m");
  });

  it("describes relative times", () => {
    expect(formatRelativeTime(minutesAgo(0))).toBe("just now");
    expect(formatRelativeTime(minutesAgo(12))).toBe("12 min ago");
    expect(formatRelativeTime(minutesAgo(180))).toBe("3 hr ago");
    expect(formatRelativeTime(minutesAgo(60 * 24))).toBe("1 day ago");
    expect(formatRelativeTime(minutesAgo(60 * 72))).toBe("3 days ago");
  });

  it("uses a 90-minute default stale threshold", () => {
    expect(isStale(minutesAgo(89))).toBe(false);
    expect(isStale(minutesAgo(91))).toBe(true);
    expect(isStale(minutesAgo(91), 120)).toBe(false);
  });

  it("describes when the next ingest is due", () => {
    expect(formatNextUpdate(null, 5)).toBe("not started yet");
    expect(formatNextUpdate(minutesAgo(2), 5)).toBe("in 3 min");
    expect(formatNextUpdate(minutesAgo(5), 5)).toBe("due any moment");
    expect(formatNextUpdate(minutesAgo(12), 5)).toBe("overdue by 7 min");
  });
});

describe("todayInBC", () => {
  it("uses the BC date, not the UTC date, in the evening", () => {
    // 2026-10-19 03:00 UTC is still Oct 18 at 8 pm in BC (UTC-7).
    vi.setSystemTime(new Date("2026-10-19T03:00:00Z"));
    expect(todayInBC()).toEqual({ month: 10, day: 18 });
  });

  it("stays on UTC-7 in winter (permanent PDT)", () => {
    vi.setSystemTime(new Date("2027-01-15T07:30:00Z"));
    expect(todayInBC()).toEqual({ month: 1, day: 15 });
  });
});
