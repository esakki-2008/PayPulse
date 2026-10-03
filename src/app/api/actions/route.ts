import { listActionsForSource } from "@/server/actions/engine";
import { DataSourceError, getIntelligenceForSource, parseDataSource } from "@/server/data/provider";
import { apiDataSourceErrorResponse, apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

export async function GET(request: Request): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    await getIntelligenceForSource(source);
    return dataSourceResponse({
      data: await listActionsForSource(source),
      source,
      environment: source === "demo" ? "demo" : "sandbox",
      generatedAt: new Date().toISOString(),
    });
  } catch (error) { return error instanceof DataSourceError ? apiDataSourceErrorResponse(error) : apiErrorResponse(error); }
}
