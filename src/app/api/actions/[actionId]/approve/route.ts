import { z } from "zod";

import { approveAgentActionWithEvent } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { parseDataSource } from "@/server/data/provider";
import { parseBoundedJson, requireApiRequest } from "@/server/http/request";
import { apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

const inputSchema = z.object({ version: z.number().int().positive(), reason: z.string().trim().min(1).max(500).optional() }).strict();
interface RouteContext { readonly params: Promise<{ actionId: string }>; }

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request, { mutation: true });
    const [{ actionId }, body] = await Promise.all([context.params, parseBoundedJson(request)]);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const input = inputSchema.parse(body);
    const result = await approveAgentActionWithEvent(source, actionId, input.version, input.reason, getAgentActionRepository(api.actor.merchantId));
    return dataSourceResponse({ data: result.action, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() }, { auditEvent: result.event, requestId: api.requestId });
  } catch (error) { return apiErrorResponse(error); }
}
