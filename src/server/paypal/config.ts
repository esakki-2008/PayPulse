import { env as processEnv } from "node:process";

import { z } from "zod";

import { assertServerRuntime } from "../runtime.js";

assertServerRuntime("PayPal Sandbox configuration");

/** PayPulse deliberately supports Sandbox only during Phase 2. */
export const PAYPAL_SANDBOX_API_BASE_URL = "https://api-m.sandbox.paypal.com" as const;

const rawPayPalEnvironmentSchema = z.object({
  PAYPAL_CLIENT_ID: z.string().trim().min(1),
  PAYPAL_CLIENT_SECRET: z.string().trim().min(1),
  PAYPAL_ENVIRONMENT: z.literal("sandbox"),
});

export interface PayPalSandboxConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly environment: "sandbox";
  readonly apiBaseUrl: typeof PAYPAL_SANDBOX_API_BASE_URL;
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
  environment: NodeJS.ProcessEnv = processEnv,
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
