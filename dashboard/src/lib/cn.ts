// Minimal className joiner (no deps). Avoids conflicting utilities by convention.
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
