import { describe, expect, it } from "vitest";
import { parseDailyDataCsv } from "@/lib/dailyHistory";

const HEADER = "ID,Date,Parameter/Paramètre,Value/Valeur,Symbol/Symbole";

describe("parseDailyDataCsv", () => {
  it("splits each date into year, month and day for the requested parameter", () => {
    const csv = [
      HEADER,
      "08MG012,1951-11-06,water level,9.874,",
      "08MG012,1951-11-06,discharge,412,B",
      "08MG012,2024-02-29,water level,10.2,E",
    ].join("\r\n");

    expect(parseDailyDataCsv(csv, "level")).toEqual([
      { stationCode: "08MG012", parameter: "level", year: 1951, month: 11, day: 6, value: 9.874 },
      { stationCode: "08MG012", parameter: "level", year: 2024, month: 2, day: 29, value: 10.2 },
    ]);
    expect(parseDailyDataCsv(csv, "flow")).toEqual([
      { stationCode: "08MG012", parameter: "flow", year: 1951, month: 11, day: 6, value: 412 },
    ]);
  });

  it("skips blank values, non-numeric values and malformed lines", () => {
    const csv = [
      HEADER,
      "08MG012,1951-11-07,water level,,",
      "08MG012,1951-11-08,water level,abc,",
      "",
      "08MG012,not-a-date,water level,9.9,",
      "08MG012,1951-11-09,water level,9.9,",
    ].join("\n");

    expect(parseDailyDataCsv(csv, "level")).toEqual([
      { stationCode: "08MG012", parameter: "level", year: 1951, month: 11, day: 9, value: 9.9 },
    ]);
  });

  it("returns nothing for a header-only response", () => {
    expect(parseDailyDataCsv(HEADER, "level")).toEqual([]);
  });
});
