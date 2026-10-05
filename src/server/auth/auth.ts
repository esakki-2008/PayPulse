import { createHmac, timingSafeEqual } from "node:crypto";

import { getAuth } from "@clerk/nextjs/server";

import { assertServerRuntime } from "../runtime";

assertServerRuntime("PayPulse authentication");

export type MerchantRole = "owner" | "operator" | "viewer";

export interface AuthenticatedActor {
  readonly actorId: string;
  readonly merchantId: string;
  readonly role: MerchantRole;
  readonly provider: "development" | "external";
}

export class AuthenticationError extends Error {
  override readonly name = "AuthenticationError";
  constructor(message = "Authentication is required.") { super(message); }
}

export class AuthorizationError extends Error {
  override readonly name = "AuthorizationError";
  constructor(message = "This account is not authorized for this operation.") { super(message); }
}

export class AuthenticationConfigurationError extends Error {
  override readonly name = "AuthenticationConfigurationError";
  constructor(message = "Authentication is not configured for this environment.") { super(message); }
}

const SESSION_COOKIE = "paypulse_development_session";
const DEVELOPMENT_AUTH_MODE = "development";
const EXTERNAL_AUTH_MODE = "external";

/**
 * Server-side authentication seam. Development sessions are deliberately opt-in
 * and cryptographically signed with a server-only token. Production never
 * accepts this mode; an external provider adapter must be registered instead.
 */
export async function requireAuthenticatedActor(request: Request, options: { readonly mutation?: boolean } = {}): Promise<AuthenticatedActor> {
  const actor = await getAuthenticatedActor(request);
  if (!actor) throw new AuthenticationError();
  if (options.mutation && actor.role === "viewer") {
    throw new AuthorizationError("This account cannot change actions or provider state.");
  }
  return actor;
}

export async function getAuthenticatedActor(request: Request): Promise<AuthenticatedActor | null> {
  if (process.env.NODE_ENV === "test") {
    return testActorFromRequest(request);
  }

  const mode = process.env.PAYPULSE_AUTH_MODE?.trim().toLowerCase();
  if (mode === DEVELOPMENT_AUTH_MODE) return developmentActorFromRequest(request);
  if (mode === EXTERNAL_AUTH_MODE) return clerkActorFromRequest(request);
  throw new AuthenticationConfigurationError();
}

export function isDevelopmentAuthEnabled(): boolean {
  return process.env.NODE_ENV !== "production"
    && process.env.PAYPULSE_AUTH_MODE?.trim().toLowerCase() === DEVELOPMENT_AUTH_MODE
    && Boolean(developmentToken());
}

export function createDevelopmentSession(token: string): { readonly value: string; readonly maxAge: number } {
  if (!isDevelopmentAuthEnabled() || !safeEqual(token, developmentToken()!)) {
    throw new AuthenticationError("Development access could not be verified.");
  }
  const actor = configuredDevelopmentActor();
  const payload = Buffer.from(JSON.stringify({ actorId: actor.actorId, merchantId: actor.merchantId, role: actor.role, issuedAt: Date.now() }), "utf8").toString("base64url");
  return { value: `${payload}.${sign(payload, developmentToken()!)}`, maxAge: 8 * 60 * 60 };
}

export function developmentSessionCookieName(): string { return SESSION_COOKIE; }

/**
 * Converts only server-verified Clerk session claims into the PayPulse actor
 * contract. The active Clerk Organization is the tenant boundary: its ID is
 * never read from a browser-supplied PayPulse field.
 */
export function actorFromClerkSession(session: {
  readonly userId: string | null | undefined;
  readonly orgId: string | null | undefined;
  readonly orgRole: string | null | undefined;
}): AuthenticatedActor | null {
  if (!session.userId) return null;
  if (!session.orgId) {
    throw new AuthorizationError("Select an active organization before accessing PayPulse.");
  }
  return {
    actorId: session.userId,
    merchantId: session.orgId,
    role: payPulseRoleForClerkOrganizationRole(session.orgRole),
    provider: "external",
  };
}

