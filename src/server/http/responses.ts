import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  ActionNotFoundError,
  ActionStateError,
} from "../actions/service";
import {
  AgentActionNotFoundError,
  AgentActionStateError,
} from "../actions/engine";
import { DataSourceError, DataSourceValidationError, type DataSourceResult } from "../data/provider";
import { AuthenticationConfigurationError, AuthenticationError, AuthorizationError } from "../auth/auth";
import { PersistenceConfigurationError } from "../runtime-config";
import { ActionExecutionValidationError } from "../actions/execution/validation";
import { RateLimitError, RequestBodyTooLargeError, RequestInputError } from "./request";

export function dataSourceResponse<T>(result: DataSourceResult<T>, extras: Readonly<Record<string, unknown>> = {}): NextResponse {
  const requestId = typeof extras.requestId === "string" ? extras.requestId : undefined;
  return NextResponse.json({
    data: result.data,
    meta: {
      source: result.source,
      environment: result.environment,
      generatedAt: result.generatedAt,
      persistence: result.persistence ?? null,
      capabilities: result.capabilities ?? null,
      notice:
        result.source === "paypal_sandbox"
          ? "PayPal Sandbox data. This is not production financial data."
          : "Explicitly selected synthetic demo data. No PayPal Sandbox transaction data was queried.",
    },
    ...extras,
  }, { headers: requestId ? { "x-request-id": requestId } : undefined });
}

export function demoDataResponse<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(
    {
      data,
      meta: {
        source: "demo",
        environment: "demo",
        notice: "Explicitly selected synthetic demo data.",
      },
    },
    init,
  );
}

export function apiDataSourceErrorResponse(error: unknown, requestId = crypto.randomUUID()): NextResponse {
  if (error instanceof AuthenticationError || error instanceof AuthorizationError || error instanceof AuthenticationConfigurationError || error instanceof PersistenceConfigurationError || error instanceof RequestBodyTooLargeError || error instanceof RateLimitError) {
    return apiErrorResponse(error, requestId);
  }
  const response = (body: Readonly<Record<string, unknown>>, status: number) => NextResponse.json(body, { status, headers: { "x-request-id": requestId } });
  if (error instanceof DataSourceValidationError) {
    return response({ error: error.message, code: "INVALID_SOURCE", requestId }, 400);
  }
  if (error instanceof DataSourceError) {
    return response({
      error: error.message,
      meta: { source: "paypal_sandbox", environment: "sandbox", category: error.category, capabilities: error.capabilities },
      requestId,
    }, error.status);
  }

  return response({
    error: "The requested data source is unavailable.",
    meta: { source: "paypal_sandbox", environment: "sandbox", category: "unknown" },
    requestId,
  }, 502);
}

export function apiErrorResponse(error: unknown, requestId = crypto.randomUUID()): NextResponse {
  const response = (message: string, code: string, status: number): NextResponse => NextResponse.json(
    { error: message, code, requestId },
    { status, headers: { "x-request-id": requestId } },
  );
  if (error instanceof ZodError || error instanceof DataSourceValidationError || error instanceof RequestInputError) {
    return response(error instanceof DataSourceValidationError ? error.message : "Invalid request input.", "INVALID_REQUEST", 400);
  }
  if (error instanceof RequestBodyTooLargeError) return response(error.message, "REQUEST_TOO_LARGE", 413);
  if (error instanceof RateLimitError) return response(error.message, "RATE_LIMITED", 429);
  if (error instanceof AuthenticationError) return response(error.message, "AUTHENTICATION_REQUIRED", 401);
  if (error instanceof AuthorizationError) return response(error.message, "AUTHORIZATION_DENIED", 403);
  if (error instanceof AuthenticationConfigurationError) return response(error.message, "AUTH_CONFIGURATION_REQUIRED", 503);
  if (error instanceof PersistenceConfigurationError) return response(error.message, "PERSISTENCE_REQUIRED", 503);
  if (error instanceof ActionExecutionValidationError) return response(error.message, "ACTION_EXECUTION_REJECTED", error.status);
  if (error instanceof ActionNotFoundError || error instanceof AgentActionNotFoundError) {
    return response(error.message, "ACTION_NOT_FOUND", 404);
  }
  if (error instanceof ActionStateError || error instanceof AgentActionStateError) {
    return response(error.message, "ACTION_STATE_CONFLICT", 409);
  }
  return response("The request could not be completed safely.", "INTERNAL_ERROR", 500);
}
