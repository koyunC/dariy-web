import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "./firebase";

let pendingAuthentication: Promise<User | null> | null = null;
const redirectResultTimeoutMilliseconds = 8_000;

function shouldFallbackToRedirect(caughtError: unknown): boolean {
  if (!caughtError || typeof caughtError !== "object") return false;
  const code = "code" in caughtError ? caughtError.code : null;
  return code === "auth/popup-blocked" ||
    code === "auth/operation-not-supported-in-this-environment";
}

export async function restoreGoogleAuth(): Promise<User | null> {
  await setPersistence(auth, browserLocalPersistence);

  // A browser may still have an anonymous session from an older build. It
  // must not be treated as the Google account for the current app.
  if (auth.currentUser?.isAnonymous) {
    await signOut(auth);
  }

  // A persisted Google user is already authoritative; do not wait for a
  // redirect result that does not exist on ordinary page loads.
  if (auth.currentUser) return auth.currentUser;

  // Resolve a pending signInWithRedirect result before waiting for the final
  // auth state. If an interrupted redirect never resolves, release the UI
  // after a short timeout so the user can try again with the popup flow.
  const redirectResult = await Promise.race([
    getRedirectResult(auth),
    new Promise<null>((resolve) => {
      setTimeout(() => resolve(null), redirectResultTimeoutMilliseconds);
    }),
  ]);

  return redirectResult?.user ?? auth.currentUser;
}

export async function signInWithGoogle(): Promise<User | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  pendingAuthentication ??= signInWithPopup(auth, provider)
    .then((result) => result.user)
    .catch(async (caughtError) => {
      if (!shouldFallbackToRedirect(caughtError)) throw caughtError;

      await signInWithRedirect(auth, provider);
      return null;
    })
    .finally(() => {
      pendingAuthentication = null;
    });

  return pendingAuthentication;
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}
