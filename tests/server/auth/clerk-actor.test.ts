import { afterEach, describe, expect, it } from "vitest";

import {
  AuthorizationError,
  actorFromClerkSession,
  payPulseRoleForClerkOrganizationRole,
} from "../../../src/server/auth/auth";
import { productionReadiness } from "../../../src/server/runtime-config";

const relevantEnvironment = [
  "DATABASE_URL",
  "PAYPULSE_AUTH_MODE",
  "CLERK_SECRET_KEY",
  "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
] as const;
const originalEnvironment = Object.fromEntries(relevantEnvironment.map((name) => [name, process.env[name]]));

afterEach(() => {
  for (const name of relevantEnvironment) {
    const original = originalEnvironment[name];
    if (original === undefined) delete process.env[name];
    else process.env[name] = original;
  }
});

describe("Clerk authenticated actor boundary", () => {
  it("derives merchant and role exclusively from a signed-in Clerk user and active Organization", () => {
    expect(actorFromClerkSession({ userId: "user_clerk", orgId: "org_merchant", orgRole: "org:admin" })).toEqual({
      actorId: "user_clerk",
      merchantId: "org_merchant",
      role: "owner",
      provider: "external",
    });
    expect(actorFromClerkSession({ userId: "user_clerk", orgId: "org_merchant", orgRole: "org:operator" })).toMatchObject({
      merchantId: "org_merchant",
      role: "operator",
    });
  });

  it("fails closed without a Clerk user or active Organization", () => {
    expect(actorFromClerkSession({ userId: null, orgId: "org_merchant", orgRole: "org:admin" })).toBeNull();
    expect(() => actorFromClerkSession({ userId: "user_clerk", orgId: null, orgRole: "org:admin" }))
      .toThrow(AuthorizationError);
  });

  it("keeps Clerk members and unrecognized Organization roles least-privilege", () => {
    expect(payPulseRoleForClerkOrganizationRole("org:member")).toBe("viewer");
    expect(payPulseRoleForClerkOrganizationRole("org:untrusted-custom-role")).toBe("viewer");
    expect(payPulseRoleForClerkOrganizationRole(null)).toBe("viewer");
  });

  it("reports Clerk configuration readiness without exposing configuration values", () => {
    process.env.DATABASE_URL = "postgresql://configured";
    process.env.PAYPULSE_AUTH_MODE = "external";
    delete process.env.CLERK_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;

    expect(productionReadiness()).toEqual({ ready: false, failures: ["clerk_auth_not_configured"] });

    process.env.CLERK_SECRET_KEY = "configured-server-key";
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = "configured-public-key";
    expect(productionReadiness()).toEqual({ ready: true, failures: [] });
  });
});
