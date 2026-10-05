import { z } from "zod";

import {
  createDevelopmentSession,
  developmentSessionCookieName,
  isDevelopmentAuthEnabled,
} from "@/server/auth/auth";
import { enforceUnauthenticatedRateLimit, errorResponse, parseBoundedJson, requestIdFor, RequestBodyTooLargeError, RateLimitError } from "@/server/http/request";

const inputSchema = z.object({ token: z.string().trim().min(1).max(512) }).strict();

/** Explicit local-only access bootstrap. It is disabled in production. */
export async function POST(request: Request): Promise<Response> {
  const requestId = requestIdFor(request);
  if (!isDevelopmentAuthEnabled()) {
    return errorResponse("DEVELOPMENT_AUTH_DISABLED", "Development access is not enabled.", 404, requestId);
  }
  try {
    enforceUnauthenticatedRateLimit(request);
    const session = createDevelopmentSession(inputSchema.parse(await parseBoundedJson(request)).token);
    const response = Response.json({ data: { authenticated: true }, requestId }, { headers: { "x-request-id": requestId } });
    response.headers.append(
      "set-cookie",
      `${developmentSessionCookieName()}=${session.value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${session.maxAge}`,
    );
    return response;
  } catch (error) {
    if (error instanceof RateLimitError) return errorResponse("RATE_LIMITED", error.message, 429, requestId);
    if (error instanceof RequestBodyTooLargeError) return errorResponse("REQUEST_TOO_LARGE", error.message, 413, requestId);
    return errorResponse("DEVELOPMENT_AUTH_INVALID", "Development access could not be verified.", 401, requestId);
  }
}
