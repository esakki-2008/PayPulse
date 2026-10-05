import { getCustomerLearningState } from "@/server/actions/learning/engine";
import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiErrorResponse } from "@/server/http/responses";

interface RouteContext { readonly params: Promise<{ customerId: string }>; }
/** Immutable outcome/learning timeline; it does not query optional Transaction Search. */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const { customerId } = await context.params;
    const state = await getCustomerLearningState(source, customerId, [], getOutcomeLearningRepository(api.actor.merchantId));
    return Response.json({ data: state, meta: { source, environment: source === "demo" ? "demo" : "sandbox" }, requestId: api.requestId }, { headers: { "x-request-id": api.requestId } });
  } catch (error) { return apiErrorResponse(error); }
}
