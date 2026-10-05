import { ActionExecutionUnavailableError, completeApprovedPayPalSandboxAction } from "@/server/actions/execution/executor";
import { getExecutionOutcomeRepository } from "@/server/actions/execution/outcome";
import { getOutcomeLearningRepository } from "@/server/actions/learning/repository";
import { getAgentActionRepository } from "@/server/actions/repository";
import { parseDataSource } from "@/server/data/provider";
import { requireApiRequest, requireEmptyBody, requestIdFor } from "@/server/http/request";
import { apiErrorResponse } from "@/server/http/responses";

interface RouteContext { readonly params: Promise<{ actionId: string }>; }

/** Post-approval verifier: the browser supplies no provider resource or financial facts. */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request, { mutation: true });
    await requireEmptyBody(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const { actionId } = await context.params;
    const merchantId = api.actor.merchantId;
    const result = await completeApprovedPayPalSandboxAction({ source, actionId }, {
      actionRepository: getAgentActionRepository(merchantId),
      outcomeRepository: getExecutionOutcomeRepository(merchantId),
      learningRepository: getOutcomeLearningRepository(merchantId),
    });
    return Response.json({
      data: { execution: result.outcome, action: result.action, outcome: result.learning?.outcome ?? null, learning: result.learning?.event ?? null, buyerApprovalRequired: result.buyerApprovalRequired, approvalUrl: result.approvalUrl, executionOccurred: result.executionOccurred, idempotent: result.idempotent },
      meta: { source, environment: "sandbox", category: result.outcome.failureCategory }, requestId: api.requestId,
    }, { status: result.status, headers: { "x-request-id": api.requestId } });
  } catch (error) {
    if (error instanceof ActionExecutionUnavailableError) {
      const requestId = requestIdFor(request);
      return Response.json({ error: error.message, meta: { source: "paypal_sandbox", environment: "sandbox", category: "capability" }, requestId }, { status: error.status, headers: { "x-request-id": requestId } });
    }
    return apiErrorResponse(error);
  }
}
