// The ingestion cadence is fixed, not user-configurable: the GitHub Actions
// schedule in .github/workflows/ingest.yml must be kept in sync with this
// value by hand if it ever changes.
export const INGEST_INTERVAL_MINUTES = 5;

// BC adopted permanent Pacific Daylight Time (a fixed UTC-7, no more
// seasonal changes) on 2026-03-08 — its last-ever clock change. Verified
// live that Neon's Postgres hasn't caught up: 'America/Vancouver' there
// still resolves January dates to UTC-8, applying the old alternating
// PST/PDT rule. Rather than depend on a named timezone that's currently
// wrong (and permanently unnecessary now that BC will never change again),
// this computes BC's local calendar date directly from a fixed offset.
export function todayInBC(): { month: number; day: number } {
  const bcNow = new Date(Date.now() - 7 * 60 * 60 * 1000);
  return { month: bcNow.getUTCMonth() + 1, day: bcNow.getUTCDate() };
}
