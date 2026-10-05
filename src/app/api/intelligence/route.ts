import { getIntelligenceForSource, parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiDataSourceErrorResponse, dataSourceResponse } from "@/server/http/responses";

/** Read-only deterministic intelligence; AI is only invoked by explicit POST /analyze. */
export async function GET(request: Request): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    return dataSourceResponse(await getIntelligenceForSource(source, api.actor.merchantId), { requestId: api.requestId });
  } catch (error) { return apiDataSourceErrorResponse(error); }
}
