import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  AuthenticationConfigurationError,
  AuthenticationError,
  AuthorizationError,
  requireAuthenticatedActor,
  type AuthenticatedActor,
} from "../auth/auth";

export const MAX_API_BODY_BYTES = 16 * 1024;

export interface ApiRequestContext {
  readonly requestId: string;
  readonly actor: AuthenticatedActor;
}

/** Authenticates API callers and applies a bounded process-local abuse guard. */
export async function requireApiRequest(request: Request, options: { readonly mutation?: boolean } = {}): Promise<ApiRequestContext> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  assertReasonableBodySize(request);
  const actor = await requireAuthenticatedActor(request, options);
  enforceRateLimit(request, actor.actorId, options.mutation ? 20 : 120);
  return { requestId, actor };
}

export function requestIdFor(request: Request): string {
  return request.headers.get("x-request-id") ?? randomUUID();
}

export function withRequestId(response: NextResponse | Response, requestId: string): Response {
  response.headers.set("x-request-id", requestId);
  return response;
}

export function apiErrorResponseForRequest(error: unknown, request: Request): Response {
  const requestId = requestIdFor(request);
  if (error instanceof AuthenticationConfigurationError) {
    return errorResponse("AUTH_CONFIGURATION_REQUIRED", error.message, 503, requestId);
  }
  if (error instanceof AuthenticationError) {
    return errorResponse("AUTHENTICATION_REQUIRED", error.message, 401, requestId);
  }
  if (error instanceof AuthorizationError) {
    return errorResponse("AUTHORIZATION_DENIED", error.message, 403, requestId);
  }
  if (error instanceof RateLimitError) {
    return errorResponse("RATE_LIMITED", error.message, 429, requestId);
  }
  if (error instanceof RequestBodyTooLargeError) {
    return errorResponse("REQUEST_TOO_LARGE", error.message, 413, requestId);
  }
  return errorResponse("REQUEST_REJECTED", "The request could not be completed safely.", 500, requestId);
}

export function errorResponse(code: string, message: string, status: number, requestId: string): Response {
  return Response.json({ error: { code, message }, requestId }, { status, headers: { "x-request-id": requestId } });
}

export function assertReasonableBodySize(request: Request): void {
  const length = request.headers.get("content-length");
  if (!length) return;
  const parsed = Number(length);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_API_BODY_BYTES) {
    throw new RequestBodyTooLargeError();
  }
}

/** Bounded JSON decoding also protects chunked requests without Content-Length. */
export async function parseBoundedJson(request: Request): Promise<unknown> {
  assertReasonableBodySize(request);
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_API_BODY_BYTES) throw new RequestBodyTooLargeError();
  try { return JSON.parse(text); } catch { throw new RequestInputError("Invalid request input."); }
}

/** Reads an explicitly empty body without accepting arbitrary chunked input. */
export async function requireEmptyBody(request: Request): Promise<void> {
  assertReasonableBodySize(request);
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_API_BODY_BYTES) throw new RequestBodyTooLargeError();
  if (body.trim()) throw new RequestInputError("This endpoint does not accept a request body.");
}

export class RequestInputError extends Error {
  override readonly name = "RequestInputError";
  constructor(message: string) { super(message); }
}

export class RateLimitError extends Error {
  override readonly name = "RateLimitError";
  constructor() { super("Too many requests. Please retry shortly."); }
}

interface RateLimitBucket { startedAt: number; count: number; }
const rateLimitStore = globalThis as typeof globalThis & { payPulseRateLimit?: Map<string, RateLimitBucket> };
/**
 * Process-local guard for accidental/browser abuse. Production deployments must
 * also enforce a shared edge or gateway limit; this deliberately never claims
 * distributed rate-limit guarantees.
 */
function enforceRateLimit(request: Request, actorId: string, limit: number): void {
  const path = new URL(request.url).pathname;
  enforceRateLimitKey(`${actorId}:${request.method}:${path}`, limit);
}

/** Use only for the explicit local-development session bootstrap before an actor exists. */
export function enforceUnauthenticatedRateLimit(request: Request): void {
  const path = new URL(request.url).pathname;
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unattributed";
  enforceRateLimitKey(`unauthenticated:${forwardedFor}:${request.method}:${path}`, 10);
}

function enforceRateLimitKey(key: string, limit: number): void {
  const now = Date.now();
  const windowMs = 60_000;
  const buckets = rateLimitStore.payPulseRateLimit ??= new Map();
  const current = buckets.get(key);
  if (!current || now - current.startedAt >= windowMs) {
    buckets.set(key, { startedAt: now, count: 1 });
    // Keep the bounded guard bounded even during a path enumeration attack.
    if (buckets.size > 10_000) {
      for (const [oldKey, bucket] of buckets) if (now - bucket.startedAt >= windowMs) buckets.delete(oldKey);
    }
    return;
  }
  if (current.count >= limit) throw new RateLimitError();
  current.count += 1;
}

export class RequestBodyTooLargeError extends Error {
  override readonly name = "RequestBodyTooLargeError";
  constructor() { super("Request input exceeds the allowed size."); }
}
