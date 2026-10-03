import { getDashboardForSource, parseDataSource } from "@/server/data/provider";
import { apiDataSourceErrorResponse, dataSourceResponse } from "@/server/http/responses";

export async function GET(request: Request): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const result = await getDashboardForSource(source);
    return dataSourceResponse({ ...result, data: result.data.signals });
  } catch (error) {
    return apiDataSourceErrorResponse(error);
  }
}
