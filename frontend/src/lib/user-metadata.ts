import { doc, getDoc, updateDoc } from "firebase/firestore";

import type { CurrentUser } from "./current-user";
import { db } from "./firebase";
import { getCurrentTimeZone, isValidTimeZone } from "./user-data";

export type UserTimeZoneSyncResult = {
  detectedTimeZone: string;
  previousTimeZone: string | null;
  effectiveTimeZone: string;
  updated: boolean;
};

function readStoredTimeZone(value: unknown): string | null {
  return typeof value === "string" && isValidTimeZone(value)
    ? value
    : null;
}

export async function syncUserTimeZone(
  user: CurrentUser,
): Promise<UserTimeZoneSyncResult> {
  const detectedTimeZone = getCurrentTimeZone();
  const metadataReference = doc(db, "user_metadata", user);
  const metadataSnapshot = await getDoc(metadataReference);

  if (!metadataSnapshot.exists()) {
    throw new Error(`找不到 ${user} 的 user_metadata 文件`);
  }

  const previousTimeZone = readStoredTimeZone(
    metadataSnapshot.data().timeZone,
  );
  const updated = previousTimeZone !== detectedTimeZone;
  let effectiveTimeZone = previousTimeZone;

  if (updated) {
    // Update only the existing user's timeZone field. Do not create documents
    // or overwrite unrelated metadata.
    await updateDoc(metadataReference, { timeZone: detectedTimeZone });

    const updatedSnapshot = await getDoc(metadataReference);
    effectiveTimeZone = updatedSnapshot.exists()
      ? readStoredTimeZone(updatedSnapshot.data().timeZone)
      : null;
  }

  if (!effectiveTimeZone) {
    throw new Error(`無法從 ${user} 的 user_metadata 取得有效時區`);
  }

  return {
    detectedTimeZone,
    previousTimeZone,
    effectiveTimeZone,
    updated,
  };
}
