import { getActionForSource } from "@/server/actions/engine";
import { getExecutionOutcomeRepository } from "@/server/actions/execution/outcome";
import { getAgentActionRepository } from "@/server/actions/repository";
import { parseDataSource } from "@/server/data/provider";
import { requireApiRequest } from "@/server/http/request";
import { apiErrorResponse } from "@/server/http/responses";
import { PayPalOrderService } from "@/server/paypal/order-service";

interface RouteContext { readonly params: Promise<{ actionId: string }>; }

/** Retrieves a known PayPulse-created order by stored merchant-scoped binding only. */
export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    if (source !== "paypal_sandbox") return Response.json({ error: "Demo orders are disabled." }, { status: 501 });
    const { actionId } = await context.params;
    const merchantId = api.actor.merchantId;
    const action = await getActionForSource(source, actionId, getAgentActionRepository(merchantId));
    if (!action) return Response.json({ error: "Action not found in the selected data source." }, { status: 404 });
    if (action.type !== "PAYPAL_SANDBOX_PAYMENT_VERIFICATION") return Response.json({ error: "Only the explicit Sandbox verification action has a known checkout order." }, { status: 409 });
    const execution = [...await getExecutionOutcomeRepository(merchantId).listByActionId(action.id)].reverse().find((candidate) => candidate.operation === "capture_order" && candidate.paypalReference);
    if (!execution?.paypalReference) return Response.json({ error: "No known PayPal Sandbox order is bound to this action." }, { status: 404 });
    const order = await new PayPalOrderService().getOrderById(execution.paypalReference);
    return Response.json({ data: { orderId: order.orderId, status: order.status, providerStatus: order.providerStatus, approvalUrl: order.approvalUrl }, meta: { source, environment: "sandbox" }, requestId: api.requestId }, { headers: { "x-request-id": api.requestId } });
  } catch (error) { return apiErrorResponse(error); }
}
