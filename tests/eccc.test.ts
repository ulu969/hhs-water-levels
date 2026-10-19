import { describe, expect, it } from "vitest";
import { parseCsv } from "@/lib/eccc";

const HEADER =
  "ID,Date,Parameter/Paramètre,Value/Valeur,Qualifier/Qualificatif,Symbol/Symbole,Approval/Approbation,Grade/Classification,Qualifiers/Qualificatifs";

describe("parseCsv", () => {
  it("maps real-time and daily-mean parameter codes to level and flow", () => {
    const csv = [
      HEADER,
      "08MG012,2026-10-18T10:00:00-07:00,46,10.123,,,Provisional,,",
      "08MF005,2026-10-18T10:00:00-07:00,47,1520,,,Provisional,,",
      "08MG012,2026-10-17,3,10.05,,,Provisional,,",
      "08MF005,2026-10-17,6,1499.5,,,Provisional,,",
    ].join("\r\n");

    expect(parseCsv(csv)).toEqual([
      { stationCode: "08MG012", parameter: "level", value: 10.123, unit: "m", observedAt: "2026-10-18T10:00:00-07:00" },
      { stationCode: "08MF005", parameter: "flow", value: 1520, unit: "m³/s", observedAt: "2026-10-18T10:00:00-07:00" },
      { stationCode: "08MG012", parameter: "level", value: 10.05, unit: "m", observedAt: "2026-10-17" },
      { stationCode: "08MF005", parameter: "flow", value: 1499.5, unit: "m³/s", observedAt: "2026-10-17" },
    ]);
  });

  it("skips unknown parameters, blank lines and non-numeric values", () => {
    const csv = [
      HEADER,
      "08MG012,2026-10-18T10:00:00-07:00,5,12.0,,,,,",
      "",
      "08MG012,2026-10-18T10:05:00-07:00,46,abc,,,,,",
      "08MG012,2026-10-18T10:10:00-07:00,46,10.2,,,,,",
    ].join("\n");

    const readings = parseCsv(csv);
    expect(readings).toHaveLength(1);
    expect(readings[0].observedAt).toBe("2026-10-18T10:10:00-07:00");
  });

  it("returns nothing for a header-only response", () => {
    expect(parseCsv(HEADER)).toEqual([]);
  });
});
