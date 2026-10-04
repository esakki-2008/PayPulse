import { getCustomersForSource, parseDataSource } from "@/server/data/provider";
import { apiDataSourceErrorResponse, dataSourceResponse } from "@/server/http/responses";

export async function GET(request: Request): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    return dataSourceResponse(await getCustomersForSource(source));
  } catch (error) {
    return apiDataSourceErrorResponse(error);
  }
}
