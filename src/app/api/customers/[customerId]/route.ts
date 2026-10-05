import { getCustomerForSource, parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiDataSourceErrorResponse, dataSourceResponse } from "@/server/http/responses";

interface RouteContext { readonly params: Promise<{ customerId: string }>; }
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const { customerId } = await context.params;
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const result = await getCustomerForSource(source, customerId, api.actor.merchantId);
    if (!result.data) return Response.json({ error: "Customer not found in the selected data source.", meta: { source: result.source, environment: result.environment } }, { status: 404, headers: { "x-request-id": api.requestId } });
    return dataSourceResponse(result, { requestId: api.requestId });
  } catch (error) { return apiDataSourceErrorResponse(error); }
}
