import { getActionPlanForSource } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

interface RouteContext { readonly params: Promise<{ planId: string }>; }
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const { planId } = await context.params;
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const plan = await getActionPlanForSource(source, planId, getAgentActionRepository(api.actor.merchantId));
    if (!plan) return Response.json({ error: "Action plan not found in the selected data source." }, { status: 404, headers: { "x-request-id": api.requestId } });
    return dataSourceResponse({ data: plan, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() }, { requestId: api.requestId });
  } catch (error) { return apiErrorResponse(error); }
}
