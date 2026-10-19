import { describe, expect, it } from "vitest";
import { defaultStationView, parseStationView, stationViewQuery } from "@/lib/stationView";

const both = { hasLevelData: true, hasFlowData: true };
const flowOnly = { hasLevelData: false, hasFlowData: true };

describe("parseStationView", () => {
  it("uses the defaults with no params", () => {
    expect(parseStationView({}, both)).toEqual({ parameter: "level", range: "1y", view: "chart" });
  });

  it("reads all three choices", () => {
    expect(parseStationView({ p: "flow", range: "7d", view: "table" }, both)).toEqual({
      parameter: "flow",
      range: "7d",
      view: "table",
    });
  });

  it("ignores values it doesn't know", () => {
    expect(parseStationView({ p: "temp", range: "5y", view: "pie" }, both)).toEqual(
      defaultStationView(both)
    );
  });

  it("won't open a parameter the station has no data for", () => {
    expect(parseStationView({ p: "level" }, flowOnly).parameter).toBe("flow");
  });

  it("takes the first of repeated params", () => {
    expect(parseStationView({ range: ["24h", "7d"] }, both).range).toBe("24h");
  });
});

describe("stationViewQuery", () => {
  it("is empty when everything is default", () => {
    expect(stationViewQuery(defaultStationView(both), defaultStationView(both))).toBe("");
  });

  it("includes only the non-default choices", () => {
    expect(
      stationViewQuery({ parameter: "flow", range: "1y", view: "table" }, defaultStationView(both))
    ).toBe("?p=flow&view=table");
  });

  it("round-trips through parseStationView", () => {
    const view = { parameter: "flow", range: "7d", view: "table" } as const;
    const query = stationViewQuery(view, defaultStationView(both));
    const params = Object.fromEntries(new URLSearchParams(query));
    expect(parseStationView(params, both)).toEqual(view);
  });
});
