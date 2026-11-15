import { deleteAccount } from "@/lib/server/account/deletion";
import { revokeGoogleToken } from "@/lib/server/account/google-revocation";
import { getProfile } from "@/lib/server/account/profile";
import { expiredSessionCookie } from "@/lib/server/account/session-cookie";
import { AppError, toErrorResponse } from "@/lib/server/errors";
import { requireUser } from "@/lib/server/session";
import { deleteConfirmationSchema } from "@/lib/shared/schemas";

// GET /api/me: the signed-in user and their favorite movies (SPEC §6).
export async function GET(): Promise<Response> {
  try {
    const user = await requireUser();
    return Response.json(await getProfile(user));
  } catch (error) {
    return toErrorResponse(error);
  }
}

// DELETE /api/me: hard-delete the account (SPEC §12). Body must be exactly
// { "confirm": "delete" }; anything else (including bad JSON) is a 400.
export async function DELETE(request: Request): Promise<Response> {
  try {
    const user = await requireUser();
    const body: unknown = await request.json().catch(() => null);
    if (!deleteConfirmationSchema.safeParse(body).success) {
      throw new AppError("BAD_CONFIRMATION", 400, 'Type "delete" to confirm.');
    }
    await deleteAccount(user.id, { revokeGoogleToken });
    return new Response(null, {
      status: 204,
      headers: { "set-cookie": await expiredSessionCookie() },
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}
