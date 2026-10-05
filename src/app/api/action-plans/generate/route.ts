import { generateActionPlanForSource } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { DataSourceError, parseDataSource } from "@/server/data/provider";
import { requireApiRequest, requireEmptyBody } from "@/server/http/request";
import { apiDataSourceErrorResponse, apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

export async function POST(request: Request): Promise<Response> {
  try {
    const api = await requireApiRequest(request, { mutation: true });
    await requireEmptyBody(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const result = await generateActionPlanForSource(source, getAgentActionRepository(api.actor.merchantId), api.actor.merchantId);
    return dataSourceResponse({ data: result, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() }, { requestId: api.requestId });
  } catch (error) {
    if (error instanceof DataSourceError) return apiDataSourceErrorResponse(error);
    return apiErrorResponse(error);
  }
}
