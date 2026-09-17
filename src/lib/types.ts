export type Parameter = "level" | "flow";

export type Resolution = "raw" | "hourly" | "daily" | "monthly";

export interface Station {
  code: string;
  name: string;
  waterbody: string;
  latitude: number | null;
  longitude: number | null;
}

export interface Reading {
  observedAt: string;
  value: number;
  unit: string;
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
