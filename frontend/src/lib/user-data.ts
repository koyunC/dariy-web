import type { CurrentUser } from "./current-user";

export type WeightUnit = "lb" | "kg";

export type UserDataConvention = {
  timeZone: string;
  timeZoneLabel: string;
  weightUnit: WeightUnit;
};

export const userDataConventions: Record<CurrentUser, UserDataConvention> = {
  cloud: {
    timeZone: "America/New_York",
    timeZoneLabel: "美東時間",
    weightUnit: "lb",
  },
  stone: {
    timeZone: "Asia/Taipei",
    timeZoneLabel: "台北時間",
    weightUnit: "kg",
  },
};

export function getUserDataConvention(
  user: string,
): UserDataConvention | null {
  if (user !== "cloud" && user !== "stone") return null;
  return userDataConventions[user];
}

export function formatTimestampForUser(
  milliseconds: number,
  user: CurrentUser,
): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: userDataConventions[user].timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
    hourCycle: "h23",
  })
    .format(new Date(milliseconds))
    .replace(/\s+/gu, " ");
}

function unitFromText(value: string | undefined): WeightUnit | null {
  if (!value) return null;
  return /^(?:lb|磅)$/iu.test(value) ? "lb" : "kg";
}

function convertWeight(
  value: number,
  sourceUnit: WeightUnit,
  displayUnit: WeightUnit,
): number {
  if (sourceUnit === displayUnit) return value;
  return sourceUnit === "lb" ? value * 0.45359237 : value / 0.45359237;
}

export function formatWeightContent(
  content: string,
  actionId: string,
  sourceUnit: WeightUnit | null,
  displayUnit: WeightUnit,
): string {
  if (actionId !== "weight" || !sourceUnit) return content;

  const match = content.match(/(-?\d+(?:\.\d+)?)\s*(lb|kg|磅|公斤)?/iu);
  if (!match) return content;

  const value = Number(match[1]);
  if (!Number.isFinite(value)) return content;

  const explicitUnit = unitFromText(match[2]);
  const actualSourceUnit = explicitUnit ?? sourceUnit;
  const convertedValue = convertWeight(value, actualSourceUnit, displayUnit);
  const displayValue =
    actualSourceUnit === displayUnit
      ? match[1]
      : convertedValue.toFixed(1);
  const replacement = `${displayValue} ${displayUnit}`;

  return content.replace(match[0], replacement);
}
