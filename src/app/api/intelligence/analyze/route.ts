import { z } from "zod";

import { analyzeWithAI } from "@/server/ai/service";
import { DataSourceError, getIntelligenceForSource, getTransactionsForSource, parseDataSource } from "@/server/data/provider";
import { parseBoundedJson, requireApiRequest } from "@/server/http/request";
import { apiDataSourceErrorResponse, apiErrorResponse, dataSourceResponse } from "@/server/http/responses";

const requestSchema = z.object({ customerId: z.string().trim().min(1).max(200).optional() }).strict();
/** Explicit, bounded explanation request. It never performs a PayPal mutation. */
export async function POST(request: Request): Promise<Response> {
  try {
    const api = await requireApiRequest(request);
    const source = parseDataSource(new URL(request.url).searchParams.get("source") ?? undefined);
    const input = requestSchema.parse(await parseBoundedJson(request));
    const [intelligence, transactions] = await Promise.all([getIntelligenceForSource(source, api.actor.merchantId), getTransactionsForSource(source, api.actor.merchantId)]);
    if (input.customerId && !intelligence.data.customerProfiles.some((profile) => profile.customerId === input.customerId)) return Response.json({ error: "Customer was not found in the selected data source." }, { status: 404, headers: { "x-request-id": api.requestId } });
    const ai = await analyzeWithAI(intelligence.data, transactions.data, input.customerId);
    return dataSourceResponse({ ...intelligence, data: { deterministic: intelligence.data, ai } }, { requestId: api.requestId });
  } catch (error) {
    if (error instanceof DataSourceError) return apiDataSourceErrorResponse(error);
    return apiErrorResponse(error);
  }
}
