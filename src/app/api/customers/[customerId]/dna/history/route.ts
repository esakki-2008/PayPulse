import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiErrorResponse } from "@/server/http/responses";

interface RouteContext { readonly params: Promise<{ customerId: string }>; }
/** Returns append-only, deterministic Payment DNA deltas rather than mutable snapshots. */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const { customerId } = await context.params;
    const events = await getOutcomeLearningRepository(api.actor.merchantId).listLearningEvents(source, customerId);
    return Response.json({
      data: events.map((event) => ({ learningEventId: event.learningEventId, outcomeId: event.outcomeId, timestamp: event.timestamp, outcome: event.outcome, correlation: event.correlation, learningStatus: event.learningStatus, dnaDelta: event.dnaDelta, limitations: event.limitations })),
      meta: { source, environment: source === "demo" ? "demo" : "sandbox" }, requestId: api.requestId,
    }, { headers: { "x-request-id": api.requestId } });
  } catch (error) { return apiErrorResponse(error); }
}
