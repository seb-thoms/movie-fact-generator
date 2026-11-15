/**
 * Better Auth requires User.name, but a Google profile can lack one. Fall back
 * to the part of the email before "@" (SPEC §3.2).
 */
export function displayNameFromProfile(name: string | undefined, email: string): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return email.split("@")[0] ?? email;
}
