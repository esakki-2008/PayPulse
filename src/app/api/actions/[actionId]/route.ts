import { getActionForSource } from "@/server/actions/engine";
import { parseDataSource } from "@/server/data/provider";
import { apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

interface RouteContext { readonly params: Promise<{ actionId: string }>; }
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ actionId }, source] = await Promise.all([context.params, Promise.resolve(parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined))]);
    const action = await getActionForSource(source, actionId);
    if (!action) return new Response(JSON.stringify({ error: "Action not found in the selected data source." }), { status: 404, headers: { "content-type": "application/json" } });
    return dataSourceResponse({ data: action, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() });
  } catch (error) { return apiErrorResponse(error); }
}
