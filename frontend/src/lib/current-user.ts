export const knownUsers = ["cloud", "stone"] as const;

export type CurrentUser = (typeof knownUsers)[number];

export function isCurrentUser(value: string | null): value is CurrentUser {
  return value === "cloud" || value === "stone";
}

export function getCurrentUserFromUrl(url = window.location.href): CurrentUser | null {
  const value = new URL(url).searchParams.get("user")?.trim().toLowerCase() ?? null;
  return isCurrentUser(value) ? value : null;
}

export function setCurrentUserInUrl(user: CurrentUser): void {
  const url = new URL(window.location.href);
  url.searchParams.set("user", user);
  window.history.replaceState({}, "", url);
}

export function clearCurrentUserFromUrl(): void {
  const url = new URL(window.location.href);
  url.searchParams.delete("user");
  window.history.replaceState({}, "", url);
}
