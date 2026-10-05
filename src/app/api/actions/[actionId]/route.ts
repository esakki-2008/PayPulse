import { getActionForSource } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

interface RouteContext { readonly params: Promise<{ actionId: string }>; }
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const [{ actionId }, source] = await Promise.all([context.params, Promise.resolve(parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined))]);
    const action = await getActionForSource(source, actionId, getAgentActionRepository(api.actor.merchantId));
    if (!action) return Response.json({ error: "Action not found in the selected data source." }, { status: 404, headers: { "x-request-id": api.requestId } });
    return dataSourceResponse({ data: action, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() }, { requestId: api.requestId });
  } catch (error) { return apiErrorResponse(error); }
}
