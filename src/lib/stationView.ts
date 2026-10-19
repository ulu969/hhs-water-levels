import type { Parameter } from "./types";

// The station page's chart choices, kept in the URL so a refresh keeps them
// and a link like /station/08MG013?p=flow&range=7d&view=table can be shared.

export const RANGES = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "1y", label: "Last year" },
] as const;

export type Range = (typeof RANGES)[number]["value"];
export type View = "chart" | "table";

export interface StationView {
  parameter: Parameter;
  range: Range;
  view: View;
}

type SearchParams = Record<string, string | string[] | undefined>;

export function defaultStationView(availability: {
  hasLevelData: boolean;
  hasFlowData: boolean;
}): StationView {
  return {
    parameter: !availability.hasLevelData && availability.hasFlowData ? "flow" : "level",
    range: "1y",
    view: "chart",
  };
}

// Unknown or missing values fall back to the defaults rather than erroring, so
// an old or hand-edited link still opens the page.
export function parseStationView(
  params: SearchParams,
  availability: { hasLevelData: boolean; hasFlowData: boolean }
): StationView {
  const defaults = defaultStationView(availability);
  const p = first(params.p);
  const range = first(params.range);
  const view = first(params.view);

  return {
    parameter:
      (p === "level" && availability.hasLevelData) || (p === "flow" && availability.hasFlowData)
        ? p
        : defaults.parameter,
    range: RANGES.some((r) => r.value === range) ? (range as Range) : defaults.range,
    view: view === "chart" || view === "table" ? view : defaults.view,
  };
}

// Query string for a view, leaving out anything at its default so the plain
// station URL stays clean. Returns "" when everything is default.
export function stationViewQuery(view: StationView, defaults: StationView): string {
  const params = new URLSearchParams();
  if (view.parameter !== defaults.parameter) params.set("p", view.parameter);
  if (view.range !== defaults.range) params.set("range", view.range);
  if (view.view !== defaults.view) params.set("view", view.view);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
