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
import { DataSourceError, type DataSourceResult } from "../data/provider";

export function dataSourceResponse<T>(result: DataSourceResult<T>): NextResponse {
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
  });
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

export function apiDataSourceErrorResponse(error: unknown): NextResponse {
  if (error instanceof DataSourceError) {
    return NextResponse.json(
      {
        error: error.message,
        meta: {
          source: "paypal_sandbox",
          environment: "sandbox",
          category: error.category,
          capabilities: error.capabilities,
        },
      },
      { status: error.status },
    );
  }

  return NextResponse.json(
    {
      error: "The requested data source is unavailable.",
      meta: { source: "paypal_sandbox", environment: "sandbox", category: "unknown" },
    },
    { status: 502 },
  );
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request input." }, { status: 400 });
  }

  if (error instanceof ActionNotFoundError || error instanceof AgentActionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ActionStateError || error instanceof AgentActionStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "The request could not be completed safely." },
    { status: 500 },
  );
}
