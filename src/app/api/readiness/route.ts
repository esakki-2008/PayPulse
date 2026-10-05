import { readinessPayload } from "@/server/health/readiness";

/** Deployment readiness: application, database, PayPal Orders config, and reporting probe state. */
export async function GET(): Promise<Response> {
  const result = await readinessPayload();
  return Response.json(result.payload, { status: result.httpStatus, headers: { "cache-control": "no-store" } });
}
