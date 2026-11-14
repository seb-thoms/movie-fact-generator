import "server-only";

import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";

import { db } from "./db";
import { env } from "./env";

/**
 * Better Auth instance. Step 1 configures only the database, which is all the
 * Better Auth CLI needs to generate the auth models. Step 2 adds the Google
 * provider, session and cookie settings, and the name fallback (SPEC §3.2, §5).
 */
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,
});
