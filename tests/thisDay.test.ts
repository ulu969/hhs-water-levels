import { describe, expect, it } from "vitest";
import { ordinal, provisionalYears, rankForDate, rankPhrase } from "@/lib/thisDay";

const years = (...values: number[]) =>
  values.map((value, i) => ({ year: 2000 + i, value, provisional: false }));

describe("rankForDate", () => {
  it("ranks today's reading from the bottom and the top", () => {
    const r = rankForDate(5, years(1, 2, 3, 7, 9))!;
    expect(r.total).toBe(6);
    expect(r.lowestRank).toBe(4);
    expect(r.highestRank).toBe(3);
    expect(r.tied).toBe(false);
    expect(r.min).toEqual({ year: 2000, value: 1, provisional: false });
    expect(r.max).toEqual({ year: 2004, value: 9, provisional: false });
    expect(r.firstYear).toBe(2000);
  });

  it("shares the better rank on a tie at the shown precision", () => {
    const r = rankForDate(3.001, years(1, 3, 5))!;
    expect(r.tied).toBe(true);
    expect(r.lowestRank).toBe(2);
    expect(r.highestRank).toBe(2);
  });

  it("flags a new low or high for the date", () => {
    expect(rankForDate(0.5, years(1, 2))!.isNewLow).toBe(true);
    expect(rankForDate(0.5, years(1, 2))!.lowestRank).toBe(1);
    expect(rankForDate(3, years(1, 2))!.isNewHigh).toBe(true);
    expect(rankForDate(1, years(1, 2))!.isNewLow).toBe(false);
  });

  it("returns null with no history", () => {
    expect(rankForDate(5, [])).toBeNull();
  });
});

describe("ordinal and rankPhrase", () => {
  it("uses the right suffix", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st", "111th",
    ]);
  });

  it("reads naturally", () => {
    expect(rankPhrase(1, "lowest", false)).toBe("the lowest");
    expect(rankPhrase(4, "highest", false)).toBe("the 4th highest");
    expect(rankPhrase(4, "lowest", true)).toBe("tied for 4th lowest");
    expect(rankPhrase(1, "highest", true)).toBe("tied for highest");
  });
});

describe("provisionalYears", () => {
  it("fills the years after the approved record, up to two back", () => {
    expect(provisionalYears(2024, 2026, 11, 6)).toEqual([2025]);
    expect(provisionalYears(2020, 2026, 11, 6)).toEqual([2024, 2025]);
    expect(provisionalYears(null, 2026, 11, 6)).toEqual([2024, 2025]);
    expect(provisionalYears(2025, 2026, 11, 6)).toEqual([]);
  });

  it("skips Feb 29 in non-leap years", () => {
    expect(provisionalYears(2020, 2026, 2, 29)).toEqual([2024]);
  });
});
