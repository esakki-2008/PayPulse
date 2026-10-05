import { getDashboardForSource, parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiDataSourceErrorResponse, dataSourceResponse } from "@/server/http/responses";

export async function GET(request: Request): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    return dataSourceResponse(await getDashboardForSource(source, api.actor.merchantId), { requestId: api.requestId });
  } catch (error) { return apiDataSourceErrorResponse(error); }
}
