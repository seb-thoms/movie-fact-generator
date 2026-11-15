import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/server/auth";

// Better Auth owns every /api/auth/* endpoint: sign-in, the OAuth callback,
// sign-out, and session lookups (SPEC §6).
export const { GET, POST } = toNextJsHandler(auth);
