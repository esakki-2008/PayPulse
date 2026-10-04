import { generateActionsForSource } from "@/server/actions/engine";
import { DataSourceError, parseDataSource } from "@/server/data/provider";
import { apiDataSourceErrorResponse, apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

/** Explicit action generation from deterministic intelligence; never a page-load side effect. */
export async function POST(request: Request): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const generated = await generateActionsForSource(source);
    return dataSourceResponse({ data: generated, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() });
  } catch (error) {
    if (error instanceof DataSourceError) return apiDataSourceErrorResponse(error);
    return apiErrorResponse(error);
  }
}
