import {
  browserLocalPersistence,
  getRedirectResult,
  GoogleAuthProvider,
  setPersistence,
  signInWithRedirect,
  signOut,
  type User,
} from "firebase/auth";

import { auth } from "./firebase";

let pendingAuthentication: Promise<User | null> | null = null;

export async function restoreGoogleAuth(): Promise<User | null> {
  await setPersistence(auth, browserLocalPersistence);

  // Resolve a pending signInWithRedirect result before waiting for the final
  // auth state. Firebase waits for this result during auth-state callbacks.
  const redirectResult = await getRedirectResult(auth);
  await auth.authStateReady();

  // A browser may still have an anonymous session from an older build. It
  // must not be treated as the Google account for the current app.
  if (auth.currentUser?.isAnonymous) {
    await signOut(auth);
  }

  return redirectResult?.user ?? auth.currentUser;
}

export function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  pendingAuthentication ??= setPersistence(auth, browserLocalPersistence)
    .then(() => signInWithRedirect(auth, provider).then(() => null))
    .finally(() => {
      pendingAuthentication = null;
    });

  return pendingAuthentication.then(() => undefined);
}

export async function signOutGoogle(): Promise<void> {
  await signOut(auth);
}
