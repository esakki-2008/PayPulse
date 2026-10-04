import { env as processEnv } from "node:process";

import { z } from "zod";

import { assertServerRuntime } from "../runtime";

assertServerRuntime("PayPal Sandbox configuration");

/** PayPulse deliberately supports Sandbox only during Phase 2. */
export const PAYPAL_SANDBOX_API_BASE_URL = "https://api-m.sandbox.paypal.com" as const;

const rawPayPalEnvironmentSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().trim().min(1),
  PAYPAL_CLIENT_SECRET: z.string().trim().min(1),
  PAYPAL_ENVIRONMENT: z.literal("sandbox"),
});

const sandboxOrderEnvironmentSchema = rawPayPalEnvironmentSchema.extend({
  PAYPAL_SANDBOX_ORDER_AMOUNT: z.string().trim().regex(/^\d+(?:\.\d{1,2})?$/),
  PAYPAL_SANDBOX_ORDER_CURRENCY: z.string().trim().regex(/^[A-Z]{3}$/),
  PAYPAL_SANDBOX_RETURN_URL: z.string().url(),
  PAYPAL_SANDBOX_CANCEL_URL: z.string().url(),
});

export type EnvironmentVariables = Readonly<Record<string, string | undefined>>;

export interface PayPalSandboxConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly environment: "sandbox";
  readonly apiBaseUrl: typeof PAYPAL_SANDBOX_API_BASE_URL;
}

/**
 * A fixed, server-only test checkout configuration. It is deliberately not an
 * action, browser, or API parameter, so a client cannot choose an amount,
 * currency, redirect target, or funding resource.
 */
export interface PayPalSandboxOrderConfig extends PayPalSandboxConfig {
  readonly amount: string;
  readonly currency: string;
  readonly returnUrl: string;
  readonly cancelUrl: string;
}

export class PayPalConfigurationError extends Error {
  override readonly name = "PayPalConfigurationError";
}

/**
 * Returns validated, server-only PayPal configuration.
 *
 * The API base URL is intentionally not configurable: allowing a runtime URL
 * override could accidentally permit a live PayPal endpoint.
 */
export function getPayPalSandboxConfig(
  environment: EnvironmentVariables = processEnv,
): PayPalSandboxConfig {
  const result = rawPayPalEnvironmentSchema.safeParse({
    PAYPAL_CLIENT_ID: environment.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: environment.PAYPAL_CLIENT_SECRET,
    PAYPAL_ENVIRONMENT: environment.PAYPAL_ENVIRONMENT,
  });

  if (!result.success) {
    const invalidVariables = [
      ...new Set(result.error.issues.map((issue) => issue.path.join("."))),
    ];

    // Do not include environment values in this error. They may contain secrets.
    throw new PayPalConfigurationError(
      `PayPal Sandbox configuration is invalid. Check: ${invalidVariables.join(", ")}.`,
    );
  }

  return {
    clientId: result.data.PAYPAL_CLIENT_ID,
    clientSecret: result.data.PAYPAL_CLIENT_SECRET,
    environment: result.data.PAYPAL_ENVIRONMENT,
    apiBaseUrl: PAYPAL_SANDBOX_API_BASE_URL,
  };
}

/**
 * Loads the opt-in fixed Sandbox checkout fixture. A missing or malformed value
 * closes the write capability; values are never included in configuration
 * errors because the base OAuth configuration includes a secret.
 */
export function getPayPalSandboxOrderConfig(
  environment: EnvironmentVariables = processEnv,
): PayPalSandboxOrderConfig {
  const result = sandboxOrderEnvironmentSchema.safeParse({
    PAYPAL_CLIENT_ID: environment.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: environment.PAYPAL_CLIENT_SECRET,
    PAYPAL_ENVIRONMENT: environment.PAYPAL_ENVIRONMENT,
    PAYPAL_SANDBOX_ORDER_AMOUNT: environment.PAYPAL_SANDBOX_ORDER_AMOUNT,
    PAYPAL_SANDBOX_ORDER_CURRENCY: environment.PAYPAL_SANDBOX_ORDER_CURRENCY,
    PAYPAL_SANDBOX_RETURN_URL: environment.PAYPAL_SANDBOX_RETURN_URL,
    PAYPAL_SANDBOX_CANCEL_URL: environment.PAYPAL_SANDBOX_CANCEL_URL,
  });
  if (!result.success) {
    const invalidVariables = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new PayPalConfigurationError(
      `PayPal Sandbox checkout configuration is invalid. Check: ${invalidVariables.join(", ")}.`,
    );
  }
  const amount = Number.parseFloat(result.data.PAYPAL_SANDBOX_ORDER_AMOUNT);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000) {
    throw new PayPalConfigurationError("PayPal Sandbox checkout configuration is invalid. Check: PAYPAL_SANDBOX_ORDER_AMOUNT.");
  }
  const returnUrl = validateSandboxRedirectUrl(result.data.PAYPAL_SANDBOX_RETURN_URL, "PAYPAL_SANDBOX_RETURN_URL");
  const cancelUrl = validateSandboxRedirectUrl(result.data.PAYPAL_SANDBOX_CANCEL_URL, "PAYPAL_SANDBOX_CANCEL_URL");
  return {
    clientId: result.data.PAYPAL_CLIENT_ID,
    clientSecret: result.data.PAYPAL_CLIENT_SECRET,
    environment: "sandbox",
    apiBaseUrl: PAYPAL_SANDBOX_API_BASE_URL,
    amount: result.data.PAYPAL_SANDBOX_ORDER_AMOUNT,
    currency: result.data.PAYPAL_SANDBOX_ORDER_CURRENCY,
    returnUrl,
    cancelUrl,
  };
}

function validateSandboxRedirectUrl(value: string, variable: string): string {
  const url = new URL(value);
  const localhost = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !(localhost && url.protocol === "http:")) || url.username || url.password || url.hash) {
    throw new PayPalConfigurationError(`PayPal Sandbox checkout configuration is invalid. Check: ${variable}.`);
  }
  return url.toString();
}
