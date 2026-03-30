/**
 * Fiscal year and quarter utilities.
 * All quarter/year logic lives here — never duplicate elsewhere.
 */

export function getFiscalYear(date: Date, startMonth: number): number {
  const month = date.getMonth() + 1; // 1-indexed
  // If FY starts in Jan, the FY = calendar year.
  // If FY starts in any other month, the FY is named after the year
  // the majority of the fiscal year falls in (i.e. start year + 1).
  // Example: FY starting Dec 2025 → called FY2026.
  if (startMonth === 1) return date.getFullYear();
  return month >= startMonth ? date.getFullYear() + 1 : date.getFullYear();
}

export function getFiscalQuarter(date: Date, startMonth: number): number {
  const month = date.getMonth() + 1;
  const fiscalMonth = ((month - startMonth + 12) % 12);
  return Math.floor(fiscalMonth / 3) + 1;
}

export function getFiscalQuarterDateRange(
  fiscalYear: number,
  quarter: number,
  startMonth: number
): { start: Date; end: Date } {
  // Calendar year when this fiscal year begins.
  // For Jan start: FY2026 starts Jan 2026 (calendarStartYear = 2026).
  // For non-Jan start: FY2026 starts in startMonth of 2025 (calendarStartYear = 2025).
  const calendarStartYear = startMonth === 1 ? fiscalYear : fiscalYear - 1;

  const quarterOffset = (quarter - 1) * 3;
  const monthIndex = (startMonth - 1 + quarterOffset) % 12; // 0-indexed month
  // If the month index wrapped past December, we're in the next calendar year
  const yearOfQuarterStart =
    (startMonth - 1 + quarterOffset) >= 12
      ? calendarStartYear + 1
      : calendarStartYear;

  const start = new Date(yearOfQuarterStart, monthIndex, 1);

  // End: 3 months later, last day of that month
  const endMonthIndex = (monthIndex + 3) % 12;
  const yearOfQuarterEnd = (monthIndex + 3) >= 12 ? yearOfQuarterStart + 1 : yearOfQuarterStart;
  const end = new Date(yearOfQuarterEnd, endMonthIndex, 0); // day 0 = last day of prev month

  return { start, end };
}

export function getDaysElapsedInQuarter(date: Date, startMonth: number): number {
  const fiscalYear = getFiscalYear(date, startMonth);
  const quarter = getFiscalQuarter(date, startMonth);
  const { start } = getFiscalQuarterDateRange(fiscalYear, quarter, startMonth);
  const diffMs = date.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

export function getQuarterProgressPercent(date: Date, startMonth: number): number {
  const fiscalYear = getFiscalYear(date, startMonth);
  const quarter = getFiscalQuarter(date, startMonth);
  const { start, end } = getFiscalQuarterDateRange(fiscalYear, quarter, startMonth);
  const totalDays = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const elapsed = getDaysElapsedInQuarter(date, startMonth);
  return totalDays > 0 ? Math.round((elapsed / totalDays) * 100) : 0;
}
