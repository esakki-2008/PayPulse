import { getCustomerLearningState } from "../../../../../server/actions/learning/engine";
import { getOutcomeLearningRepository } from "../../../../../server/actions/learning/repository";
import { parseDataSource } from "../../../../../server/data/provider";
import { apiErrorResponse } from "../../../../../server/http/responses";

interface RouteContext { readonly params: Promise<{ customerId: string }>; }

/** Immutable outcome/learning timeline. This deliberately does not query the optional Transaction Search capability. */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const { customerId } = await context.params;
    const state = await getCustomerLearningState(source, customerId, [], getOutcomeLearningRepository());
    return Response.json({ data: state, meta: { source, environment: source === "demo" ? "demo" : "sandbox" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
