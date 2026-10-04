import {
  ActionExecutionUnavailableError,
  completeApprovedPayPalSandboxAction,
} from "../../../../../../server/actions/execution/executor";
import { parseDataSource } from "../../../../../../server/data/provider";
import { apiErrorResponse } from "../../../../../../server/http/responses";

interface RouteContext { readonly params: Promise<{ actionId: string }>; }

/**
 * Server-side post-approval verifier. The browser supplies no order ID,
 * payment ID, amount, currency, status, provider facts, or capture decision.
 */
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  if ((await request.text()).trim()) {
    return Response.json({ error: "Sandbox completion accepts no browser financial or provider facts." }, { status: 400 });
  }
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const { actionId } = await context.params;
    const result = await completeApprovedPayPalSandboxAction({ source, actionId });
    return Response.json({
      data: {
        execution: result.outcome,
        action: result.action,
        outcome: result.learning?.outcome ?? null,
        learning: result.learning?.event ?? null,
        buyerApprovalRequired: result.buyerApprovalRequired,
        approvalUrl: result.approvalUrl,
        executionOccurred: result.executionOccurred,
        idempotent: result.idempotent,
      },
      meta: { source, environment: "sandbox", category: result.outcome.failureCategory },
    }, { status: result.status });
  } catch (error) {
    if (error instanceof ActionExecutionUnavailableError) {
      return Response.json({ error: error.message, meta: { source: "paypal_sandbox", environment: "sandbox", category: "capability" } }, { status: error.status });
    }
    return apiErrorResponse(error);
  }
}
