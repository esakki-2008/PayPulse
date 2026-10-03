import { Buffer } from "node:buffer";

import {
  getPayPalSandboxConfig,
  type PayPalSandboxConfig,
} from "./config.js";
import { assertServerRuntime } from "../runtime.js";

assertServerRuntime("PayPal OAuth token service");

const PAYPAL_ACCESS_TOKEN_PATH = "/v1/oauth2/token";
const TOKEN_REFRESH_SAFETY_WINDOW_MS = 60_000;

export interface PayPalTokenHttpResponse {
  readonly ok: boolean;
  readonly status: number;
  json(): Promise<unknown>;
}

export interface PayPalTokenRequest {
  readonly method: "POST";
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

export type PayPalTokenFetch = (
  url: string,
  request: PayPalTokenRequest,
) => Promise<PayPalTokenHttpResponse>;

interface PayPalTokenPayload {
  readonly access_token: string;
  readonly expires_in: number;
}

interface CachedAccessToken {
  readonly value: string;
  readonly expiresAtMs: number;
  readonly httpStatus: number;
}

/** Safe token metadata. It intentionally never includes the access token. */
export interface PayPalAccessTokenMetadata {
  readonly expiresAt: string;
  readonly httpStatus: number;
}

export type PayPalTokenErrorCategory =
  | "authentication"
  | "network"
  | "provider_response"
  | "runtime";

export interface PayPalOAuthTokenServiceOptions {
  readonly configProvider?: () => PayPalSandboxConfig;
  readonly fetchImplementation?: PayPalTokenFetch;
  readonly now?: () => number;
}

export class PayPalTokenRequestError extends Error {
  override readonly name = "PayPalTokenRequestError";

  constructor(
    message: string,
    readonly status?: number,
    readonly category: PayPalTokenErrorCategory = "provider_response",
  ) {
    super(message);
  }
}

/**
 * Retrieves a PayPal Sandbox OAuth access token and keeps it in process memory
 * until one minute before its expiry. It never writes credentials or tokens to
 * logs, the browser, or persistent storage.
 */
export class PayPalOAuthTokenService {
  private readonly configProvider: () => PayPalSandboxConfig;
  private readonly fetchImplementation: PayPalTokenFetch;
  private readonly now: () => number;
  private cachedAccessToken?: CachedAccessToken;
  private inFlightRequest?: Promise<string>;

  constructor(options: PayPalOAuthTokenServiceOptions = {}) {
    this.configProvider = options.configProvider ?? getPayPalSandboxConfig;
    this.fetchImplementation = options.fetchImplementation ?? defaultTokenFetch;
    this.now = options.now ?? Date.now;
  }

  async getAccessToken(): Promise<string> {
    const cachedToken = this.getFreshCachedToken();
    if (cachedToken) {
      return cachedToken.value;
    }

    if (this.inFlightRequest) {
      return this.inFlightRequest;
    }

    const request = this.requestNewAccessToken();
    this.inFlightRequest = request;

    try {
      return await request;
    } finally {
      if (this.inFlightRequest === request) {
        this.inFlightRequest = undefined;
      }
    }
  }

  /**
   * Performs the same token retrieval path as getAccessToken but returns only
   * safe metadata that a connectivity check may report.
   */
  async getAccessTokenMetadata(): Promise<PayPalAccessTokenMetadata> {
    await this.getAccessToken();

    const cachedToken = this.cachedAccessToken;
    if (!cachedToken) {
      throw new PayPalTokenRequestError(
        "PayPal Sandbox access-token metadata was unavailable after retrieval.",
        undefined,
        "runtime",
      );
    }

    return {
      expiresAt: new Date(cachedToken.expiresAtMs).toISOString(),
      httpStatus: cachedToken.httpStatus,
    };
  }

  private getFreshCachedToken(): CachedAccessToken | undefined {
    const cachedToken = this.cachedAccessToken;

    if (
      cachedToken &&
      this.now() + TOKEN_REFRESH_SAFETY_WINDOW_MS < cachedToken.expiresAtMs
    ) {
      return cachedToken;
    }

    return undefined;
  }

  private async requestNewAccessToken(): Promise<string> {
    const config = this.configProvider();
    const response = await requestPayPalToken(
      this.fetchImplementation,
      config,
    );
    const payload = await parseTokenPayload(response);
    const expiresAtMs = this.now() + payload.expires_in * 1_000;

    this.cachedAccessToken = {
      value: payload.access_token,
      expiresAtMs,
      httpStatus: response.status,
    };

    return payload.access_token;
  }
}

let sharedTokenService: PayPalOAuthTokenService | undefined;

/**
 * Provides the process-local token cache used by future PayPal server adapters.
 */
export function getSharedPayPalOAuthTokenService(): PayPalOAuthTokenService {
  sharedTokenService ??= new PayPalOAuthTokenService();
  return sharedTokenService;
}

async function defaultTokenFetch(
  url: string,
  request: PayPalTokenRequest,
): Promise<PayPalTokenHttpResponse> {
  if (typeof globalThis.fetch !== "function") {
    throw new PayPalTokenRequestError(
      "This server runtime does not provide fetch for the PayPal Sandbox token request.",
      undefined,
      "runtime",
    );
  }

  const response = await globalThis.fetch(url, request);
  return response;
}

async function requestPayPalToken(
  fetchImplementation: PayPalTokenFetch,
  config: PayPalSandboxConfig,
): Promise<PayPalTokenHttpResponse> {
  let response: PayPalTokenHttpResponse;

  try {
    response = await fetchImplementation(
      `${config.apiBaseUrl}${PAYPAL_ACCESS_TOKEN_PATH}`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: `Basic ${toBasicAuthorizationValue(config)}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      },
    );
  } catch (error) {
    if (error instanceof PayPalTokenRequestError) {
      throw error;
    }

    // Deliberately avoid attaching the underlying request, headers, or error
    // text because those may contain sensitive authentication context.
    throw new PayPalTokenRequestError(
      "Unable to reach PayPal Sandbox for an access token.",
      undefined,
      "network",
    );
  }

  if (!response.ok) {
    throw new PayPalTokenRequestError(
      `PayPal Sandbox access-token request failed (HTTP ${response.status}).`,
      response.status,
      response.status === 401 || response.status === 403
        ? "authentication"
        : "provider_response",
    );
  }

  return response;
}

async function parseTokenPayload(
  response: PayPalTokenHttpResponse,
): Promise<PayPalTokenPayload> {
  let value: unknown;

  try {
    value = await response.json();
  } catch {
    throw new PayPalTokenRequestError(
      "PayPal Sandbox returned an unreadable access-token response.",
    );
  }

  if (!isPayPalTokenPayload(value)) {
    throw new PayPalTokenRequestError(
      "PayPal Sandbox returned an invalid access-token response.",
    );
  }

  return value;
}

function isPayPalTokenPayload(value: unknown): value is PayPalTokenPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const payload = value as Record<string, unknown>;
  return (
    typeof payload.access_token === "string" &&
    payload.access_token.length > 0 &&
    typeof payload.expires_in === "number" &&
    Number.isFinite(payload.expires_in) &&
    payload.expires_in > 0
  );
}

function toBasicAuthorizationValue(config: PayPalSandboxConfig): string {
  return Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
    "utf8",
  ).toString("base64");
}
