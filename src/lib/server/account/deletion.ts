import "server-only";

import { db } from "../db";

export type TokenRevoker = (token: string, signal: AbortSignal) => Promise<void>;

const REVOKE_TIMEOUT_MS = 5_000;

/**
 * Hard-deletes the user's account (SPEC §12).
 *  1. Best-effort Google token revocation first: the token is stored on the
 *     account row, which the delete removes. A failure is logged and never
 *     blocks deletion. (Limitation: Google may reject an expired access token;
 *     reliable revocation would need a stored refresh token, which we don't keep.)
 *  2. Delete the user in one statement. Foreign keys cascade to sessions,
 *     accounts, favorites, fact deliveries, and leases. Movies and facts are
 *     shared and contain no personal data, so they stay.
 * Deleting the sessions logs the user out everywhere.
 */
export async function deleteAccount(
  userId: string,
  deps: { revokeGoogleToken: TokenRevoker },
): Promise<void> {
  await revokeGoogleAccessToken(userId, deps.revokeGoogleToken);
  await db.$transaction(async (tx) => {
    await tx.user.delete({ where: { id: userId } });
  });
}

async function revokeGoogleAccessToken(userId: string, revoke: TokenRevoker): Promise<void> {
  const account = await db.account.findFirst({
    where: { userId, providerId: "google", accessToken: { not: null } },
    select: { accessToken: true },
  });
  if (!account?.accessToken) return;

  try {
    await revoke(account.accessToken, AbortSignal.timeout(REVOKE_TIMEOUT_MS));
  } catch (error) {
    // Never log the token or the raw error message (it might echo the token).
    console.warn({
      event: "google_revoke_failed",
      userId,
      errorClass: error instanceof Error ? error.constructor.name : typeof error,
    });
  }
}
