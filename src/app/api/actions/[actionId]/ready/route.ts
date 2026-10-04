import { z } from "zod";

import { markReadyForExecutionWithEvent } from "@/server/actions/engine";
import { parseDataSource } from "@/server/data/provider";
import { apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

const inputSchema = z.object({ version: z.number().int().positive() }).strict();
interface RouteContext { readonly params: Promise<{ actionId: string }>; }

/** Records readiness only. It does not invoke an execution capability. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const [{ actionId }, body] = await Promise.all([context.params, request.json()]);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const result = await markReadyForExecutionWithEvent(source, actionId, inputSchema.parse(body).version);
    return dataSourceResponse({ data: result.action, source, environment: source === "demo" ? "demo" : "sandbox", generatedAt: new Date().toISOString() }, { auditEvent: result.event });
  } catch (error) { return apiErrorResponse(error); }
}
