import {
  checkInActions,
  type CheckInActionId,
} from "./action-catalog.ts";
import type { WeightUnit } from "./user-data.ts";

export type CheckInDraft = {
  actionId: CheckInActionId;
  note?: string;
  weightValue?: string;
  weightUnit: WeightUnit;
};

export type PreparedCheckIn = {
  actionId: CheckInActionId;
  content: string;
};

export function extractCheckInContentValue(content: string): string {
  const separatorIndex = [content.indexOf("："), content.indexOf(":")]
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0];

  return separatorIndex === undefined
    ? ""
    : content.slice(separatorIndex + 1).trim();
}

export function extractWeightValue(content: string): string {
  return content.match(/-?\d+(?:\.\d+)?/u)?.[0] ?? "";
}

export function prepareCheckIn(draft: CheckInDraft): PreparedCheckIn {
  const action = checkInActions.find((item) => item.id === draft.actionId);
  if (!action) throw new Error("找不到這個打卡類別");

  if (draft.actionId === "weight") {
    const weightText = draft.weightValue?.trim() ?? "";
    const weight = Number(weightText);

    if (!weightText || !Number.isFinite(weight) || weight <= 0) {
      throw new Error("請輸入有效的體重");
    }

    return {
      actionId: draft.actionId,
      content: `${action.icon}${action.label}：${weightText} ${draft.weightUnit}`,
    };
  }

  const note = draft.note?.trim() ?? "";
  if (note.length > 200) throw new Error("備註最多 200 個字");

  return {
    actionId: draft.actionId,
    content: note
      ? `${action.icon}${action.label}：${note}`
      : `${action.icon}${action.label}`,
  };
}
