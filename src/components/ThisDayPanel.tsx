import { formatRelativeTime, formatValue } from "@/lib/format";
import {
  formatMonthDay,
  rankForDate,
  rankPhrase,
  type DayHistory,
  type YearValue,
} from "@/lib/thisDay";
import type { LatestReading, Parameter } from "@/lib/types";

// "This day": today's latest 5-minute reading against the same calendar date
// in every earlier year on record.
export default function ThisDayPanel({
  parameter,
  latest,
  history,
}: {
  parameter: Parameter;
  latest: LatestReading | null;
  history: DayHistory | null;
}) {
  const noun = parameter === "level" ? "water level" : "flow rate";
  const unit = latest?.unit ?? (parameter === "level" ? "m" : "m³/s");

  if (!history || history.values.length === 0) {
    return (
      <section className="rounded-lg border border-black/10 p-4 text-sm text-black/60 dark:border-white/10 dark:text-white/60">
        No historical {noun} data is loaded for this date yet.
      </section>
    );
  }

  const dateLabel = formatMonthDay(history.month, history.day);
  const ranking = latest ? rankForDate(latest.value, history.values) : null;
  const min = ranking?.min ?? lowest(history.values);
  const max = ranking?.max ?? highest(history.values);
  const firstYear = Math.min(...history.values.map((v) => v.year));
  const approvedThrough = history.values.filter((v) => !v.provisional).at(-1)?.year ?? null;
  const hasProvisional = history.values.some((v) => v.provisional);

  // Year-by-year list, lowest first, with today's reading slotted in.
  const rows: (YearValue & { isToday: boolean })[] = history.values.map((v) => ({
    ...v,
    isToday: false,
  }));
  if (latest) {
    rows.push({ year: history.year, value: latest.value, provisional: true, isToday: true });
  }
  rows.sort((a, b) => a.value - b.value || a.year - b.year);

  return (
    <section
      aria-labelledby="this-day-heading"
      className="space-y-4 rounded-lg border border-black/10 p-4 dark:border-white/10"
    >
      <div>
        <h2 id="this-day-heading" className="text-sm font-semibold">
          {dateLabel} in every year on record
        </h2>
        <p className="text-xs text-black/50 dark:text-white/50">
          {parameter === "level" ? "Water level" : "Flow rate"}, {firstYear} to {history.year}
        </p>
      </div>

      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat
          label="Right now"
          value={latest ? formatValue(latest.value, unit) : "No current reading"}
          detail={latest ? `as of ${formatRelativeTime(latest.observedAt)}` : null}
          emphasis
        />
        <Stat
          label={`Lowest on ${dateLabel}`}
          value={formatValue(min.value, unit)}
          detail={yearLabel(min)}
        />
        <Stat
          label={`Highest on ${dateLabel}`}
          value={formatValue(max.value, unit)}
          detail={yearLabel(max)}
        />
      </dl>

      {ranking && (
        <div className="space-y-1 text-sm">
          {ranking.isNewLow ? (
            <p>
              Lower than any {dateLabel} on record:{" "}
              <strong>a provisional new low for this date</strong>.
            </p>
          ) : ranking.isNewHigh ? (
            <p>
              Higher than any {dateLabel} on record:{" "}
              <strong>a provisional new high for this date</strong>.
            </p>
          ) : null}
          <p>
            Today&apos;s {noun} is{" "}
            <strong>{rankPhrase(ranking.lowestRank, "lowest", ranking.tied)}</strong> of{" "}
            {ranking.total} recorded for {dateLabel}.
          </p>
          <p>
            It is <strong>{rankPhrase(ranking.highestRank, "highest", ranking.tied)}</strong> of{" "}
            {ranking.total} recorded for {dateLabel}.
          </p>
        </div>
      )}

      <details className="text-sm" open>
        <summary className="cursor-pointer text-xs font-medium text-black/60 dark:text-white/60">
          Every {dateLabel}, lowest to highest ({rows.length})
        </summary>
        <div className="mt-2 max-h-96 overflow-y-auto rounded-md border border-black/10 dark:border-white/10">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-black/5 backdrop-blur dark:bg-white/5">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Rank</th>
                <th className="px-3 py-1.5 text-left font-medium">Year</th>
                <th className="px-3 py-1.5 text-right font-medium">
                  {parameter === "level" ? "Water level" : "Flow rate"}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={`${r.year}-${r.isToday}`}
                  className={`border-t border-black/5 dark:border-white/5 ${
                    r.isToday ? "bg-blue-50 font-medium dark:bg-blue-950/40" : ""
                  }`}
                >
                  <td className="px-3 py-1.5 tabular-nums">{i + 1}</td>
                  <td className="px-3 py-1.5">
                    {r.isToday ? `${r.year} (now)` : r.year}
                    {!r.isToday && r.provisional && (
                      <span className="ml-1 text-xs text-black/45 dark:text-white/45">
                        provisional
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums">
                    {formatValue(r.value, unit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-xs text-black/50 dark:text-white/50">
        Past years are daily averages from ECCC&apos;s approved record
        {approvedThrough ? ` (through ${approvedThrough})` : ""}
        {hasProvisional ? ", plus later years averaged from this site's own readings (provisional)" : ""}
        . &ldquo;Right now&rdquo; is the latest 5-minute reading, so it can sit above or below a
        day&apos;s average.
      </p>
    </section>
  );
}

function Stat({
  label,
  value,
  detail,
  emphasis = false,
}: {
  label: string;
  value: string;
  detail: string | null;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`rounded-md p-3 ${
        emphasis ? "bg-blue-50 dark:bg-blue-950/40" : "bg-black/[0.03] dark:bg-white/[0.05]"
      }`}
    >
      <dt className="text-xs text-black/50 dark:text-white/50">{label}</dt>
      <dd className="mt-1 text-sm font-medium tabular-nums">{value}</dd>
      {detail && <dd className="mt-0.5 text-xs text-black/50 dark:text-white/50">{detail}</dd>}
    </div>
  );
}

function yearLabel(v: YearValue): string {
  return v.provisional ? `in ${v.year} (provisional)` : `in ${v.year}`;
}

function lowest(values: YearValue[]): YearValue {
  return values.reduce((a, b) => (b.value < a.value ? b : a));
}

function highest(values: YearValue[]): YearValue {
  return values.reduce((a, b) => (b.value > a.value ? b : a));
}
