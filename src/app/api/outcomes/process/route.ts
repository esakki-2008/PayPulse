import { z } from "zod";

import { OutcomeLearningValidationError, materializeOutcomeFromExecution } from "../../../../server/actions/learning/engine";
import { parseDataSource } from "../../../../server/data/provider";
import { apiErrorResponse } from "../../../../server/http/responses";

const processSchema = z.object({ executionId: z.string().min(1).max(200) }).strict();

/**
 * An intentionally narrow server-derived processor. Client input can identify a
 * previously persisted execution only; it cannot submit outcome status, payment
 * IDs, amounts, customer details, provider facts, or learning deltas.
 */
export async function POST(request: Request): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const body = processSchema.parse(await request.json());
    const result = await materializeOutcomeFromExecution({ source, executionId: body.executionId });
    return Response.json({
      data: { outcome: result.outcome, learning: result.event, createdOutcome: result.createdOutcome, createdLearningEvent: result.createdLearningEvent },
      meta: { source, environment: "sandbox" },
    });
  } catch (error) {
    if (error instanceof OutcomeLearningValidationError) {
      return Response.json({ error: error.message }, { status: 422 });
    }
    return apiErrorResponse(error);
  }
}
