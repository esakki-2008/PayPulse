import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiErrorResponse } from "@/server/http/responses";

/** Lists immutable merchant-scoped, source-qualified outcome audit records. */
export async function GET(request: Request): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const outcomes = await getOutcomeLearningRepository(api.actor.merchantId).listOutcomes(source);
    return Response.json({ data: outcomes, meta: { source, environment: source === "demo" ? "demo" : "sandbox" }, requestId: api.requestId }, { headers: { "x-request-id": api.requestId } });
  } catch (error) { return apiErrorResponse(error); }
}
