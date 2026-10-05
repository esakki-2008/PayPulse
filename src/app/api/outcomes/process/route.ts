import { z } from "zod";

import { materializeOutcomeFromExecution, OutcomeLearningValidationError } from "@/server/actions/learning/engine";
import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { getExecutionOutcomeRepository } from "@/server/actions/execution/outcome";
import { getAgentActionRepository } from "@/server/actions/repository";
import { parseDataSource } from "@/server/data/provider";
import { parseBoundedJson, requireApiRequest } from "@/server/http/request";
import { apiErrorResponse } from "@/server/http/responses";

const processSchema = z.object({ executionId: z.string().trim().min(1).max(200) }).strict();
/** The input identifies a persisted execution only; it cannot submit provider facts or a learning delta. */
export async function POST(request: Request): Promise<Response> {
  try {
    const api = await requireApiRequest(request, { mutation: true });
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const body = processSchema.parse(await parseBoundedJson(request));
    const merchantId = api.actor.merchantId;
    const result = await materializeOutcomeFromExecution({ source, executionId: body.executionId }, {
      actionRepository: getAgentActionRepository(merchantId), executionRepository: getExecutionOutcomeRepository(merchantId), outcomeRepository: getOutcomeLearningRepository(merchantId),
    });
    return Response.json({ data: { outcome: result.outcome, learning: result.event, createdOutcome: result.createdOutcome, createdLearningEvent: result.createdLearningEvent }, meta: { source, environment: "sandbox" }, requestId: api.requestId }, { headers: { "x-request-id": api.requestId } });
  } catch (error) {
    if (error instanceof OutcomeLearningValidationError) return Response.json({ error: error.message }, { status: 422 });
    return apiErrorResponse(error);
  }
}
