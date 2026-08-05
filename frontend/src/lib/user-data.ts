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

export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
}

export function getCurrentTimeZone(): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (!timeZone || !isValidTimeZone(timeZone)) {
    throw new Error("瀏覽器未提供有效的 IANA 時區");
  }
  return timeZone;
}

export function getTimeZoneLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("zh-TW", {
      timeZone,
      timeZoneName: "long",
    }).formatToParts(new Date());
    return parts.find((part) => part.type === "timeZoneName")?.value
      ?? timeZone;
  } catch {
    return timeZone;
  }
}

export function formatTimestampInTimeZone(
  milliseconds: number,
  timeZone: string,
): string {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone,
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

function getDateTimeParts(
  milliseconds: number,
  timeZone: string,
): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(milliseconds));

  return Object.fromEntries(
    parts
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
}

function getTimeZoneOffsetMilliseconds(
  milliseconds: number,
  timeZone: string,
): number {
  const parts = getDateTimeParts(milliseconds, timeZone);
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return asUtc - milliseconds;
}

export function formatDateTimeLocalInTimeZone(
  milliseconds: number,
  timeZone: string,
): string {
  if (!Number.isFinite(milliseconds) || !isValidTimeZone(timeZone)) return "";

  const parts = getDateTimeParts(milliseconds, timeZone);
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

export function parseDateTimeLocalInTimeZone(
  value: string,
  timeZone: string,
): number | null {
  if (!isValidTimeZone(timeZone)) return null;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/u.exec(value);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    month < 1 || month > 12
    || day < 1 || day > 31
    || hour > 23
    || minute > 59
  ) return null;

  const naiveMilliseconds = Date.UTC(year, month - 1, day, hour, minute);
  const naiveDate = new Date(naiveMilliseconds);
  if (
    naiveDate.getUTCFullYear() !== year
    || naiveDate.getUTCMonth() !== month - 1
    || naiveDate.getUTCDate() !== day
    || naiveDate.getUTCHours() !== hour
    || naiveDate.getUTCMinutes() !== minute
  ) return null;

  let milliseconds = naiveMilliseconds;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    milliseconds = naiveMilliseconds - getTimeZoneOffsetMilliseconds(
      milliseconds,
      timeZone,
    );
  }

  return formatDateTimeLocalInTimeZone(milliseconds, timeZone) === value
    ? milliseconds
    : null;
}

export function formatTimestampForUser(
  milliseconds: number,
  user: CurrentUser,
): string {
  return formatTimestampInTimeZone(
    milliseconds,
    userDataConventions[user].timeZone,
  );
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
