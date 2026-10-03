import { loadPayPalSandboxCliEnvironment } from "../src/server/paypal/cli-environment.js";

// Unlike Next.js, a standalone tsx process does not load .env.local itself.
// Load it before importing any OAuth/configuration code; no values are printed.
loadPayPalSandboxCliEnvironment();

const { verifyPayPalSandboxConnectivity } = await import(
  "../src/server/paypal/connectivity.js"
);
const report = await verifyPayPalSandboxConnectivity();

// The report type intentionally excludes credentials, authorization headers,
// raw provider responses, and the OAuth access token.
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

if (!report.authenticationRequestSucceeded) {
  process.exitCode = 1;
}
