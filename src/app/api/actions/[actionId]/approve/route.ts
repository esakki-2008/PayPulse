import { z } from "zod";

import {
  approveAction,
  requireDemoMerchantOperator,
  requireExplicitDemoSource,
} from "@/server/actions/service";
import { apiErrorResponse, demoDataResponse } from "@/server/http/responses";

const approvalSchema = z.object({
  version: z.number().int().positive(),
});

interface RouteContext {
  readonly params: Promise<{ actionId: string }>;
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { actionId } = await context.params;
    const input = approvalSchema.parse(await request.json());
    requireExplicitDemoSource(request);
    const actor = requireDemoMerchantOperator(request);
    const action = await approveAction(actionId, input.version, actor);

    return demoDataResponse(action);
  } catch (error) {
    return apiErrorResponse(error);
  }
}
