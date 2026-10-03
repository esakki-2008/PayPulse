import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { afterEach, describe, expect, it } from "vitest";

const execFile = promisify(execFileCallback);
const require = createRequire(import.meta.url);
const tsxLoader = pathToFileURL(require.resolve("tsx")).href;
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe("PayPal Sandbox standalone CLI environment", () => {
  it("loads a local .env.local before configuration without printing its values", async () => {
    const projectDirectory = await mkdtemp(join(tmpdir(), "paypulse-cli-env-"));
    temporaryDirectories.push(projectDirectory);
    const syntheticClientId = "cli-unit-client-id";
    const syntheticClientSecret = "cli-unit-secret-not-for-output";
    await writeFile(
      join(projectDirectory, ".env.local"),
      `PAYPAL_CLIENT_ID=${syntheticClientId}\nPAYPAL_CLIENT_SECRET=${syntheticClientSecret}\nPAYPAL_ENVIRONMENT=sandbox\n`,
      "utf8",
    );

    const moduleUrl = pathToFileURL(join(repositoryRoot, "src/server/paypal/cli-environment.ts")).href;
    const configUrl = pathToFileURL(join(repositoryRoot, "src/server/paypal/config.ts")).href;
    const probe = `
      import { loadPayPalSandboxCliEnvironment } from ${JSON.stringify(moduleUrl)};
      import { getPayPalSandboxConfig } from ${JSON.stringify(configUrl)};
      loadPayPalSandboxCliEnvironment(process.cwd());
      const config = getPayPalSandboxConfig();
      process.stdout.write(JSON.stringify({
        endpoint: config.apiBaseUrl,
        environment: config.environment,
        clientConfigured: Boolean(config.clientId),
        secretConfigured: Boolean(config.clientSecret),
      }));
    `;
    const environment: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "development" };
    delete environment.PAYPAL_CLIENT_ID;
    delete environment.PAYPAL_CLIENT_SECRET;
    delete environment.PAYPAL_ENVIRONMENT;
    delete environment.__NEXT_PROCESSED_ENV;

    const { stdout, stderr } = await execFile(
      process.execPath,
      ["--import", tsxLoader, "--input-type=module", "--eval", probe],
      { cwd: projectDirectory, env: environment },
    );

    expect(JSON.parse(stdout)).toEqual({
      endpoint: "https://api-m.sandbox.paypal.com",
      environment: "sandbox",
      clientConfigured: true,
      secretConfigured: true,
    });
    expect(stdout).not.toContain(syntheticClientId);
    expect(stdout).not.toContain(syntheticClientSecret);
    expect(stderr).toBe("");
  });
});
