import { doc, getDoc, updateDoc } from "firebase/firestore";

import type { CurrentUser } from "./current-user";
import { db } from "./firebase";
import {
  hasCompleteCheckInGoals,
  normalizeCheckInGoals,
  type CheckInGoals,
} from "./preference-rules";

export async function getUserCheckInGoals(
  user: CurrentUser,
): Promise<CheckInGoals> {
  const metadataSnapshot = await getDoc(doc(db, "user_metadata", user));
  if (!metadataSnapshot.exists()) {
    throw new Error(`找不到 ${user} 的 user_metadata 文件`);
  }

  const storedGoals = metadataSnapshot.data().preferences?.checkInGoals;
  const normalizedGoals = normalizeCheckInGoals(storedGoals);

  if (!hasCompleteCheckInGoals(storedGoals)) {
    await updateDoc(metadataSnapshot.ref, {
      "preferences.checkInGoals": normalizedGoals,
    });
  }

  return normalizedGoals;
}

export async function saveUserCheckInGoals(
  user: CurrentUser,
  goals: CheckInGoals,
): Promise<CheckInGoals> {
  const normalizedGoals = normalizeCheckInGoals(goals);
  await updateDoc(doc(db, "user_metadata", user), {
    "preferences.checkInGoals": normalizedGoals,
  });
  return normalizedGoals;
}
