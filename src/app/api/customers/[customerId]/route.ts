import { NextResponse } from "next/server";

import {
  getCustomerForSource,
  parseDataSource,
} from "@/server/data/provider";
import { apiDataSourceErrorResponse, dataSourceResponse } from "@/server/http/responses";

interface RouteContext {
  readonly params: Promise<{ customerId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { customerId } = await context.params;
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const result = await getCustomerForSource(source, customerId);

    if (!result.data) {
      return NextResponse.json(
        {
          error: "Customer not found in the selected data source.",
          meta: { source: result.source, environment: result.environment },
        },
        { status: 404 },
      );
    }

    return dataSourceResponse(result);
  } catch (error) {
    return apiDataSourceErrorResponse(error);
  }
}
