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

export const CONDITION_INFO: Record<ConditionCode, ConditionInfo> = {
  ALL_TIME_HIGH: {
    label: "All-time high for this day",
    badgeClass: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    dotColor: "#991b1b",
  },
  MUCH_ABOVE_NORMAL: {
    label: "Much above normal",
    badgeClass: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300",
    dotColor: "#ea580c",
  },
  ABOVE_NORMAL: {
    label: "Above normal",
    badgeClass: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
    dotColor: "#d97706",
  },
  NORMAL: {
    label: "Normal",
    badgeClass: "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
    dotColor: "#16a34a",
  },
  BELOW_NORMAL: {
    label: "Below normal",
    badgeClass: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
    dotColor: "#0284c7",
  },
  MUCH_BELOW_NORMAL: {
    label: "Much below normal",
    badgeClass: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    dotColor: "#2563eb",
  },
  ALL_TIME_LOW: {
    label: "All-time low for this day",
    badgeClass: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300",
    dotColor: "#4338ca",
  },
  NOT_FLOWING: {
    label: "Not flowing",
    badgeClass: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
    dotColor: "#78716c",
  },
  LACK_OF_STATS: {
    label: "Not ranked — insufficient historical data",
    badgeClass: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
    dotColor: "#78716c",
  },
  NO_DISCHARGE_DATA: {
    label: "No discharge data",
    badgeClass: "bg-black/10 text-black/60 dark:bg-white/10 dark:text-white/60",
    dotColor: "#78716c",
  },
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
