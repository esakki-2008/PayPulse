/** Unauthenticated liveness probe. It intentionally reports no configuration or provider details. */
export async function GET(): Promise<Response> {
  return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
}
