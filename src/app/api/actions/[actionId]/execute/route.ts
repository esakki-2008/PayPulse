import { NextResponse } from "next/server";

/**
 * Hard Phase 6 execution boundary. No PayPal write request is imported or made
 * here, regardless of source, action status, or client-provided input.
 */
export async function POST(): Promise<Response> {
  return NextResponse.json(
    { error: "PayPal action execution is reserved for the execution phase.", executionOccurred: false },
    { status: 501 },
  );
}
