import type { CurrentUser } from "./current-user";

export type WeightUnit = "lb" | "kg";

export type UserDataConvention = {
  timeZone: string;
  weightUnit: WeightUnit;
};

export const userDataConventions: Record<CurrentUser, UserDataConvention> = {
  cloud: {
    timeZone: "America/New_York",
    weightUnit: "lb",
  },
  stone: {
    timeZone: "Asia/Taipei",
    weightUnit: "kg",
  },
};

export function getUserDataConvention(
  user: string,
): UserDataConvention | null {
  if (user !== "cloud" && user !== "stone") return null;
  return userDataConventions[user];
}

export function addWeightUnit(
  content: string,
  actionId: string,
  convention: UserDataConvention | null,
): string {
  if (actionId !== "weight" || !convention) return content;

  const alreadyHasUnit = /(?:\blb\b|\bkg\b|磅|公斤)/iu.test(content);
  return alreadyHasUnit ? content : `${content} ${convention.weightUnit}`;
}
