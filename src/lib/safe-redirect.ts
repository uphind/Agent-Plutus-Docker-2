/**
 * Returns the input only if it is a safe, same-origin relative path.
 * Rejects absolute URLs, protocol-relative URLs ("//evil.com"), and
 * anything that doesn't start with a single "/". Prevents open-redirect
 * abuse via attacker-controlled callbackUrl / RelayState values.
 */
export function sanitizeCallbackUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value !== "string") return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//")) return null;
  if (value.startsWith("/\\")) return null;
  return value;
}
