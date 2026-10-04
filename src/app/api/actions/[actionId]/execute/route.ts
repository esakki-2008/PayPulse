import { z } from "zod";

import {
  ActionExecutionUnavailableError,
  executeApprovedPayPalSandboxAction,
} from "../../../../../server/actions/execution/executor";
import { materializeOutcomeFromExecution } from "../../../../../server/actions/learning/engine";
import { parseDataSource } from "../../../../../server/data/provider";
import { apiErrorResponse } from "../../../../../server/http/responses";

const inputSchema = z.object({ version: z.number().int().positive() }).strict();
interface RouteContext { readonly params: Promise<{ actionId: string }>; }

/**
 * Server-derived execution boundary. The request accepts only an exact action
 * version; browser input can never choose a PayPal endpoint, method, body,
 * amount, currency, resource ID, credentials, or idempotency key.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    if (source === "demo") {
      throw new ActionExecutionUnavailableError("Demo execution is disabled. Demo data is never mapped to PayPal Sandbox.", 501);
    }
    const [{ actionId }, body] = await Promise.all([context.params, request.json()]);
    const result = await executeApprovedPayPalSandboxAction({
      source,
      actionId,
      version: inputSchema.parse(body).version,
    });
    const learning = result.learning ?? await materializeOutcomeFromExecution({
      source,
      executionId: result.outcome.executionId,
    });
    return Response.json({
      data: {
        execution: result.outcome,
        action: result.action,
        outcome: learning.outcome,
        learning: learning.event,
        approvalUrl: result.approvalUrl,
        buyerApprovalRequired: result.buyerApprovalRequired,
        executionOccurred: result.executionOccurred,
        idempotent: result.idempotent,
      },
      meta: {
        source,
        environment: "sandbox",
        category: result.outcome.failureCategory,
      },
    }, { status: result.status });
  } catch (error) {
    if (error instanceof ActionExecutionUnavailableError) {
      return Response.json({
        error: error.message,
        executionOccurred: false,
        meta: { source: "paypal_sandbox", environment: "sandbox", category: "capability" },
      }, { status: error.status });
    }
    return apiErrorResponse(error);
  }
}
