export const recentHistoryDays = 7;

const recentHistoryWindowMilliseconds =
  recentHistoryDays * 24 * 60 * 60 * 1_000;

export function isWithinRecentHistory(
  timestamp: number,
  now = Date.now(),
): boolean {
  const earliestTimestamp = now - recentHistoryWindowMilliseconds;
  return timestamp >= earliestTimestamp && timestamp <= now;
}
