import { describe, expect, it } from "vitest";

import { GET as health } from "../../../src/app/api/health/route";
import { GET as readiness } from "../../../src/app/api/readiness/route";

describe("operational health routes", () => {
  it("keeps liveness minimal and non-sensitive", async () => {
    const response = await health();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("distinguishes database, Orders configuration, and unverified reporting without leaking configuration", async () => {
    const response = await readiness();
    const payload = await response.json() as { checks: Record<string, unknown> };
    expect(payload.checks).toMatchObject({ paypalReporting: "not_verified" });
    expect(["ready", "not_configured", "unavailable"]).toContain(payload.checks.database);
    expect(["configured", "unavailable"]).toContain(payload.checks.paypalOrders);
    expect(JSON.stringify(payload)).not.toContain("CLIENT_SECRET");
    expect(JSON.stringify(payload)).not.toContain("access_token");
  });
});
