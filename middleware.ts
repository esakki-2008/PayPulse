import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const DEVELOPMENT_SESSION_COOKIE = "paypulse_development_session";
const EXTERNAL_AUTH_MODE = "external";

/**
 * Clerk runs before PayPulse's request handling only when the real external
 * auth mode is selected. Development auth remains an explicit, non-production
 * local path and never initializes an unconfigured Clerk instance.
 */
const clerkPayPulseMiddleware = clerkMiddleware(async (auth, request) => {
  // APIs retain their normal machine-readable 401/403 boundary in the route
  // handlers. Browser pages receive Clerk's genuine sign-in redirect instead
  // of rendering an unauthenticated command-center page.
  if (requiresClerkPageSignIn(request)) {
    const { userId } = await auth();
    if (!userId) return auth.redirectToSignIn();
  }
  return payPulseMiddleware(request);
});

export function middleware(request: NextRequest, event: NextFetchEvent) {
  if (process.env.PAYPULSE_AUTH_MODE?.trim().toLowerCase() === EXTERNAL_AUTH_MODE) {
    return clerkPayPulseMiddleware(request, event);
  }
  return payPulseMiddleware(request);
}

function requiresClerkPageSignIn(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  return !pathname.startsWith("/api/") && pathname !== "/health" && pathname !== "/ready";
}

function payPulseMiddleware(request: NextRequest): NextResponse {
  const headers = new Headers(request.headers);
  const requestId = headers.get("x-request-id") ?? crypto.randomUUID();
  headers.set("x-request-id", requestId);
  const { pathname, search } = request.nextUrl;
  const localDevelopmentAuth = process.env.NODE_ENV !== "production" && process.env.PAYPULSE_AUTH_MODE === "development";
  const canRedirectToDevelopmentAccess = !pathname.startsWith("/api/") && !pathname.startsWith("/auth/development") && pathname !== "/health" && pathname !== "/ready";
  if (localDevelopmentAuth && canRedirectToDevelopmentAccess && !request.cookies.has(DEVELOPMENT_SESSION_COOKIE)) {
    const target = request.nextUrl.clone();
    target.pathname = "/auth/development";
    target.search = `?next=${encodeURIComponent(`${pathname}${search}`)}`;
    const response = NextResponse.redirect(target);
    response.headers.set("x-request-id", requestId);
    return response;
  }
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
