// The station page's "This day" view: today's latest reading ranked against
// the same calendar date in every earlier year on record. Kept free of
// database code so the ranking rules can be unit tested.

export interface YearValue {
  year: number;
  value: number;
  /** True for years after ECCC's approved record, averaged from our own readings. */
  provisional: boolean;
}

export interface DayHistory {
  /** Today's BC calendar date. */
  year: number;
  month: number;
  day: number;
  /** Every earlier year's value for that date: approved years oldest first, then provisional. */
  values: YearValue[];
}

export interface DayRanking {
  /** Years compared, including this year's reading. */
  total: number;
  /** 1 = lowest. Ties share the better rank ("tied for 3rd lowest"). */
  lowestRank: number;
  /** 1 = highest. */
  highestRank: number;
  tied: boolean;
  isNewLow: boolean;
  isNewHigh: boolean;
  min: YearValue;
  max: YearValue;
  firstYear: number;
}

// Readings and daily means are compared at the precision the page shows, so
// "tied" means the numbers on screen match.
const roundTo2 = (v: number) => Math.round(v * 100) / 100;

export function rankForDate(current: number, history: YearValue[]): DayRanking | null {
  if (history.length === 0) return null;
  const c = roundTo2(current);
  let lower = 0;
  let higher = 0;
  let tied = false;
  let min = history[0];
  let max = history[0];
  let firstYear = history[0].year;

  for (const h of history) {
    const v = roundTo2(h.value);
    if (v < c) lower++;
    else if (v > c) higher++;
    else tied = true;
    if (h.value < min.value) min = h;
    if (h.value > max.value) max = h;
    if (h.year < firstYear) firstYear = h.year;
  }

  return {
    total: history.length + 1,
    lowestRank: lower + 1,
    highestRank: higher + 1,
    tied,
    isNewLow: c < roundTo2(min.value),
    isNewHigh: c > roundTo2(max.value),
    min,
    max,
    firstYear,
  };
}

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

// "4th lowest", "tied for 4th lowest", or "the lowest" for rank 1.
export function rankPhrase(rank: number, direction: "lowest" | "highest", tied: boolean): string {
  const base = rank === 1 ? `the ${direction}` : `the ${ordinal(rank)} ${direction}`;
  return tied ? `tied for ${base.replace(/^the /, "")}` : base;
}

// Years after the approved record that our own readings can fill in: only the
// years between ECCC's last approved year for this date and this year, and
// at most the two years before this one (the readings table keeps about 18
// months). Feb 29 is skipped in non-leap years.
export function provisionalYears(
  latestApprovedYear: number | null,
  thisYear: number,
  month: number,
  day: number
): number[] {
  const from = Math.max((latestApprovedYear ?? 0) + 1, thisYear - 2);
  const years: number[] = [];
  for (let y = from; y < thisYear; y++) {
    const d = new Date(Date.UTC(y, month - 1, day));
    if (d.getUTCMonth() === month - 1) years.push(y);
  }
  return years;
}

export function formatMonthDay(month: number, day: number): string {
  return new Date(Date.UTC(2000, month - 1, day)).toLocaleDateString("en-CA", {
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
