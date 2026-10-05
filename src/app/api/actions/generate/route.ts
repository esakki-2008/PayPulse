import { generateActionsForSource } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { DataSourceError, parseDataSource } from "@/server/data/provider";
import { requireApiRequest, requireEmptyBody } from "@/server/http/request";
import { apiDataSourceErrorResponse, apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

/** Explicit, authenticated action generation from deterministic intelligence; never a page-load side effect. */
export async function POST(request: Request): Promise<Response> {
  try {
    const context = await requireApiRequest(request, { mutation: true });
    await requireEmptyBody(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const generated = await generateActionsForSource(source, getAgentActionRepository(context.actor.merchantId), context.actor.merchantId);
    return dataSourceResponse({ data: generated, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() }, { requestId: context.requestId });
  } catch (error) {
    if (error instanceof DataSourceError) return apiDataSourceErrorResponse(error);
    return apiErrorResponse(error);
  }
}
