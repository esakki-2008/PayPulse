import { NextResponse } from "next/server";

/**
 * Reserved for Phase 5. Returning an explicit response prevents the Phase 3
 * interface from claiming an AI analysis or PayPal operation occurred.
 */
export async function POST(): Promise<Response> {
  return NextResponse.json(
    {
      error: "Payment intelligence analysis is not implemented in Phase 3.",
      phase: 5,
    },
    { status: 501 },
  );
}
