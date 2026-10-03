import nextEnvironment from "@next/env";

import { assertServerRuntime } from "../runtime";

assertServerRuntime("PayPal Sandbox CLI environment loader");

const silentEnvironmentLog = {
  info: (): void => undefined,
  // A malformed local environment file must not cause its contents to appear in
  // terminal output. The subsequent configuration check reports only safe keys.
  error: (): void => undefined,
};

export interface PayPalSandboxEnvironmentLoadOptions {
  /**
   * Vitest deliberately excludes `.env.local` while NODE_ENV is `test`. The
   * credential-gated integration suites opt in so local Sandbox verification
   * follows the same explicit mechanism as the standalone CLI. Unit tests do
   * not use this option.
   */
  readonly includeLocalEnvironmentInTest?: boolean;
}

/**
 * Loads Next.js-compatible local environment files for a standalone server CLI.
 *
 * `next dev` performs this work automatically, whereas `tsx` and Vitest do not.
 * This loader intentionally runs before importing OAuth/configuration modules so
 * their server-side configuration reads the populated process environment. It
 * follows Next's precedence rules: pre-existing shell variables are retained
 * and `.env.local` is considered for normal development/production CLI runs.
 */
export function loadPayPalSandboxCliEnvironment(
  projectDirectory: string = process.cwd(),
  options: PayPalSandboxEnvironmentLoadOptions = {},
): void {
  const originalNodeEnvironment = process.env.NODE_ENV;
  const loadLocalEnvironmentForIntegrationTest =
    originalNodeEnvironment === "test" && options.includeLocalEnvironmentInTest;

  // @next/env intentionally ignores .env.local under NODE_ENV=test to keep
  // ordinary unit tests deterministic. Integration suites are an explicit,
  // credential-gated exception and execute in a dedicated test worker.
  if (loadLocalEnvironmentForIntegrationTest) {
    Reflect.set(process.env, "NODE_ENV", "development");
    // If another server module initialized @next/env first, update its snapshot
    // before loadEnvConfig restores that snapshot internally.
    nextEnvironment.updateInitialEnv({ NODE_ENV: "development" });
  }

  try {
    nextEnvironment.loadEnvConfig(
      projectDirectory,
      process.env.NODE_ENV === "development",
      silentEnvironmentLog,
      true,
    );
  } finally {
    if (loadLocalEnvironmentForIntegrationTest) {
      if (originalNodeEnvironment === undefined) Reflect.deleteProperty(process.env, "NODE_ENV");
      else Reflect.set(process.env, "NODE_ENV", originalNodeEnvironment);
      // loadEnvConfig snapshots process.env on first use. Restore this one
      // temporary mode value too, so another suite cannot inherit development.
      nextEnvironment.updateInitialEnv({ NODE_ENV: originalNodeEnvironment });
    }
  }
}
