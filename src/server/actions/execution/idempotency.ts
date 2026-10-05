import { createHash } from "node:crypto";

import type { ActionCandidate } from "@/types/domain";

/**
 * Server-derived only. Browser input never supplies an idempotency key, operation,
 * endpoint, amount, currency, or PayPal resource identifier.
 */
export function executionIdempotencyKey(action: ActionCandidate, version: number): string {
  return createHash("sha256")
    .update(JSON.stringify({
      namespace: "paypulse.paypal-sandbox.action-execution.v1",
      source: action.source,
      actionId: action.id,
      actionFingerprint: action.fingerprint,
      attempt: action.attempt,
      version,
      operation: "capture_order",
    }))
    .digest("hex")
    .slice(0, 64);
}
