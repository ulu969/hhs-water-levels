import type { Parameter } from "./types";

const BASE_URL = "https://wateroffice.ec.gc.ca/services";

// ECCC parameter codes: 46 = water level (m), 47 = discharge/flow (m³/s).
const PARAMETER_CODES: Record<string, { parameter: Parameter; unit: string }> = {
  "46": { parameter: "level", unit: "m" },
  "47": { parameter: "flow", unit: "m³/s" },
};

export interface FetchedReading {
  stationCode: string;
  parameter: Parameter;
  value: number;
  unit: string;
  observedAt: string;
}

// Parses the CSV format returned by ECCC's recent_real_time_data / real_time_data
// services:
// ID,Date,Parameter/Paramètre,Value/Valeur,Qualifier/Qualificatif,Symbol/Symbole,Approval/Approbation,Grade/Classification,Qualifiers/Qualificatifs
function parseCsv(csv: string): FetchedReading[] {
  const lines = csv.trim().split(/\r?\n/);
  const readings: FetchedReading[] = [];

  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const cols = line.split(",");
    const [stationCode, observedAt, parameterCode, rawValue] = cols;
    const mapping = PARAMETER_CODES[parameterCode];
    if (!mapping) continue;
    const value = Number(rawValue);
    if (!stationCode || !observedAt || Number.isNaN(value)) continue;

    readings.push({
      stationCode,
      parameter: mapping.parameter,
      value,
      unit: mapping.unit,
      observedAt,
    });
  }

  return readings;
}

// Fetches the latest (last ~5 minutes of) readings for the given stations.
// A single request covers every station and both parameters.
export async function fetchRecentReadings(
  stationCodes: readonly string[]
): Promise<FetchedReading[]> {
  const params = new URLSearchParams();
  for (const code of stationCodes) params.append("stations[]", code);
  params.append("parameters[]", "46");
  params.append("parameters[]", "47");

  const url = `${BASE_URL}/recent_real_time_data/csv/inline?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`ECCC recent_real_time_data request failed: ${res.status}`);
  }

  const csv = await res.text();
  return parseCsv(csv);
}

// Fetches a historical range for backfill. ECCC retains ~18 months of unit
// values (level/flow) under this service.
export async function fetchHistoricalReadings(
  stationCodes: readonly string[],
  startDate: Date,
  endDate: Date,
  signal?: AbortSignal
): Promise<FetchedReading[]> {
  const params = new URLSearchParams();
  for (const code of stationCodes) params.append("stations[]", code);
  params.append("parameters[]", "46");
  params.append("parameters[]", "47");
  params.append("start_date", formatEcccDate(startDate));
  params.append("end_date", formatEcccDate(endDate));

  const url = `${BASE_URL}/real_time_data/csv/inline?${params.toString()}`;
  const res = await fetch(url, { cache: "no-store", signal });
  if (!res.ok) {
    throw new Error(`ECCC real_time_data request failed: ${res.status}`);
  }

  const csv = await res.text();
  return parseCsv(csv);
}

function formatEcccDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

export interface FetchedCondition {
  stationCode: string;
  condition: string;
}

interface MapDataStation {
  station_id: string;
  current_conditions: string | null;
}

// Fetches the same feed the map's markers use (all real-time stations in
// Canada) and filters down to ours. `current_conditions` is a ranking of the
// latest discharge against this day's historical record (e.g.
// MUCH_BELOW_NORMAL) — ECCC computes it, we don't. Stations that don't
// report discharge consistently come back as NO_DISCHARGE_DATA rather than
// being omitted.
export async function fetchCurrentConditions(
  stationCodes: readonly string[]
): Promise<FetchedCondition[]> {
  const res = await fetch(`${BASE_URL}/map_data?data_type=real_time`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`ECCC map_data request failed: ${res.status}`);
  }

  const data = (await res.json()) as MapDataStation[];
  const codes = new Set(stationCodes);

  return data
    .filter((s): s is MapDataStation & { current_conditions: string } =>
      codes.has(s.station_id) && !!s.current_conditions
    )
    .map((s) => ({ stationCode: s.station_id, condition: s.current_conditions }));
}
