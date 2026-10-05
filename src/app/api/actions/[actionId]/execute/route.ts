import { z } from "zod";

import { ActionExecutionUnavailableError, executeApprovedPayPalSandboxAction } from "@/server/actions/execution/executor";
import { getExecutionOutcomeRepository } from "@/server/actions/execution/outcome";
import { materializeOutcomeFromExecution } from "@/server/actions/learning/engine";
import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { getAgentActionRepository } from "@/server/actions/repository";
import { parseDataSource } from "@/server/data/provider";
import { parseBoundedJson, requireApiRequest, requestIdFor } from "@/server/http/request";
import { apiErrorResponse } from "@/server/http/responses";

const inputSchema = z.object({ version: z.number().int().positive() }).strict();
interface RouteContext { readonly params: Promise<{ actionId: string }>; }

/** The server accepts only an action version; all provider facts remain server-derived. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request, { mutation: true });
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    if (source === "demo") throw new ActionExecutionUnavailableError("Demo execution is disabled. Demo data is never mapped to PayPal Sandbox.", 501);
    const [{ actionId }, body] = await Promise.all([context.params, parseBoundedJson(request)]);
    const merchantId = api.actor.merchantId;
    const repositories = {
      actionRepository: getAgentActionRepository(merchantId),
      outcomeRepository: getExecutionOutcomeRepository(merchantId),
      learningRepository: getOutcomeLearningRepository(merchantId),
    };
    const result = await executeApprovedPayPalSandboxAction({ source, actionId, version: inputSchema.parse(body).version }, repositories);
    const learning = result.learning ?? await materializeOutcomeFromExecution(
      { source, executionId: result.outcome.executionId },
      { actionRepository: repositories.actionRepository, executionRepository: repositories.outcomeRepository, outcomeRepository: repositories.learningRepository },
    );
    return Response.json({
      data: { execution: result.outcome, action: result.action, outcome: learning.outcome, learning: learning.event, approvalUrl: result.approvalUrl, buyerApprovalRequired: result.buyerApprovalRequired, executionOccurred: result.executionOccurred, idempotent: result.idempotent },
      meta: { source, environment: "sandbox", category: result.outcome.failureCategory }, requestId: api.requestId,
    }, { status: result.status, headers: { "x-request-id": api.requestId } });
  } catch (error) {
    if (error instanceof ActionExecutionUnavailableError) {
      const requestId = requestIdFor(request);
      return Response.json({ error: error.message, executionOccurred: false, meta: { source: "paypal_sandbox", environment: "sandbox", category: "capability" }, requestId }, { status: error.status, headers: { "x-request-id": requestId } });
    }
    return apiErrorResponse(error);
  }
}
