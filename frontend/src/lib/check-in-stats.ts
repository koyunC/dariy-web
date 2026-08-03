import type { CurrentUser } from "./current-user";
import type { TimeCapsuleLog } from "./logs";

export type DateRange = {
  start: string;
  end: string;
};

export type CheckInProgress = DateRange & {
  completedCount: number;
  targetCount: number;
  percentage: number;
};

const dateKeyFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDateKeyFormatter(timeZone: string): Intl.DateTimeFormat {
  const existing = dateKeyFormatterCache.get(timeZone);
  if (existing) return existing;

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  dateKeyFormatterCache.set(timeZone, formatter);
  return formatter;
}

export function getDateKey(milliseconds: number, timeZone: string): string {
  const parts = getDateKeyFormatter(timeZone).formatToParts(
    new Date(milliseconds),
  );
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDateKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export function getRollingDateRange(
  referenceMilliseconds: number,
  days: number,
  timeZone: string,
): DateRange {
  const end = getDateKey(referenceMilliseconds, timeZone);
  return {
    start: shiftDateKey(end, -(days - 1)),
    end,
  };
}

function countInclusiveDays(start: string, end: string): number {
  const startMilliseconds = Date.parse(`${start}T00:00:00Z`);
  const endMilliseconds = Date.parse(`${end}T00:00:00Z`);
  if (
    Number.isNaN(startMilliseconds) ||
    Number.isNaN(endMilliseconds) ||
    startMilliseconds > endMilliseconds
  ) {
    return 0;
  }

  return Math.round(
    (endMilliseconds - startMilliseconds) / (24 * 60 * 60 * 1_000),
  ) + 1;
}

function daysBetween(start: string, end: string): number {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      (24 * 60 * 60 * 1_000),
  );
}

export function calculateCheckInProgress(
  logs: TimeCapsuleLog[],
  user: CurrentUser,
  range: DateRange,
  actionId: string,
  fallbackTimeZone: string,
  targetCount: number,
  periodDays: number,
): CheckInProgress {
  const totalDays = countInclusiveDays(range.start, range.end);
  if (totalDays === 0) {
    return { ...range, completedCount: 0, targetCount: 0, percentage: 0 };
  }

  const totalPeriods = Math.ceil(totalDays / periodDays);
  const totalTargetCount = totalPeriods * targetCount;
  const checkInCounts = new Map<number, number>();

  logs.forEach((log) => {
    if (log.user !== user || log.actionId !== actionId) return;

    const timestamp = log.timeMilliseconds ?? log.createdAt;
    if (timestamp === null || !Number.isFinite(timestamp)) return;

    const dateKey = getDateKey(
      timestamp,
      log.recordedTimeZone ?? fallbackTimeZone,
    );
    if (dateKey >= range.start && dateKey <= range.end) {
      const periodIndex = Math.floor(
        daysBetween(range.start, dateKey) / periodDays,
      );
      checkInCounts.set(
        periodIndex,
        (checkInCounts.get(periodIndex) ?? 0) + 1,
      );
    }
  });

  const completedCount = [...checkInCounts.values()].reduce(
    (total, count) => total + count,
    0,
  );
  return {
    ...range,
    completedCount,
    targetCount: totalTargetCount,
    percentage: completedCount / totalTargetCount,
  };
}
