import { NextResponse } from "next/server";

import { getIntelligenceForSource, parseDataSource } from "@/server/data/provider";
import { apiDataSourceErrorResponse, dataSourceResponse } from "@/server/http/responses";

interface RouteContext {
  readonly params: Promise<{ customerId: string }>;
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  try {
    const { customerId } = await context.params;
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const result = await getIntelligenceForSource(source);
    const profile = result.data.customerProfiles.find((candidate) => candidate.customerId === customerId);
    if (!profile) {
      return NextResponse.json(
        { error: "Customer intelligence was not found in the selected data source.", meta: { source: result.source, environment: result.environment } },
        { status: 404 },
      );
    }
    return dataSourceResponse({
      ...result,
      data: {
        profile,
        insights: result.data.insights.filter((insight) => insight.affectedCustomerIds.includes(customerId)),
        methodology: result.data.methodology,
      },
    });
  } catch (error) {
    return apiDataSourceErrorResponse(error);
  }
}
