import { z } from "zod";

import {
  rejectAction,
  requireDemoMerchantOperator,
} from "@/server/actions/service";
import { apiErrorResponse, demoDataResponse } from "@/server/http/responses";

const rejectionSchema = z.object({
  version: z.number().int().positive(),
  reason: z.string().trim().max(240).optional(),
});

interface RouteContext {
  readonly params: Promise<{ actionId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { actionId } = await context.params;
    const input = rejectionSchema.parse(await request.json());
    const actor = requireDemoMerchantOperator(request);
    const action = await rejectAction(actionId, input.version, actor, input.reason);

    return demoDataResponse(action);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
