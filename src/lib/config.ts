// The ingestion cadence is fixed, not user-configurable: the GitHub Actions
// schedule in .github/workflows/ingest.yml must be kept in sync with this
// value by hand if it ever changes.
export const INGEST_INTERVAL_MINUTES = 5;
