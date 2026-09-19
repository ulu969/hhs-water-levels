// ECCC's "current conditions" ranking: how the latest discharge compares to
// the historical record for this day of year. Only stations that report
// discharge get a percentile bucket — the rest consistently come back as
// NO_DISCHARGE_DATA (see fetchCurrentConditions in eccc.ts). We render
// whatever ECCC sends, including that category, rather than treating it as
// missing data.
export type ConditionCode =
  | "ALL_TIME_HIGH"
  | "MUCH_ABOVE_NORMAL"
  | "ABOVE_NORMAL"
  | "NORMAL"
  | "BELOW_NORMAL"
  | "MUCH_BELOW_NORMAL"
  | "ALL_TIME_LOW"
  | "NOT_FLOWING"
  | "LACK_OF_STATS"
  | "NO_DISCHARGE_DATA";

export interface ConditionInfo {
  label: string;
  /** Tailwind classes for a text/background badge. */
  badgeClass: string;
  /** Hex color for the map marker dot. */
  dotColor: string;
}

// No "Flow:" text prefix — callers are responsible for placing this badge
// somewhere its meaning is obvious from position (next to the Flow rate
// figure, not floating between it and Water level).
//
// Deliberately a 3-color scheme, not one color per ECCC category: red for
// the two all-time extremes, yellow for the two "much above/below normal"
// extremes, green for the moderate above/below bands and literal "normal"
// (labeled "Normal"). Cases where there's simply no ranking to report — not
// flowing, insufficient history, no discharge data — stay green (none of
// them are a red or yellow flag) but keep their own honest label instead of
// being folded into "Normal", which would overclaim that we checked and
// it's fine.
const RED = {
  badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  dotColor: "#dc2626",
};
const YELLOW = {
  badgeClass: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  dotColor: "#ca8a04",
};
const GREEN = {
  badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  dotColor: "#16a34a",
};

export const CONDITION_INFO: Record<ConditionCode, ConditionInfo> = {
  ALL_TIME_HIGH: { label: "All-time high for this day", ...RED },
  MUCH_ABOVE_NORMAL: { label: "Much above normal", ...YELLOW },
  ABOVE_NORMAL: { label: "Normal", ...GREEN },
  NORMAL: { label: "Normal", ...GREEN },
  BELOW_NORMAL: { label: "Normal", ...GREEN },
  MUCH_BELOW_NORMAL: { label: "Much below normal", ...YELLOW },
  ALL_TIME_LOW: { label: "All-time low for this day", ...RED },
  NOT_FLOWING: { label: "Not flowing", ...GREEN },
  LACK_OF_STATS: { label: "Not ranked — insufficient data", ...GREEN },
  NO_DISCHARGE_DATA: { label: "No discharge data", ...GREEN },
};

const FALLBACK: ConditionInfo = {
  label: "Unknown",
  badgeClass: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
  dotColor: "#78716c",
};

export function getConditionInfo(code: string | null | undefined): ConditionInfo | null {
  if (!code) return null;
  return CONDITION_INFO[code as ConditionCode] ?? FALLBACK;
}
