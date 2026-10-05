import { readinessPayload } from "@/server/health/readiness";

/** Compatibility readiness path; use /api/readiness for deployment integrations. */
export async function GET(): Promise<Response> {
  const result = await readinessPayload();
  return Response.json(result.payload, { status: result.httpStatus, headers: { "cache-control": "no-store" } });
}
