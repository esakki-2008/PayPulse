import { assertServerRuntime } from "../runtime";

assertServerRuntime("PayPal order service");

/**
 * Read-only boundary reserved for a later capability that has a known order ID.
 * Phase 4 does not call Orders v2 because it is not a merchant transaction
 * history/listing API. Transaction Search is the documented source of history.
 */
export class PayPalOrderService {
  async getOrderById(): Promise<never> {
    throw new Error(
      "Order lookup is intentionally not enabled in Phase 4. Transaction Search is used for read-only merchant history.",
    );
  }
}
