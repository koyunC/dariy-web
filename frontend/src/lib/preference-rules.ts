import {
  checkInActions,
  type CheckInActionId,
} from "./action-catalog.ts";

export type DailyTargets = Record<CheckInActionId, number>;

const twiceDailyActions = new Set<CheckInActionId>([
  "exercise",
  "study",
  "cook",
]);

export const defaultDailyTargets: DailyTargets = Object.fromEntries(
  checkInActions.map((action) => [
    action.id,
    twiceDailyActions.has(action.id) ? 2 : 1,
  ]),
) as DailyTargets;

export function normalizeDailyTargets(value: unknown): DailyTargets {
  const storedTargets =
    typeof value === "object" && value !== null
      ? value as Record<string, unknown>
      : {};

  return Object.fromEntries(
    checkInActions.map((action) => {
      const storedTarget = storedTargets[action.id];
      const target =
        typeof storedTarget === "number" &&
        Number.isInteger(storedTarget) &&
        storedTarget >= 1 &&
        storedTarget <= 10
          ? storedTarget
          : defaultDailyTargets[action.id];
      return [action.id, target];
    }),
  ) as DailyTargets;
}

export function hasCompleteDailyTargets(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  const storedTargets = value as Record<string, unknown>;
  const normalizedTargets = normalizeDailyTargets(value);
  return checkInActions.every(
    (action) => storedTargets[action.id] === normalizedTargets[action.id],
  );
}
