import { getActionPlanForSource } from "@/server/actions/engine";
import { parseDataSource } from "@/server/data/provider";
import { apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

interface RouteContext { readonly params: Promise<{ planId: string }>; }
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { planId } = await context.params;
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const plan = await getActionPlanForSource(source, planId);
    if (!plan) return new Response(JSON.stringify({ error: "Action plan not found in the selected data source." }), { status: 404, headers: { "content-type": "application/json" } });
    return dataSourceResponse({ data: plan, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() });
  } catch (error) { return apiErrorResponse(error); }
}
