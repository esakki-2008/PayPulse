import nextEnvironment from "@next/env";

import { assertServerRuntime } from "../runtime";

assertServerRuntime("PayPal Sandbox CLI environment loader");

const silentEnvironmentLog = {
  info: (): void => undefined,
  // A malformed local environment file must not cause its contents to appear in
  // terminal output. The subsequent configuration check reports only safe keys.
  error: (): void => undefined,
};

/**
 * Loads Next.js-compatible local environment files for a standalone server CLI.
 *
 * `next dev` performs this work automatically, whereas `tsx` does not. This
 * loader intentionally runs before importing the OAuth/connectivity modules so
 * their server-side configuration reads the populated process environment. It
 * follows Next's precedence rules: pre-existing shell variables are retained
 * and `.env.local` is considered for normal development/production CLI runs.
 */
export function loadPayPalSandboxCliEnvironment(
  projectDirectory: string = process.cwd(),
): void {
  nextEnvironment.loadEnvConfig(
    projectDirectory,
    process.env.NODE_ENV === "development",
    silentEnvironmentLog,
    true,
  );
}
