export type PayPalProviderErrorCategory =
  | "configuration"
  | "authentication"
  | "authorization"
  | "not_found"
  | "rate_limited"
  | "provider"
  | "network"
  | "malformed_response"
  | "unsupported_capability";

/** Safe provider error; it deliberately contains no token, header, or raw body. */
export class PayPalProviderError extends Error {
  override readonly name = "PayPalProviderError";

  constructor(
    message: string,
    readonly category: PayPalProviderErrorCategory,
    readonly status?: number,
  ) {
    super(message);
  }
}
