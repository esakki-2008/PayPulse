import { PayPalConfigurationError } from "../../../../server/paypal/config";
import { createPayPalSandboxVerificationAction } from "../../../../server/actions/engine";
import { apiErrorResponse } from "../../../../server/http/responses";

/**
 * Creates only an explicit, approval-required Sandbox verification candidate.
 * It accepts no body: browser callers cannot select buyer, amount, currency,
 * return URL, provider operation, resource ID, or provider facts.
 */
export async function POST(request: Request): Promise<Response> {
  if ((await request.text()).trim()) {
    return Response.json({ error: "Sandbox verification creation accepts no browser financial or provider facts." }, { status: 400 });
  }
  try {
    const action = await createPayPalSandboxVerificationAction();
    return Response.json({
      data: action,
      meta: {
        source: "paypal_sandbox",
        environment: "sandbox",
        notice: "Sandbox payment — no real money. Buyer approval is required before capture.",
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof PayPalConfigurationError) {
      return Response.json({ error: "PayPal Sandbox checkout verification is not configured safely." }, { status: 503 });
    }
    return apiErrorResponse(error);
  }
}
