import { knownUsers, type CurrentUser } from "./current-user.ts";

export type UserIdentityMetadata = {
  authUID?: unknown;
} | null | undefined;

/**
 * Return every profile bound to an exact Firebase Authentication UID.
 *
 * The caller must treat anything other than one match as untrusted. In
 * particular, a duplicate binding is not resolved by picking the first
 * document.
 */
export function findUsersByAuthUID(
  authUID: string,
  metadataByUser: Partial<Record<CurrentUser, UserIdentityMetadata>>,
): CurrentUser[] {
  if (!authUID) return [];

  return knownUsers.filter((user) =>
    metadataByUser[user]?.authUID === authUID,
  );
}
