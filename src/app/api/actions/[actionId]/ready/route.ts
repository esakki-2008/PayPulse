import { z } from "zod";

import { markReadyForExecutionWithEvent } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { parseDataSource } from "@/server/data/provider";
import { parseBoundedJson, requireApiRequest } from "@/server/http/request";
import { apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

const inputSchema = z.object({ version: z.number().int().positive() }).strict();
interface RouteContext { readonly params: Promise<{ actionId: string }>; }

/** Records readiness only. It does not invoke an execution capability. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request, { mutation: true });
    const [{ actionId }, body] = await Promise.all([context.params, parseBoundedJson(request)]);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const result = await markReadyForExecutionWithEvent(source, actionId, inputSchema.parse(body).version, getAgentActionRepository(api.actor.merchantId));
    return dataSourceResponse({ data: result.action, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() }, { auditEvent: result.event, requestId: api.requestId });
  } catch (error) { return apiErrorResponse(error); }
}
