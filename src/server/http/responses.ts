import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  ActionNotFoundError,
  ActionStateError,
} from "../actions/service";

export function demoDataResponse<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(
    {
      data,
      meta: {
        source: "demo",
        notice: "Synthetic Phase 3 data. No PayPal Sandbox transaction data was queried.",
      },
    },
    init,
  );
}

export function apiErrorResponse(error: unknown): NextResponse {
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "Invalid request input." }, { status: 400 });
  }

  if (error instanceof ActionNotFoundError) {
    return NextResponse.json({ error: error.message }, { status: 404 });
  }

  if (error instanceof ActionStateError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }

  return NextResponse.json(
    { error: "The request could not be completed safely." },
    { status: 500 },
  );
}
