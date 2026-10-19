export type Parameter = "level" | "flow";

export type Resolution = "raw" | "hourly" | "daily" | "monthly";

export interface Station {
  code: string;
  name: string;
  waterbody: string;
  latitude: number | null;
  longitude: number | null;
  currentCondition: string | null;
  currentConditionUpdatedAt: string | null;
  currentLevelCondition: string | null;
  currentLevelConditionUpdatedAt: string | null;
}

export interface Reading {
  observedAt: string;
  value: number;
  unit: string;
}

// The newest reading plus how far it has moved over the previous 24 hours.
// change24h is null when there's no reading from about a day earlier.
export interface LatestReading extends Reading {
  change24h: number | null;
}

export interface Threshold {
  parameter: Parameter;
  label: string;
  value: number;
  unit: string;
  notes: string | null;
}

export interface LatestReadings {
  level: Reading | null;
  flow: Reading | null;
}

export interface StationRecord {
  parameter: Parameter;
  recordType: "maximum" | "minimum";
  value: number;
  observedAt: string;
}
