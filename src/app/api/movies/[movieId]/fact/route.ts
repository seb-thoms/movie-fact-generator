import { env } from "@/lib/server/env";
import { toErrorResponse } from "@/lib/server/errors";
import { getFactForUser } from "@/lib/server/facts/fact-service";
import { createProductionFactGenerator } from "@/lib/server/openai/client";
import { requireUser } from "@/lib/server/session";
import type { FactResponse } from "@/lib/shared/api";

// Typed by hand (not Next's generated RouteContext) so typecheck works on a fresh clone.
type RouteContext = { params: Promise<{ movieId: string }> };

// GET /api/movies/:movieId/fact (SPEC §6, §7).
export async function GET(_request: Request, { params }: RouteContext): Promise<Response> {
  try {
    const user = await requireUser();
    const { movieId } = await params;
    const { fact, source } = await getFactForUser(user.id, movieId, {
      generator: createProductionFactGenerator(),
      strategy: env.FACT_STRATEGY,
      poolSize: env.FACT_POOL_SIZE,
    });
    const body: FactResponse = {
      fact: { id: fact.id, content: fact.content, createdAt: fact.createdAt.toISOString() },
      source,
      stale: source === "fallback",
    };
    return Response.json(body);
  } catch (error) {
    return toErrorResponse(error);
  }
}
