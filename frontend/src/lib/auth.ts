import { signInAnonymously, type User } from "firebase/auth";

import { auth } from "./firebase";

let pendingAuthentication: Promise<User> | null = null;

export function ensureAnonymousAuth(): Promise<User> {
  if (auth.currentUser) {
    return Promise.resolve(auth.currentUser);
  }

  pendingAuthentication ??= auth
    .authStateReady()
    .then(async () => {
      if (auth.currentUser) {
        return auth.currentUser;
      }

      const credential = await signInAnonymously(auth);
      return credential.user;
    })
    .finally(() => {
      pendingAuthentication = null;
    });

  return pendingAuthentication;
}
