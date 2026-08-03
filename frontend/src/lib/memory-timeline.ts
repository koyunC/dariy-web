import type { CurrentUser } from "./current-user";
import type { TimeCapsuleLog } from "./logs";
import { getDateKey, getRollingDateRange } from "./check-in-stats.ts";

export type MemoryTimelineDay = {
  dateKey: string;
  currentUserLogs: TimeCapsuleLog[];
  partnerLogs: TimeCapsuleLog[];
};

function getLogTimestamp(log: TimeCapsuleLog): number | null {
  return log.timeMilliseconds ?? log.createdAt;
}

function enumerateDateKeys(start: string, end: string): string[] {
  const keys: string[] = [];
  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);

  while (current <= last) {
    keys.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return keys;
}

export function createSevenDayMemoryTimeline(
  logs: TimeCapsuleLog[],
  currentUser: CurrentUser,
  referenceMilliseconds: number,
  timeZone: string,
): MemoryTimelineDay[] {
  const range = getRollingDateRange(referenceMilliseconds, 7, timeZone);
  const days: MemoryTimelineDay[] = enumerateDateKeys(
    range.start,
    range.end,
  ).map((dateKey) => ({
    dateKey,
    currentUserLogs: [],
    partnerLogs: [],
  }));
  const daysByKey = new Map(days.map((day) => [day.dateKey, day]));
  const partner: CurrentUser = currentUser === "cloud" ? "stone" : "cloud";

  logs.forEach((log) => {
    if (log.user !== currentUser && log.user !== partner) return;

    const timestamp = getLogTimestamp(log);
    if (timestamp === null || !Number.isFinite(timestamp)) return;

    const day = daysByKey.get(getDateKey(timestamp, timeZone));
    if (!day) return;

    const destination = log.user === currentUser
      ? day.currentUserLogs
      : day.partnerLogs;
    destination.push(log);
  });

  days.forEach((day) => {
    const byTimestamp = (left: TimeCapsuleLog, right: TimeCapsuleLog) =>
      (getLogTimestamp(left) ?? 0) - (getLogTimestamp(right) ?? 0);
    day.currentUserLogs.sort(byTimestamp);
    day.partnerLogs.sort(byTimestamp);
  });

  return days;
}

export function formatTimelineDate(dateKey: string): {
  weekday: string;
  date: string;
} {
  const date = new Date(`${dateKey}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat("zh-TW", {
      timeZone: "UTC",
      weekday: "short",
    }).format(date),
    date: `${dateKey.slice(5, 7)}/${dateKey.slice(8, 10)}`,
  };
}
