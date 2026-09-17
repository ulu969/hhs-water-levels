export function formatValue(value: number, unit: string): string {
  return `${value.toFixed(2)} ${unit}`;
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
