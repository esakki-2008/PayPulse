import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeWithAI } from "@/server/ai/service";
import {
  DataSourceError,
  getIntelligenceForSource,
  getTransactionsForSource,
  parseDataSource,
} from "@/server/data/provider";
import { apiDataSourceErrorResponse, apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

const requestSchema = z.object({ customerId: z.string().trim().min(1).optional() }).strict();

/** Explicit, bounded explanation request. It never performs a PayPal mutation. */
export async function POST(request: Request): Promise<Response> {
  try {
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const rawBody = await request.text();
    let body: unknown = {};
    try {
      body = rawBody ? JSON.parse(rawBody) : {};
    } catch {
      return NextResponse.json({ error: "Invalid request input." }, { status: 400 });
    }
    const input = requestSchema.parse(body);
    const [intelligence, transactions] = await Promise.all([
      getIntelligenceForSource(source),
      getTransactionsForSource(source),
    ]);
    if (input.customerId && !intelligence.data.customerProfiles.some((profile) => profile.customerId === input.customerId)) {
      return NextResponse.json(
        { error: "Customer was not found in the selected data source." },
        { status: 404 },
      );
    }
    const ai = await analyzeWithAI(intelligence.data, transactions.data, input.customerId);
    return dataSourceResponse({
      ...intelligence,
      data: { deterministic: intelligence.data, ai },
    });
  } catch (error) {
    if (error instanceof DataSourceError) return apiDataSourceErrorResponse(error);
    return apiErrorResponse(error);
  }
}
