import { NextResponse, type NextRequest } from "next/server";

const DEVELOPMENT_SESSION_COOKIE = "paypulse_development_session";

export function middleware(request: NextRequest): NextResponse {
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
