import type { Parameter } from "./types";

export interface DailyHistoryRow {
  stationCode: string;
  parameter: Parameter;
  year: number;
  month: number;
  day: number;
  value: number;
}

// Parses ECCC's daily_data CSV:
// ID,Date,Parameter/Paramètre,Value/Valeur,Symbol/Symbole
// The parameter column reads "water level" or "discharge". Only rows for the
// requested parameter with a numeric value are kept; ECCC leaves the value
// blank on days the gauge has no record.
export function parseDailyDataCsv(csv: string, parameter: Parameter): DailyHistoryRow[] {
  const prefix = parameter === "level" ? "water level" : "discharge";
  const rows: DailyHistoryRow[] = [];

  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    if (!line.trim()) continue;
    const [stationCode, date, dataType, rawValue] = line.split(",");
    if (!stationCode || !date || !dataType?.trim().toLowerCase().startsWith(prefix)) continue;
    if (!rawValue || rawValue.trim() === "") continue;
    const value = Number(rawValue);
    if (Number.isNaN(value)) continue;
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!match) continue;

    rows.push({
      stationCode: stationCode.trim(),
      parameter,
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      value,
    });
  }

  return rows;
}
