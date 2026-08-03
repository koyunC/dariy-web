import { doc, getDoc, updateDoc } from "firebase/firestore";

import type { CurrentUser } from "./current-user";
import { db } from "./firebase";
import {
  hasCompleteDailyTargets,
  normalizeDailyTargets,
  type DailyTargets,
} from "./preference-rules";

export async function getUserDailyTargets(
  user: CurrentUser,
): Promise<DailyTargets> {
  const metadataSnapshot = await getDoc(doc(db, "user_metadata", user));
  if (!metadataSnapshot.exists()) {
    throw new Error(`找不到 ${user} 的 user_metadata 文件`);
  }

  const storedTargets = metadataSnapshot.data().preferences?.dailyTargets;
  const normalizedTargets = normalizeDailyTargets(storedTargets);

  if (!hasCompleteDailyTargets(storedTargets)) {
    await updateDoc(metadataSnapshot.ref, {
      "preferences.dailyTargets": normalizedTargets,
    });
  }

  return normalizedTargets;
}

export async function saveUserDailyTargets(
  user: CurrentUser,
  targets: DailyTargets,
): Promise<DailyTargets> {
  const normalizedTargets = normalizeDailyTargets(targets);
  await updateDoc(doc(db, "user_metadata", user), {
    "preferences.dailyTargets": normalizedTargets,
  });
  return normalizedTargets;
}
