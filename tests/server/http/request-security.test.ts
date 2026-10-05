import { describe, expect, it } from "vitest";

import { POST as createSandboxVerification } from "../../../src/app/api/actions/sandbox-verification/route";
import { GET as dashboard } from "../../../src/app/api/dashboard/route";
import { MAX_API_BODY_BYTES, parseBoundedJson, RequestBodyTooLargeError } from "../../../src/server/http/request";

describe("API authentication and bounded-input boundary", () => {
  it("rejects an unauthenticated read before loading merchant data", async () => {
    const response = await dashboard(new Request("http://localhost/api/dashboard?source=demo"));
    expect(response.status).toBe(401);
    expect(response.headers.get("x-request-id")).toBeTruthy();
    await expect(response.json()).resolves.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("allows test-only injected actors only in tests and denies viewer mutations", async () => {
    const response = await createSandboxVerification(new Request("http://localhost/api/actions/sandbox-verification", {
      method: "POST", headers: { "x-paypulse-test-auth": "viewer" },
    }));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ code: "AUTHORIZATION_DENIED" });
  });

  it("rejects chunked-style oversized JSON even when Content-Length is absent", async () => {
    const request = new Request("http://localhost/api/test", { method: "POST", body: JSON.stringify({ data: "x".repeat(MAX_API_BODY_BYTES) }) });
    await expect(parseBoundedJson(request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
