import { getAgentActionRepository } from "@/server/actions/repository";
import { listActionsForSource } from "@/server/actions/engine";
import { DataSourceError, getIntelligenceForSource, parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiDataSourceErrorResponse, apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

export async function GET(request: Request): Promise<Response> {
  try {
    const context = await requireApiRequest(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    await getIntelligenceForSource(source, context.actor.merchantId);
    return dataSourceResponse({
      data: await listActionsForSource(source, getAgentActionRepository(context.actor.merchantId)),
      source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString(),
    }, { requestId: context.requestId });
  } catch (error) { return error instanceof DataSourceError ? apiDataSourceErrorResponse(error) : apiErrorResponse(error); }
}
