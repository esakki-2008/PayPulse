import { z } from "zod";

import { approveAgentAction } from "@/server/actions/engine";
import { parseDataSource } from "@/server/data/provider";
import { apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

const inputSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(1).max(500).optional() }).strict();
interface RouteContext { readonly params: Promise<{ actionId: string }>; }

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ actionId }, body] = await Promise.all([context.params, request.json()]);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const input = inputSchema.parse(body);
    const action = await approveAgentAction(source, actionId, input.version, input.reason);
    return dataSourceResponse({ data: action, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() });
  } catch (error) { return apiErrorResponse(error); }
}
