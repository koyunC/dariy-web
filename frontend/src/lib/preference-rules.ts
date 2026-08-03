import {
  checkInActions,
  type CheckInActionId,
} from "./action-catalog.ts";

export type CheckInGoal = {
  targetCount: number;
  periodDays: number;
};

export type CheckInGoals = Record<CheckInActionId, CheckInGoal>;

const defaultTwiceDailyActions = new Set<CheckInActionId>([
  "study",
  "cook",
]);

export const defaultCheckInGoals: CheckInGoals = Object.fromEntries(
  checkInActions.map((action) => {
    if (action.id === "exercise") {
      return [action.id, { targetCount: 1, periodDays: 2 }];
    }

    return [
      action.id,
      {
        targetCount: defaultTwiceDailyActions.has(action.id) ? 2 : 1,
        periodDays: 1,
      },
    ];
  }),
) as CheckInGoals;

function normalizeInteger(
  value: unknown,
  fallback: number,
  maximum: number,
): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= maximum
    ? value
    : fallback;
}

export function normalizeCheckInGoals(value: unknown): CheckInGoals {
  const storedGoals =
    typeof value === "object" && value !== null
      ? value as Record<string, unknown>
      : {};

  return Object.fromEntries(
    checkInActions.map((action) => {
      const defaultGoal = defaultCheckInGoals[action.id];
      const storedGoal =
        typeof storedGoals[action.id] === "object" &&
        storedGoals[action.id] !== null
          ? storedGoals[action.id] as Record<string, unknown>
          : {};

      return [
        action.id,
        {
          targetCount: normalizeInteger(
            storedGoal.targetCount,
            defaultGoal.targetCount,
            10,
          ),
          periodDays: normalizeInteger(
            storedGoal.periodDays,
            defaultGoal.periodDays,
            30,
          ),
        },
      ];
    }),
  ) as CheckInGoals;
}

export function hasCompleteCheckInGoals(value: unknown): boolean {
  if (typeof value !== "object" || value === null) return false;

  const storedGoals = value as Record<string, unknown>;
  const normalizedGoals = normalizeCheckInGoals(value);
  return checkInActions.every((action) => {
    const storedGoal = storedGoals[action.id];
    if (typeof storedGoal !== "object" || storedGoal === null) return false;

    const goal = storedGoal as Record<string, unknown>;
    return goal.targetCount === normalizedGoals[action.id].targetCount &&
      goal.periodDays === normalizedGoals[action.id].periodDays;
  });
}
