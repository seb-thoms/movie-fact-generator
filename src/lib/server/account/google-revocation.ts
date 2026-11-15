import "server-only";

const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

/**
 * Revokes a Google OAuth token (Google's documented endpoint: POST, form-encoded
 * `token`, 200 on success, 400 on error). Revoking an access token also revokes
 * any linked refresh token. Errors never include the token itself.
 */
export async function revokeGoogleToken(token: string, signal: AbortSignal): Promise<void> {
  const response = await fetch(GOOGLE_REVOKE_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }).toString(),
    signal,
  });
  if (!response.ok)
    throw new Error(`Google token revocation failed with status ${response.status}`);
}
