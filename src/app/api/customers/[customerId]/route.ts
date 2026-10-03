import { getDemoRepository } from "@/server/database/demo-store";
import { demoDataResponse } from "@/server/http/responses";
import { NextResponse } from "next/server";

interface RouteContext {
  readonly params: Promise<{ customerId: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { customerId } = await context.params;
  const customer = await getDemoRepository().getCustomer(customerId);

  if (!customer) {
    return NextResponse.json({ error: "Customer not found." }, { status: 404 });
  }

  return demoDataResponse(customer);
}
