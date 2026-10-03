import {
  PAYPAL_SANDBOX_API_BASE_URL,
  PayPalConfigurationError,
} from "./config";
import {
  PayPalOAuthTokenService,
  PayPalTokenRequestError,
  type PayPalAccessTokenMetadata,
} from "./token-service";
import { assertServerRuntime } from "../runtime";

assertServerRuntime("PayPal Sandbox connectivity verification");

export type PayPalConnectivityErrorCategory =
  | "none"
  | "configuration"
  | "authentication"
  | "network"
  | "provider_response"
  | "runtime"
  | "unknown";

/**
 * This is deliberately safe to print. It contains no credentials, authorization
 * headers, raw provider body, or OAuth access token.
 */
export interface PayPalSandboxConnectivityReport {
  readonly endpoint: typeof PAYPAL_SANDBOX_API_BASE_URL;
  readonly authenticationRequestSucceeded: boolean;
  readonly tokenReceived: boolean;
  readonly tokenExpiresAt: string | null;
  readonly httpStatus: number | null;
  readonly errorCategory: PayPalConnectivityErrorCategory;
}

export interface PayPalTokenMetadataProvider {
  getAccessTokenMetadata(): Promise<PayPalAccessTokenMetadata>;
}

export interface PayPalSandboxConnectivityOptions {
  readonly tokenService?: PayPalTokenMetadataProvider;
}

/**
 * Performs one server-to-server OAuth verification against PayPal Sandbox.
 * A new token service is used by default, so this call validates an actual
 * OAuth request rather than reporting an existing cached token as a new check.
 */
export async function verifyPayPalSandboxConnectivity(
  options: PayPalSandboxConnectivityOptions = {},
): Promise<PayPalSandboxConnectivityReport> {
  const tokenService = options.tokenService ?? new PayPalOAuthTokenService();

  try {
    const metadata = await tokenService.getAccessTokenMetadata();

    return {
      endpoint: PAYPAL_SANDBOX_API_BASE_URL,
      authenticationRequestSucceeded: true,
      tokenReceived: true,
      tokenExpiresAt: metadata.expiresAt,
      httpStatus: metadata.httpStatus,
      errorCategory: "none",
    };
  } catch (error) {
    return {
      endpoint: PAYPAL_SANDBOX_API_BASE_URL,
      authenticationRequestSucceeded: false,
      tokenReceived: false,
      tokenExpiresAt: null,
      httpStatus: getSafeHttpStatus(error),
      errorCategory: getSafeErrorCategory(error),
    };
  }
}

function getSafeHttpStatus(error: unknown): number | null {
  return error instanceof PayPalTokenRequestError && error.status !== undefined
    ? error.status
    : null;
}

function getSafeErrorCategory(error: unknown): PayPalConnectivityErrorCategory {
  if (error instanceof PayPalConfigurationError) {
    return "configuration";
  }

  if (error instanceof PayPalTokenRequestError) {
    return error.category;
  }

  return "unknown";
}
