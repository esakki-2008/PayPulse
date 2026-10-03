import { getIntelligenceForSource, parseDataSource } from "@/server/data/provider";
import { apiDataSourceErrorResponse, dataSourceResponse } from "@/server/http/responses";

/** Read-only deterministic intelligence; AI is only invoked by explicit POST /analyze. */
export async function GET(request: Request): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    return dataSourceResponse(await getIntelligenceForSource(source));
  } catch (error) {
    return apiDataSourceErrorResponse(error);
  }
}
