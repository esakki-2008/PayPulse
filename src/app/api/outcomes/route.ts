import { getOutcomeLearningRepository } from "../../../server/actions/learning/repository";
import { parseDataSource } from "../../../server/data/provider";
import { apiErrorResponse } from "../../../server/http/responses";

/** Lists immutable, source-qualified outcome audit records. */
export async function GET(request: Request): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const outcomes = await getOutcomeLearningRepository().listOutcomes(source);
    return Response.json({ data: outcomes, meta: { source, environment: source === "demo" ? "demo" : "sandbox" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
}
