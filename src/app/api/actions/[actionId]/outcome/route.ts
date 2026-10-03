import { getOutcomeLearningRepository } from "../../../../../server/actions/learning/repository";
import { parseDataSource } from "../../../../../server/data/provider";
import { apiErrorResponse } from "../../../../../server/http/responses";

interface RouteContext { readonly params: Promise<{ actionId: string }>; }

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const { actionId } = await context.params;
    const outcomes = await getOutcomeLearningRepository().listOutcomes(source, { actionId });
    return Response.json({ data: outcomes, meta: { source, environment: source === "demo" ? "demo" : "sandbox" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
