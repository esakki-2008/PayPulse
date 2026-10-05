import { createPayPalSandboxVerificationAction } from "@/server/actions/engine";
import { getAgentActionRepository } from "@/server/actions/repository";
import { PayPalConfigurationError } from "@/server/paypal/config";
import { requireApiRequest, requireEmptyBody } from "@/server/http/request";
import { apiErrorResponse } from "@/server/http/responses";

/** Creates only an explicit approval-required Sandbox verification candidate. */
export async function POST(request: Request): Promise<Response> {
  try {
    const api = await requireApiRequest(request, { mutation: true });
    await requireEmptyBody(request);
    const action = await createPayPalSandboxVerificationAction(getAgentActionRepository(api.actor.merchantId), undefined, api.actor.merchantId);
    return Response.json({
      data: action,
      meta: { source: "paypal_sandbox", environment: "sandbox", notice: "Sandbox payment — no real money. Buyer approval is required before capture." },
      requestId: api.requestId,
    }, { status: 201, headers: { "x-request-id": api.requestId } });
  } catch (error) {
    if (error instanceof PayPalConfigurationError) return Response.json({ error: "PayPal Sandbox checkout verification is not configured safely." }, { status: 503 });
    return apiErrorResponse(error);
  }
}
