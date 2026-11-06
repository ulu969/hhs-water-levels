import { sql } from "./db";
import { BC_UTC_OFFSET_HOURS, bcDateToday } from "./config";
import { provisionalYears, type DayHistory, type YearValue } from "./thisDay";
import type { Parameter } from "./types";

// A provisional day needs at least half its 5-minute readings (288 a day) to
// count, so a day with a long gauge outage isn't averaged from a few values.
const MIN_READINGS_PER_DAY = 144;

export type { DayHistory };

export async function getDayHistory(code: string, parameter: Parameter): Promise<DayHistory> {
  const { year, month, day } = bcDateToday();

  const approved = await sql`
    SELECT year, value FROM daily_history
    WHERE station_code = ${code} AND parameter = ${parameter}
      AND month = ${month} AND day = ${day} AND year < ${year}
    ORDER BY year
  `;
  const values: YearValue[] = approved.map((r) => ({
    year: Number(r.year),
    value: Number(r.value),
    provisional: false,
  }));
  const latestApproved = values.length ? values[values.length - 1].year : null;

  // ECCC's approved record lags a year or two, so recent years come from
  // averaging our own readings over that BC calendar day.
  const provisional = await Promise.all(
    provisionalYears(latestApproved, year, month, day).map(async (y) => {
      const start = new Date(Date.UTC(y, month - 1, day, BC_UTC_OFFSET_HOURS));
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      const [row] = await sql`
        SELECT avg(value) AS value, count(*)::int AS n FROM readings
        WHERE station_code = ${code} AND parameter = ${parameter}
          AND observed_at >= ${start.toISOString()} AND observed_at < ${end.toISOString()}
      `;
      return row && Number(row.n) >= MIN_READINGS_PER_DAY
        ? { year: y, value: Number(row.value), provisional: true }
        : null;
    })
  );
  for (const p of provisional) if (p) values.push(p);

  return { year, month, day, values };
}
