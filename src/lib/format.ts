export function formatValue(value: number, unit: string): string {
  return `${value.toFixed(2)} ${unit}`;
}

// "+0.18 m in 24 h", "−12.40 m³/s in 24 h", or "Steady over 24 h" when the
// change rounds to zero at the precision shown.
export function formatChange(change: number, unit: string): {
  direction: "up" | "down" | "steady";
  text: string;
} {
  const rounded = Number(change.toFixed(2));
  if (rounded === 0) return { direction: "steady", text: "Steady over 24 h" };
  const sign = rounded > 0 ? "+" : "\u2212";
  return {
    direction: rounded > 0 ? "up" : "down",
    text: `${sign}${Math.abs(rounded).toFixed(2)} ${unit} in 24 h`,
  };
}

export function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString("en-CA", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatRelativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

export function isStale(iso: string, thresholdMinutes = 90): boolean {
  const diffMs = Date.now() - new Date(iso).getTime();
  return diffMs > thresholdMinutes * 60_000;
}

// Given the last successful ingestion run and the fixed polling interval,
// describes when the next one is due.
export function formatNextUpdate(
  lastRunFinishedAt: string | null,
  intervalMinutes: number
): string {
  if (!lastRunFinishedAt) return "not started yet";

  const nextAt = new Date(lastRunFinishedAt).getTime() + intervalMinutes * 60_000;
  const diffMs = nextAt - Date.now();

  if (diffMs <= 0) {
    const overdueMin = Math.round(-diffMs / 60_000);
    return overdueMin < 1 ? "due any moment" : `overdue by ${overdueMin} min`;
  }

  const minutes = Math.round(diffMs / 60_000);
  return minutes < 1 ? "in under a minute" : `in ${minutes} min`;
}
