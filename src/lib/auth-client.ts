import { createAuthClient } from "better-auth/react";

// Browser-side Better Auth client. It talks to our own /api/auth/* routes on
// the same origin, so no URL or secret is needed here.
export const authClient = createAuthClient();
