import { doc, getDoc, updateDoc } from "firebase/firestore";

import { knownUsers, type CurrentUser } from "./current-user";
import { db } from "./firebase";
import { findUsersByAuthUID } from "./user-identity";
import { getCurrentTimeZone, isValidTimeZone } from "./user-data";

export type UserTimeZoneSyncResult = {
  user: CurrentUser;
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

export async function resolveCurrentUserFromAuthUID(
  authUID: string,
): Promise<CurrentUser> {
  if (!authUID) {
    throw new Error("Google 登入缺少 UID，無法確認身份");
  }

  const metadataSnapshots = await Promise.all(
    knownUsers.map((user) => getDoc(doc(db, "user_metadata", user))),
  );
  const metadataByUser = Object.fromEntries(
    knownUsers.map((user, index) => [
      user,
      metadataSnapshots[index].exists()
        ? metadataSnapshots[index].data()
        : null,
    ]),
  ) as Partial<Record<CurrentUser, { authUID?: unknown } | null>>;
  const matches = findUsersByAuthUID(authUID, metadataByUser);

  if (matches.length === 0) {
    throw new Error("此 Google 帳號尚未綁定 cloud 或 stone 身份");
  }
  if (matches.length > 1) {
    throw new Error("此 Google UID 同時綁定多個身份，請先修正 user_metadata");
  }

  return matches[0];
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
    user,
    detectedTimeZone,
    previousTimeZone,
    effectiveTimeZone,
    updated,
  };
}
