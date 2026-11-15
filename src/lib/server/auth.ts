import "server-only";

import { betterAuth, type BetterAuthOptions } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import type { GoogleProfile } from "better-auth/social-providers";

import { db } from "./db";
import { displayNameFromProfile } from "./display-name";
import { env } from "./env";

/**
 * Better Auth configuration (SPEC §2, §3.2, §5). Exported separately from the
 * instance so tests can build a test-only instance from the same options.
 *
 * Defaults we rely on (each covered by a test):
 * - Database sessions, looked up on every request (no cookie cache), so
 *   deleting a session revokes it immediately.
 * - Session cookie: HttpOnly, SameSite=Lax, Secure when BETTER_AUTH_URL is https.
 * - OAuth state and PKCE are handled by Better Auth.
 */
export const authOptions = {
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
  socialProviders: {
    google: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      // "online": Google issues no refresh token, and we deliberately don't
      // store one (SPEC §12).
      accessType: "online",
      mapProfileToUser: (profile: GoogleProfile) => ({
        name: displayNameFromProfile(profile.name, profile.email),
      }),
    },
  },
} satisfies BetterAuthOptions;

export const auth = betterAuth(authOptions);
