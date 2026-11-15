import { getProfile } from "@/lib/server/account/profile";
import { toErrorResponse } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";

// GET /api/me: the signed-in user and their favorite movies (SPEC §6).
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return Response.json(await getProfile(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}
