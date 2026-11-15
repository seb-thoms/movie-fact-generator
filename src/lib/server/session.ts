import "server-only";

import { headers } from "next/headers";

import { auth } from "./auth";
import { AppError } from "./errors";

/** The signed-in user, as the rest of the app sees it. */
export type SessionUser = { id: string; name: string; email: string; image: string | null };

/**
 * The authoritative auth check (SPEC §5). Looks up the request's session in the
 * database through Better Auth. Throws 401 UNAUTHENTICATED when there is no
 * valid session: no cookie, a forged or expired one, or a revoked session.
 * The proxy's cookie check is only an optimistic shortcut; this is the boundary.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    throw new AppError("UNAUTHENTICATED", 401, "Please sign in to continue.");
  }

  const { id, name, email, image } = session.user;
  return { id, name, email, image: image ?? null };
}

/**
 * Like requireUser(), but returns null instead of throwing when signed out.
 * For pages that render differently for visitors (the landing page).
 */
export async function getOptionalUser(): Promise<SessionUser | null> {
  try {
    return await requireUser();
  } catch (error) {
    if (error instanceof AppError && error.code === "UNAUTHENTICATED") return null;
    throw error;
  }
}