/**
 * Unknown and missing Organization roles are intentionally least-privilege.
 * Clerk's default roles map to owner/viewer; an explicitly configured
 * `org:operator` role can operate but cannot manage owner-only capabilities.
 */
export function payPulseRoleForClerkOrganizationRole(role: string | null | undefined): MerchantRole {
  switch (role) {
    case "org:admin":
      return "owner";
    case "org:operator":
      return "operator";
    case "org:member":
    default:
      return "viewer";
  }
}

function clerkActorFromRequest(request: Request): AuthenticatedActor | null {
  if (!isClerkConfigured()) {
    throw new AuthenticationConfigurationError("Clerk authentication is not configured for this environment.");
  }
  try {
    // Route handlers and server pages pass the standard Web Request shape.
    // `getAuth` consumes the Clerk-signed middleware headers, which this shape
    // preserves; the narrower NextRequest type in Clerk's declaration is not
    // otherwise required by its server-side verification path.
    return actorFromClerkSession(getAuth(request as Parameters<typeof getAuth>[0]));
  } catch (error) {
    if (error instanceof AuthenticationError || error instanceof AuthorizationError) throw error;
    // This normally means Clerk middleware was not applied to the request.
    // Do not use a request header or fallback identity in that case.
    throw new AuthenticationConfigurationError("Clerk authentication middleware is not available for this request.");
  }
}

export function isClerkConfigured(): boolean {
  return Boolean(process.env.CLERK_SECRET_KEY?.trim())
    && Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim());
}

function developmentActorFromRequest(request: Request): AuthenticatedActor | null {
  if (process.env.NODE_ENV === "production") {
    throw new AuthenticationConfigurationError("Development authentication is forbidden in production.");
  }
  const token = developmentToken();
  if (!token) throw new AuthenticationConfigurationError("Development authentication requires PAYPULSE_DEV_AUTH_TOKEN.");
  const cookieValue = cookieValueFor(request.headers.get("cookie"), SESSION_COOKIE);
  if (!cookieValue) return null;
  const [payload, signature] = cookieValue.split(".");
  if (!payload || !signature || !safeEqual(signature, sign(payload, token))) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<AuthenticatedActor>;
    const configured = configuredDevelopmentActor();
    return parsed.actorId === configured.actorId
      && parsed.merchantId === configured.merchantId
      && parsed.role === configured.role
      ? configured
      : null;
  } catch {
    return null;
  }
}

function testActorFromRequest(request: Request): AuthenticatedActor | null {
  const role = request.headers.get("x-paypulse-test-auth");
  if (role !== "owner" && role !== "operator" && role !== "viewer") return null;
  const merchantId = testIdentity(request.headers.get("x-paypulse-test-merchant-id"), "test-merchant");
  const actorId = testIdentity(request.headers.get("x-paypulse-test-actor-id"), "test-merchant-user");
  return { actorId, merchantId, role, provider: "development" };
}

function testIdentity(value: string | null, fallback: string): string {
  return value && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : fallback;
}

function configuredDevelopmentActor(): AuthenticatedActor {
  const role = process.env.PAYPULSE_DEV_AUTH_ROLE === "operator" ? "operator" : "owner";
  return {
    actorId: process.env.PAYPULSE_DEV_ACTOR_ID?.trim() || "development-merchant-owner",
    merchantId: process.env.PAYPULSE_DEV_MERCHANT_ID?.trim() || "development-merchant",
    role,
    provider: "development",
  };
}

function developmentToken(): string | null {
  const value = process.env.PAYPULSE_DEV_AUTH_TOKEN?.trim();
  return value || null;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("base64url");
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieValueFor(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const item of cookieHeader.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return value.join("=") || null;
  }
  return null;
}
