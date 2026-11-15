/**
 * Initials for the avatar shown when a user has no photo (SPEC §11):
 * first + last word's first letter. Array.from splits by code point, so
 * non-Latin names and accented letters work ("千尋" → "千", "élodie" → "É").
 */
export function initialsFor(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  if (!first) return "?";
  const last = words.length > 1 ? words[words.length - 1] : undefined;
  return [first, last]
    .filter((word): word is string => word !== undefined)
    .map((word) => Array.from(word)[0] ?? "")
    .join("")
    .toUpperCase();
}
