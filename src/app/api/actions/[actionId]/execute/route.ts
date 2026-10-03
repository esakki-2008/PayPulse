import { z } from "zod";
import { NextResponse } from "next/server";

import {
  assertActionIsApprovedForFutureExecution,
  requireDemoMerchantOperator,
  requireExplicitDemoSource,
} from "@/server/actions/service";
import { apiErrorResponse } from "@/server/http/responses";

const executionSchema = z.object({
  version: z.number().int().positive(),
});

interface RouteContext {
  readonly params: Promise<{ actionId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { actionId } = await context.params;
    const input = executionSchema.parse(await request.json());
    requireExplicitDemoSource(request);
    requireDemoMerchantOperator(request);
    await assertActionIsApprovedForFutureExecution(actionId, input.version);

    return NextResponse.json(
      {
        error:
          "No execution occurred. PayPal Sandbox action execution is intentionally unavailable in Phase 4 and reserved for a later approved phase.",
        phase: 4,
      },
      { status: 501 },
    );
  } catch (error) {
    return apiErrorResponse(error);
  }
}
