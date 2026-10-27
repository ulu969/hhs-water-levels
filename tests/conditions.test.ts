import { describe, expect, it } from "vitest";
import {
  classifyByPercentile,
  getConditionInfo,
  isConditionUnavailable,
  isHighCondition,
  isLowCondition,
  isOutOfRange,
} from "@/lib/conditions";

const band = { p0: 1, p10: 2, p90: 8, p100: 10 };

describe("classifyByPercentile", () => {
  it.each([
    [0.5, "ALL_TIME_LOW"],
    [1, "ALL_TIME_LOW"],
    [1.5, "MUCH_BELOW_NORMAL"],
    [2, "NORMAL"],
    [5, "NORMAL"],
    [8, "NORMAL"],
    [9, "MUCH_ABOVE_NORMAL"],
    [10, "ALL_TIME_HIGH"],
    [12, "ALL_TIME_HIGH"],
  ])("classifies %s as %s", (value, expected) => {
    expect(classifyByPercentile(value, band)).toBe(expected);
  });
});

describe("condition helpers", () => {
  it("treats no-data and stale codes as unavailable", () => {
    for (const code of [null, undefined, "", "NO_LEVEL_DATA", "NO_DISCHARGE_DATA", "STALE_DATA"]) {
      expect(isConditionUnavailable(code)).toBe(true);
    }
    expect(isConditionUnavailable("NORMAL")).toBe(false);
  });

  it("flags only the red and yellow tiers as out of range", () => {
    expect(isOutOfRange("ALL_TIME_HIGH")).toBe(true);
    expect(isOutOfRange("MUCH_BELOW_NORMAL")).toBe(true);
    expect(isOutOfRange("ABOVE_NORMAL")).toBe(false);
    expect(isOutOfRange("STALE_DATA")).toBe(false);
  });

  it("falls back to Unknown for codes ECCC might add later", () => {
    expect(getConditionInfo("SOMETHING_NEW")?.label).toBe("Unknown");
    expect(getConditionInfo(null)).toBeNull();
  });
});

describe("isHighCondition / isLowCondition", () => {
  it.each([
    ["ALL_TIME_HIGH", true, false],
    ["MUCH_ABOVE_NORMAL", true, false],
    ["ABOVE_NORMAL", false, false],
    ["NORMAL", false, false],
    ["BELOW_NORMAL", false, false],
    ["MUCH_BELOW_NORMAL", false, true],
    ["ALL_TIME_LOW", false, true],
    ["STALE_DATA", false, false],
    [null, false, false],
  ])("%s → high %s, low %s", (code, high, low) => {
    expect(isHighCondition(code)).toBe(high);
    expect(isLowCondition(code)).toBe(low);
  });
});
